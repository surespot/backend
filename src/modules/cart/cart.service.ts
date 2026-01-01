import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { CartRepository } from './cart.repository';
import { FoodItemsRepository } from '../food-items/food-items.repository';
import { PromotionsService } from '../promotions/promotions.service';
import { AddItemToCartDto } from './dto/add-item-to-cart.dto';
import { CartDocument } from './schemas/cart.schema';
import { CartItemDocument } from './schemas/cart-item.schema';
import { CartExtraDocument } from './schemas/cart-extra.schema';

export interface CartExtraResponse {
  id: string;
  foodExtraId: string;
  name: string;
  description?: string;
  price: number;
  formattedPrice: string;
  currency: string;
  quantity: number;
}

export interface CartItemResponse {
  id: string;
  foodItemId: string;
  name: string;
  description: string;
  slug: string;
  price: number;
  formattedPrice: string;
  currency: string;
  imageUrl: string;
  quantity: number;
  extras: CartExtraResponse[];
  subtotal: number;
  extrasTotal: number;
  lineTotal: number;
  estimatedTime: {
    min: number;
    max: number;
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface CartResponse {
  id: string;
  userId: string;
  items: CartItemResponse[];
  subtotal: number;
  extrasTotal: number;
  discountAmount: number;
  discountPercent?: number;
  promoCode?: string;
  total: number;
  formattedTotal: string;
  itemCount: number;
  extrasCount: number;
  createdAt?: string;
  updatedAt?: string;
}

@Injectable()
export class CartService {
  constructor(
    private readonly cartRepository: CartRepository,
    private readonly foodItemsRepository: FoodItemsRepository,
    private readonly promotionsService: PromotionsService,
  ) {}

  private formatPrice(price: number, currency: string = 'NGN'): string {
    if (price === 0) return 'Free';
    const amount = price / 100;
    return `₦${amount.toLocaleString('en-NG')}`;
  }

  private async formatCart(cart: CartDocument): Promise<CartResponse> {
    const cartItems = await this.cartRepository.findCartItemsByCartId(
      cart._id.toString(),
    );

    const items: CartItemResponse[] = await Promise.all(
      cartItems.map(async (item) => this.formatCartItem(item)),
    );

    return {
      id: cart._id.toString(),
      userId: cart.userId.toString(),
      items,
      subtotal: cart.subtotal,
      extrasTotal: cart.extrasTotal,
      discountAmount: cart.discountAmount,
      discountPercent: cart.discountPercent,
      promoCode: cart.promoCode,
      total: cart.total,
      formattedTotal: this.formatPrice(cart.total),
      itemCount: cart.itemCount,
      extrasCount: cart.extrasCount,
      createdAt: cart.createdAt?.toISOString(),
      updatedAt: cart.updatedAt?.toISOString(),
    };
  }

  private async formatCartItem(
    item: CartItemDocument,
  ): Promise<CartItemResponse> {
    const extras = await this.cartRepository.findExtrasByCartItemId(
      item._id.toString(),
    );

    return {
      id: item._id.toString(),
      foodItemId: item.foodItemId.toString(),
      name: item.name,
      description: item.description,
      slug: item.slug,
      price: item.price,
      formattedPrice: this.formatPrice(item.price, item.currency),
      currency: item.currency,
      imageUrl: item.imageUrl,
      quantity: item.quantity,
      extras: extras.map((extra) => this.formatCartExtra(extra)),
      subtotal: item.subtotal,
      extrasTotal: item.extrasTotal,
      lineTotal: item.lineTotal,
      estimatedTime: item.estimatedTime,
      createdAt: item.createdAt?.toISOString(),
      updatedAt: item.updatedAt?.toISOString(),
    };
  }

  private formatCartExtra(extra: CartExtraDocument): CartExtraResponse {
    return {
      id: extra._id.toString(),
      foodExtraId: extra.foodExtraId.toString(),
      name: extra.name,
      description: extra.description,
      price: extra.price,
      formattedPrice: this.formatPrice(extra.price, extra.currency),
      currency: extra.currency,
      quantity: extra.quantity,
    };
  }

  /**
   * Get or create cart for a user
   */
  async getCart(userId: string) {
    let cart = await this.cartRepository.findCartByUserId(userId);

    if (!cart) {
      cart = await this.cartRepository.createCart(userId);
    } else {
      // Refresh cart expiry on access
      await this.cartRepository.refreshCartExpiry(cart._id.toString());
    }

    return {
      success: true,
      message: 'Cart retrieved successfully',
      data: await this.formatCart(cart),
    };
  }

  /**
   * Add item to cart
   * If item with same foodItemId already exists, check if extras match
   * If extras match, increment quantity. Otherwise, add as new item.
   */
  async addItem(userId: string, dto: AddItemToCartDto) {
    // Get or create cart
    let cart = await this.cartRepository.findCartByUserId(userId);
    if (!cart) {
      cart = await this.cartRepository.createCart(userId);
    }

    // Validate food item exists and is available
    const foodItem = await this.foodItemsRepository.findById(dto.foodItemId);
    if (!foodItem) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'FOOD_ITEM_NOT_FOUND',
          message: 'Food item not found',
        },
      });
    }

    if (!foodItem.isActive || !foodItem.isAvailable) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'ITEM_NOT_AVAILABLE',
          message: 'This item is currently not available',
        },
      });
    }

    // Validate extras if provided
    const extrasData: Array<{
      foodExtraId: string;
      name: string;
      description?: string;
      price: number;
      currency: string;
      quantity: number;
    }> = [];

    if (dto.extras && dto.extras.length > 0) {
      // Get food item with populated extras
      const populatedFoodItem = await this.foodItemsRepository.findById(
        dto.foodItemId,
        true, // populateExtras
      );

      const availableExtrasIds =
        populatedFoodItem?.extras?.map((e: any) => e._id?.toString()) || [];

      for (const extraDto of dto.extras) {
        // Check if extra is available for this food item
        if (!availableExtrasIds.includes(extraDto.foodExtraId)) {
          throw new BadRequestException({
            success: false,
            error: {
              code: 'EXTRA_NOT_AVAILABLE',
              message: `Extra ${extraDto.foodExtraId} is not available for this food item`,
            },
          });
        }

        // Get extra details
        const extra = await this.foodItemsRepository.findExtraById(
          extraDto.foodExtraId,
        );
        if (!extra || !extra.isAvailable) {
          throw new BadRequestException({
            success: false,
            error: {
              code: 'EXTRA_NOT_AVAILABLE',
              message: 'One or more extras are not available',
            },
          });
        }

        extrasData.push({
          foodExtraId: extra._id.toString(),
          name: extra.name,
          description: extra.description,
          price: extra.price,
          currency: extra.currency,
          quantity: extraDto.quantity || 1,
        });
      }
    }

    // Check if same item with same extras already exists in cart
    const existingItem = await this.findMatchingCartItem(
      cart._id.toString(),
      dto.foodItemId,
      extrasData.map((e) => ({
        foodExtraId: e.foodExtraId,
        quantity: e.quantity,
      })),
    );

    const quantity = dto.quantity || 1;

    if (existingItem) {
      // Update quantity of existing item
      const newQuantity = Math.min(existingItem.quantity + quantity, 99);
      await this.updateItemQuantity(
        userId,
        existingItem._id.toString(),
        newQuantity,
      );
    } else {
      // Calculate item totals
      const subtotal = foodItem.price * quantity;
      const extrasTotal =
        extrasData.reduce((sum, e) => sum + e.price * e.quantity, 0) * quantity;
      const lineTotal = subtotal + extrasTotal;

      // Create new cart item
      const cartItem = await this.cartRepository.createCartItem({
        cartId: cart._id.toString(),
        foodItemId: dto.foodItemId,
        name: foodItem.name,
        description: foodItem.description,
        slug: foodItem.slug,
        price: foodItem.price,
        currency: foodItem.currency,
        imageUrl: foodItem.imageUrl,
        quantity,
        estimatedTime: foodItem.estimatedTime,
        subtotal,
        extrasTotal,
        lineTotal,
      });

      // Create cart extras
      for (const extraData of extrasData) {
        await this.cartRepository.createCartExtra({
          cartItemId: cartItem._id.toString(),
          foodExtraId: extraData.foodExtraId,
          name: extraData.name,
          description: extraData.description,
          price: extraData.price,
          currency: extraData.currency,
          quantity: extraData.quantity,
        });
      }
    }

    // Recalculate cart totals
    await this.recalculateCartTotals(cart._id.toString());

    // Refresh cart expiry
    await this.cartRepository.refreshCartExpiry(cart._id.toString());

    // Get updated cart
    const updatedCart = await this.cartRepository.findCartByUserId(userId);

    return {
      success: true,
      message: 'Item added to cart',
      data: await this.formatCart(updatedCart!),
    };
  }

  /**
   * Find a cart item with matching food item ID and extras
   */
  private async findMatchingCartItem(
    cartId: string,
    foodItemId: string,
    extras: Array<{ foodExtraId: string; quantity: number }>,
  ): Promise<CartItemDocument | null> {
    const cartItems = await this.cartRepository.findCartItemsByCartId(cartId);

    for (const item of cartItems) {
      if (item.foodItemId.toString() !== foodItemId) continue;

      const itemExtras = await this.cartRepository.findExtrasByCartItemId(
        item._id.toString(),
      );

      // Check if extras match
      if (itemExtras.length !== extras.length) continue;

      const extrasMatch = extras.every((e) =>
        itemExtras.some(
          (ie) =>
            ie.foodExtraId.toString() === e.foodExtraId &&
            ie.quantity === e.quantity,
        ),
      );

      if (extrasMatch) {
        return item;
      }
    }

    return null;
  }

  /**
   * Update cart item quantity
   * If quantity is 0, remove the item
   */
  async updateItemQuantity(userId: string, itemId: string, quantity: number) {
    const cart = await this.cartRepository.findCartByUserId(userId);
    if (!cart) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'CART_NOT_FOUND',
          message: 'Cart not found',
        },
      });
    }

    const cartItem = await this.cartRepository.findCartItemById(itemId);
    if (!cartItem || cartItem.cartId.toString() !== cart._id.toString()) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'CART_ITEM_NOT_FOUND',
          message: 'Cart item not found',
        },
      });
    }

    if (quantity === 0) {
      // Remove item
      await this.cartRepository.deleteCartItem(itemId);
    } else {
      // Get extras total per quantity
      const extras = await this.cartRepository.findExtrasByCartItemId(itemId);
      const extrasPerItem = extras.reduce(
        (sum, e) => sum + e.price * e.quantity,
        0,
      );

      // Update item
      const subtotal = cartItem.price * quantity;
      const extrasTotal = extrasPerItem * quantity;
      const lineTotal = subtotal + extrasTotal;

      await this.cartRepository.updateCartItem(itemId, {
        quantity,
        subtotal,
        extrasTotal,
        lineTotal,
      });
    }

    // Recalculate cart totals
    await this.recalculateCartTotals(cart._id.toString());

    // Refresh cart expiry
    await this.cartRepository.refreshCartExpiry(cart._id.toString());

    // Get updated cart
    const updatedCart = await this.cartRepository.findCartByUserId(userId);

    return {
      success: true,
      message: quantity === 0 ? 'Item removed from cart' : 'Cart item updated',
      data: await this.formatCart(updatedCart!),
    };
  }

  /**
   * Remove item from cart
   */
  async removeItem(userId: string, itemId: string) {
    return this.updateItemQuantity(userId, itemId, 0);
  }

  /**
   * Clear all items from cart
   */
  async clearCart(userId: string) {
    const cart = await this.cartRepository.findCartByUserId(userId);
    if (!cart) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'CART_NOT_FOUND',
          message: 'Cart not found',
        },
      });
    }

    // Delete all cart items (this also deletes extras)
    await this.cartRepository.deleteAllCartItems(cart._id.toString());

    // Reset cart totals and remove promo
    await this.cartRepository.updateCart(cart._id.toString(), {
      subtotal: 0,
      extrasTotal: 0,
      discountAmount: 0,
      total: 0,
      itemCount: 0,
      extrasCount: 0,
    });
    await this.cartRepository.clearCartPromo(cart._id.toString());

    // Get updated cart
    const updatedCart = await this.cartRepository.findCartByUserId(userId);

    return {
      success: true,
      message: 'Cart cleared',
      data: await this.formatCart(updatedCart!),
    };
  }

  /**
   * Apply promo code to cart
   */
  async applyPromoCode(userId: string, code: string) {
    const cart = await this.cartRepository.findCartByUserId(userId);
    if (!cart) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'CART_NOT_FOUND',
          message: 'Cart not found',
        },
      });
    }

    if (cart.itemCount === 0) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'CART_EMPTY',
          message: 'Cannot apply promo code to empty cart',
        },
      });
    }

    // Calculate cart total before discount
    const cartTotalBeforeDiscount = cart.subtotal + cart.extrasTotal;

    // Validate promo code
    const validation = await this.promotionsService.validateDiscountCode(
      code,
      cartTotalBeforeDiscount,
    );

    if (!validation.valid) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'PROMO_CODE_INVALID',
          message: validation.message || 'Invalid promo code',
        },
      });
    }

    // Apply discount
    const discountAmount = validation.discountAmount || 0;
    const total = Math.max(0, cartTotalBeforeDiscount - discountAmount);

    await this.cartRepository.updateCart(cart._id.toString(), {
      promoCode: code.toUpperCase(),
      promotionId: validation.promotion?.id,
      discountAmount,
      discountPercent: validation.promotion?.discountValue,
      total,
    });

    // Get updated cart
    const updatedCart = await this.cartRepository.findCartByUserId(userId);

    return {
      success: true,
      message: 'Promo code applied successfully',
      data: {
        cart: await this.formatCart(updatedCart!),
        promoCode: {
          code: code.toUpperCase(),
          discountPercent: validation.promotion?.discountValue,
          discountAmount,
        },
      },
    };
  }

  /**
   * Remove promo code from cart
   */
  async removePromoCode(userId: string) {
    const cart = await this.cartRepository.findCartByUserId(userId);
    if (!cart) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'CART_NOT_FOUND',
          message: 'Cart not found',
        },
      });
    }

    // Remove promo and recalculate total
    await this.cartRepository.clearCartPromo(cart._id.toString());
    await this.recalculateCartTotals(cart._id.toString());

    // Get updated cart
    const updatedCart = await this.cartRepository.findCartByUserId(userId);

    return {
      success: true,
      message: 'Promo code removed',
      data: await this.formatCart(updatedCart!),
    };
  }

  /**
   * Recalculate cart totals
   */
  private async recalculateCartTotals(cartId: string): Promise<void> {
    const cartItems = await this.cartRepository.findCartItemsByCartId(cartId);

    let subtotal = 0;
    let extrasTotal = 0;
    let itemCount = 0;
    let extrasCount = 0;

    for (const item of cartItems) {
      subtotal += item.subtotal;
      extrasTotal += item.extrasTotal;
      itemCount += item.quantity;

      const extras = await this.cartRepository.findExtrasByCartItemId(
        item._id.toString(),
      );
      extrasCount += extras.reduce(
        (sum, e) => sum + e.quantity * item.quantity,
        0,
      );
    }

    // Get current cart to check for promo
    const cart = await this.cartRepository.findCartById(cartId);
    let discountAmount = 0;
    let total = subtotal + extrasTotal;

    // Reapply promo if exists
    let discountPercent: number | undefined;
    if (cart?.promoCode && cart.promoCode.length > 0) {
      const validation = await this.promotionsService.validateDiscountCode(
        cart.promoCode,
        total,
      );
      if (validation.valid) {
        discountAmount = validation.discountAmount || 0;
        discountPercent = validation.promotion?.discountValue;
        total = Math.max(0, total - discountAmount);
      } else {
        // Promo no longer valid, remove it
        await this.cartRepository.clearCartPromo(cartId);
        discountAmount = 0;
        discountPercent = undefined;
      }
    }

    await this.cartRepository.updateCart(cartId, {
      subtotal,
      extrasTotal,
      discountAmount,
      discountPercent,
      total,
      itemCount,
      extrasCount,
    });
  }

  /**
   * Get cart for internal use (for orders)
   */
  async getCartForCheckout(userId: string): Promise<{
    cart: CartDocument;
    items: CartItemDocument[];
    extras: Map<string, CartExtraDocument[]>;
  } | null> {
    const cart = await this.cartRepository.findCartByUserId(userId);
    if (!cart) return null;

    const items = await this.cartRepository.findCartItemsByCartId(
      cart._id.toString(),
    );

    const extras = new Map<string, CartExtraDocument[]>();
    for (const item of items) {
      const itemExtras = await this.cartRepository.findExtrasByCartItemId(
        item._id.toString(),
      );
      extras.set(item._id.toString(), itemExtras);
    }

    return { cart, items, extras };
  }

  /**
   * Clear cart after order placement
   */
  async clearCartAfterOrder(userId: string): Promise<void> {
    const cart = await this.cartRepository.findCartByUserId(userId);
    if (cart) {
      await this.cartRepository.deleteAllCartItems(cart._id.toString());
      await this.cartRepository.updateCart(cart._id.toString(), {
        subtotal: 0,
        extrasTotal: 0,
        discountAmount: 0,
        total: 0,
        itemCount: 0,
        extrasCount: 0,
      });
      await this.cartRepository.clearCartPromo(cart._id.toString());
    }
  }
}

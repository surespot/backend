import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, ClientSession } from 'mongoose';
import { Cart, CartDocument } from './schemas/cart.schema';
import { CartItem, CartItemDocument } from './schemas/cart-item.schema';
import { CartExtra, CartExtraDocument } from './schemas/cart-extra.schema';

@Injectable()
export class CartRepository {
  constructor(
    @InjectModel(Cart.name)
    private cartModel: Model<CartDocument>,
    @InjectModel(CartItem.name)
    private cartItemModel: Model<CartItemDocument>,
    @InjectModel(CartExtra.name)
    private cartExtraModel: Model<CartExtraDocument>,
  ) {}

  private validateObjectId(id: string, fieldName: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'INVALID_ID',
          message: `Invalid ${fieldName} format`,
        },
      });
    }
  }

  // ============ Cart Operations ============

  async findCartByUserId(userId: string): Promise<CartDocument | null> {
    this.validateObjectId(userId, 'userId');
    return this.cartModel
      .findOne({ userId: new Types.ObjectId(userId) })
      .exec();
  }

  async findCartById(cartId: string): Promise<CartDocument | null> {
    this.validateObjectId(cartId, 'cartId');
    return this.cartModel.findById(cartId).exec();
  }

  async createCart(userId: string): Promise<CartDocument> {
    this.validateObjectId(userId, 'userId');

    // Set expiry to 1 month from now
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 1);

    const cart = new this.cartModel({
      userId: new Types.ObjectId(userId),
      subtotal: 0,
      extrasTotal: 0,
      discountAmount: 0,
      total: 0,
      itemCount: 0,
      extrasCount: 0,
      expiresAt,
    });
    return cart.save();
  }

  async updateCart(
    cartId: string,
    data: Partial<{
      subtotal: number;
      extrasTotal: number;
      discountAmount: number;
      discountPercent: number;
      promoCode: string;
      promotionId: string;
      total: number;
      itemCount: number;
      extrasCount: number;
      expiresAt: Date;
    }>,
    session?: ClientSession,
  ): Promise<CartDocument | null> {
    this.validateObjectId(cartId, 'cartId');

    const updateData: Record<string, unknown> = {};

    if (data.subtotal !== undefined) updateData.subtotal = data.subtotal;
    if (data.extrasTotal !== undefined)
      updateData.extrasTotal = data.extrasTotal;
    if (data.discountAmount !== undefined)
      updateData.discountAmount = data.discountAmount;
    if (data.discountPercent !== undefined)
      updateData.discountPercent = data.discountPercent;
    if (data.promoCode !== undefined) updateData.promoCode = data.promoCode;
    if (data.total !== undefined) updateData.total = data.total;
    if (data.itemCount !== undefined) updateData.itemCount = data.itemCount;
    if (data.extrasCount !== undefined)
      updateData.extrasCount = data.extrasCount;
    if (data.expiresAt !== undefined) updateData.expiresAt = data.expiresAt;

    if (data.promotionId !== undefined) {
      updateData.promotionId = data.promotionId
        ? new Types.ObjectId(data.promotionId)
        : null;
    }

    const options = session ? { new: true, session } : { new: true };
    return this.cartModel
      .findByIdAndUpdate(cartId, { $set: updateData }, options)
      .exec();
  }

  async clearCartPromo(cartId: string): Promise<CartDocument | null> {
    this.validateObjectId(cartId, 'cartId');
    return this.cartModel
      .findByIdAndUpdate(
        cartId,
        {
          $unset: { promoCode: '', promotionId: '', discountPercent: '' },
          $set: { discountAmount: 0 },
        },
        { new: true },
      )
      .exec();
  }

  async deleteCart(cartId: string): Promise<boolean> {
    this.validateObjectId(cartId, 'cartId');

    // Delete all cart items and extras first
    const cartItems = await this.cartItemModel
      .find({ cartId: new Types.ObjectId(cartId) })
      .exec();
    const cartItemIds = cartItems.map((item) => item._id);

    if (cartItemIds.length > 0) {
      await this.cartExtraModel
        .deleteMany({ cartItemId: { $in: cartItemIds } })
        .exec();
      await this.cartItemModel
        .deleteMany({ cartId: new Types.ObjectId(cartId) })
        .exec();
    }

    const result = await this.cartModel
      .deleteOne({ _id: new Types.ObjectId(cartId) })
      .exec();
    return result.deletedCount > 0;
  }

  async refreshCartExpiry(cartId: string): Promise<void> {
    this.validateObjectId(cartId, 'cartId');
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 1);
    await this.cartModel.findByIdAndUpdate(cartId, { expiresAt }).exec();
  }

  // ============ Cart Item Operations ============

  async findCartItemById(itemId: string): Promise<CartItemDocument | null> {
    this.validateObjectId(itemId, 'itemId');
    return this.cartItemModel.findById(itemId).exec();
  }

  async findCartItemsByCartId(cartId: string): Promise<CartItemDocument[]> {
    this.validateObjectId(cartId, 'cartId');
    return this.cartItemModel
      .find({ cartId: new Types.ObjectId(cartId) })
      .exec();
  }

  async findCartItemByFoodItemId(
    cartId: string,
    foodItemId: string,
  ): Promise<CartItemDocument | null> {
    this.validateObjectId(cartId, 'cartId');
    this.validateObjectId(foodItemId, 'foodItemId');
    return this.cartItemModel
      .findOne({
        cartId: new Types.ObjectId(cartId),
        foodItemId: new Types.ObjectId(foodItemId),
      })
      .exec();
  }

  async createCartItem(data: {
    cartId: string;
    foodItemId: string;
    name: string;
    description: string;
    slug: string;
    price: number;
    currency: string;
    imageUrl: string;
    quantity: number;
    estimatedTime: { min: number; max: number };
    subtotal: number;
    extrasTotal: number;
    lineTotal: number;
  }): Promise<CartItemDocument> {
    this.validateObjectId(data.cartId, 'cartId');
    this.validateObjectId(data.foodItemId, 'foodItemId');

    const cartItem = new this.cartItemModel({
      cartId: new Types.ObjectId(data.cartId),
      foodItemId: new Types.ObjectId(data.foodItemId),
      name: data.name,
      description: data.description,
      slug: data.slug,
      price: data.price,
      currency: data.currency,
      imageUrl: data.imageUrl,
      quantity: data.quantity,
      estimatedTime: data.estimatedTime,
      subtotal: data.subtotal,
      extrasTotal: data.extrasTotal,
      lineTotal: data.lineTotal,
    });
    return cartItem.save();
  }

  async updateCartItem(
    itemId: string,
    data: Partial<{
      quantity: number;
      subtotal: number;
      extrasTotal: number;
      lineTotal: number;
    }>,
  ): Promise<CartItemDocument | null> {
    this.validateObjectId(itemId, 'itemId');

    const updateData: Record<string, unknown> = {};
    if (data.quantity !== undefined) updateData.quantity = data.quantity;
    if (data.subtotal !== undefined) updateData.subtotal = data.subtotal;
    if (data.extrasTotal !== undefined)
      updateData.extrasTotal = data.extrasTotal;
    if (data.lineTotal !== undefined) updateData.lineTotal = data.lineTotal;

    return this.cartItemModel
      .findByIdAndUpdate(itemId, { $set: updateData }, { new: true })
      .exec();
  }

  async deleteCartItem(itemId: string): Promise<boolean> {
    this.validateObjectId(itemId, 'itemId');

    // Delete all extras for this item first
    await this.cartExtraModel
      .deleteMany({ cartItemId: new Types.ObjectId(itemId) })
      .exec();

    const result = await this.cartItemModel
      .deleteOne({ _id: new Types.ObjectId(itemId) })
      .exec();
    return result.deletedCount > 0;
  }

  async deleteAllCartItems(cartId: string): Promise<number> {
    this.validateObjectId(cartId, 'cartId');

    // Get all cart item IDs
    const cartItems = await this.cartItemModel
      .find({ cartId: new Types.ObjectId(cartId) })
      .exec();
    const cartItemIds = cartItems.map((item) => item._id);

    // Delete all extras first
    if (cartItemIds.length > 0) {
      await this.cartExtraModel
        .deleteMany({ cartItemId: { $in: cartItemIds } })
        .exec();
    }

    // Delete all cart items
    const result = await this.cartItemModel
      .deleteMany({ cartId: new Types.ObjectId(cartId) })
      .exec();
    return result.deletedCount;
  }

  // ============ Cart Extra Operations ============

  async findExtrasByCartItemId(
    cartItemId: string,
  ): Promise<CartExtraDocument[]> {
    this.validateObjectId(cartItemId, 'cartItemId');
    return this.cartExtraModel
      .find({ cartItemId: new Types.ObjectId(cartItemId) })
      .exec();
  }

  async createCartExtra(data: {
    cartItemId: string;
    foodExtraId: string;
    name: string;
    description?: string;
    price: number;
    currency: string;
    quantity: number;
  }): Promise<CartExtraDocument> {
    this.validateObjectId(data.cartItemId, 'cartItemId');
    this.validateObjectId(data.foodExtraId, 'foodExtraId');

    const cartExtra = new this.cartExtraModel({
      cartItemId: new Types.ObjectId(data.cartItemId),
      foodExtraId: new Types.ObjectId(data.foodExtraId),
      name: data.name,
      description: data.description,
      price: data.price,
      currency: data.currency,
      quantity: data.quantity,
    });
    return cartExtra.save();
  }

  async deleteExtrasByCartItemId(cartItemId: string): Promise<number> {
    this.validateObjectId(cartItemId, 'cartItemId');
    const result = await this.cartExtraModel
      .deleteMany({ cartItemId: new Types.ObjectId(cartItemId) })
      .exec();
    return result.deletedCount;
  }

  // ============ Cleanup Operations ============

  async deleteExpiredCarts(): Promise<number> {
    const now = new Date();

    // Find expired carts
    const expiredCarts = await this.cartModel
      .find({ expiresAt: { $lte: now } })
      .exec();

    let deletedCount = 0;

    for (const cart of expiredCarts) {
      await this.deleteCart(cart._id.toString());
      deletedCount++;
    }

    return deletedCount;
  }
}

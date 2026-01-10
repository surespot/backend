import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  InternalServerErrorException,
  Inject,
  forwardRef,
  Logger,
} from '@nestjs/common';
import { OrdersRepository } from './orders.repository';
import { CartService } from '../cart/cart.service';
import { PickupLocationsService } from '../pickup-locations/pickup-locations.service';
import { SavedLocationsService } from '../saved-locations/saved-locations.service';
import { PromotionsService } from '../promotions/promotions.service';
import { FoodItemsRepository } from '../food-items/food-items.repository';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { OrdersGateway } from './orders.gateway';
import {
  NotificationType,
  NotificationChannel,
} from '../notifications/schemas/notification.schema';
import { TransactionsService } from '../transactions/transactions.service';
import { RiderLocationRepository } from '../riders/rider-location.repository';
import { RidersRepository } from '../riders/riders.repository';
import { RiderStatus } from '../riders/schemas/rider-profile.schema';
import { Types } from 'mongoose';
import { ValidateCheckoutDto } from './dto/validate-checkout.dto';
import { PlaceOrderDto } from './dto/place-order.dto';
import { GetOrdersFilterDto } from './dto/get-orders-filter.dto';
import { GetRiderOrdersDto } from './dto/get-rider-orders.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import {
  OrderDocument,
  OrderStatus,
  DeliveryType,
  PaymentStatus,
} from './schemas/order.schema';
import { OrderItemDocument } from './schemas/order-item.schema';
import { OrderExtraDocument } from './schemas/order-extra.schema';
import { DeliveryStatus } from './schemas/order-delivery-status.schema';
import { PickupLocationDocument } from '../pickup-locations/schemas/pickup-location.schema';

export interface OrderExtraResponse {
  id: string;
  foodExtraId: string;
  name: string;
  price: number;
  formattedPrice: string;
  quantity: number;
}

export interface OrderItemResponse {
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
  extras: OrderExtraResponse[];
  lineTotal: number;
}

export interface OrderResponse {
  id: string;
  orderNumber: string;
  userId: string;
  status: OrderStatus;
  deliveryType: DeliveryType;
  items: OrderItemResponse[];
  subtotal: number;
  extrasTotal: number;
  deliveryFee: number;
  discountAmount: number;
  discountPercent?: number;
  promoCode?: string;
  total: number;
  formattedTotal: string;
  itemCount: number;
  extrasCount: number;
  deliveryAddress?: {
    id?: string;
    address: string;
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    coordinates?: { latitude: number; longitude: number };
    instructions?: string;
    contactPhone?: string;
  };
  pickupLocation?: {
    id: string;
    name: string;
    address: string;
    latitude: number;
    longitude: number;
  };
  estimatedDeliveryTime?: string;
  estimatedPreparationTime?: number;
  paymentStatus: PaymentStatus;
  paymentMethod?: string;
  createdAt?: string;
  updatedAt?: string;
  deliveredAt?: string;
  cancelledAt?: string;
  cancellationReason?: string;
  assignedRiderId?: string;
  assignedAt?: string;
  assignedBy?: string;
}

@Injectable()
export class OrdersService {
  // Delivery fee configuration (in kobo)
  private readonly DELIVERY_FEE_PER_3KM = 40000; // ₦400 per 3km
  private readonly MIN_DELIVERY_FEE = 30000; // ₦300 minimum
  private readonly EXTRA_ITEMS_FEE = 60000; // ₦600 for more than 5 items
  private readonly EXTRA_ITEMS_THRESHOLD = 5;

  // Delivery time estimation (in minutes)
  private readonly DELIVERY_TIME_PER_KM = 3; // 3 minutes per km

  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly ordersRepository: OrdersRepository,
    private readonly cartService: CartService,
    private readonly pickupLocationsService: PickupLocationsService,
    private readonly savedLocationsService: SavedLocationsService,
    private readonly promotionsService: PromotionsService,
    private readonly foodItemsRepository: FoodItemsRepository,
    private readonly notificationsService: NotificationsService,
    private readonly notificationsGateway: NotificationsGateway,
    private readonly ordersGateway: OrdersGateway,
    private readonly riderLocationRepository: RiderLocationRepository,
    private readonly ridersRepository: RidersRepository,
    @Inject(forwardRef(() => TransactionsService))
    private readonly transactionsService: TransactionsService,
  ) {}

  private formatPrice(price: number, currency: string = 'NGN'): string {
    if (price === 0) return 'Free';
    const amount = price / 100;
    return `₦${amount.toLocaleString('en-NG')}`;
  }

  /**
   * Calculate delivery fee based on distance and item count
   * - ₦400 per 3km from pickup location
   * - Minimum ₦300
   * - ₦600 extra if more than 5 items
   */
  private calculateDeliveryFee(distanceKm: number, itemCount: number): number {
    if (distanceKm === 0) return 0; // Pickup orders

    // Distance-based fee: ₦400 per 3km (rounded up), minimum ₦300
    const distanceFee = Math.max(
      this.MIN_DELIVERY_FEE,
      Math.ceil(distanceKm / 3) * this.DELIVERY_FEE_PER_3KM,
    );

    // Extra fee for more than 5 items
    const extraFee =
      itemCount > this.EXTRA_ITEMS_THRESHOLD ? this.EXTRA_ITEMS_FEE : 0;

    return distanceFee + extraFee;
  }

  /**
   * Calculate distance between two coordinates using Haversine formula
   * Returns distance in kilometers
   */
  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * Calculate estimated delivery time based on prep time and distance
   */
  private calculateEstimatedTime(
    maxPrepTimeMinutes: number,
    distanceKm: number,
    deliveryType: DeliveryType,
  ): { prepTime: number; deliveryTime: number; total: number } {
    const prepTime = maxPrepTimeMinutes;
    const deliveryTime =
      deliveryType === DeliveryType.DOOR_DELIVERY
        ? Math.round(distanceKm * this.DELIVERY_TIME_PER_KM)
        : 0;
    return {
      prepTime,
      deliveryTime,
      total: prepTime + deliveryTime,
    };
  }

  /**
   * Generate order number: ORD-YYYY-XXXXXX
   */
  private async generateOrderNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.ordersRepository.countOrdersForYear(year);
    const sequence = String(count + 1).padStart(6, '0');
    return `ORD-${year}-${sequence}`;
  }

  /**
   * Validate checkout data
   */
  async validateCheckout(userId: string, dto: ValidateCheckoutDto) {
    const errors: Array<{ field: string; message: string }> = [];
    const warnings: Array<{ field: string; message: string }> = [];

    // Get cart
    const cartData = await this.cartService.getCartForCheckout(userId);
    if (!cartData || cartData.items.length === 0) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'CART_EMPTY',
          message: 'Your cart is empty',
        },
      });
    }

    const { cart, items } = cartData;

    // Check item availability
    for (const item of items) {
      const foodItem = await this.foodItemsRepository.findById(
        item.foodItemId.toString(),
      );
      if (!foodItem || !foodItem.isAvailable || !foodItem.isActive) {
        warnings.push({
          field: 'items',
          message: `${item.name} is no longer available`,
        });
      }
    }

    // Validate delivery type requirements
    let deliveryAddress: any = null;
    let pickupLocation: any = null;
    let distanceKm = 0;

    if (dto.deliveryType === DeliveryType.DOOR_DELIVERY) {
      // Need delivery address
      if (dto.deliveryAddressId) {
        try {
          const savedLocation = await this.savedLocationsService.findOne(
            dto.deliveryAddressId,
            userId,
          );
          deliveryAddress = {
            id: dto.deliveryAddressId,
            address: savedLocation.data.streetAddress,
            state: savedLocation.data.state,
            country: savedLocation.data.country,
            coordinates: {
              latitude: savedLocation.data.latitude,
              longitude: savedLocation.data.longitude,
            },
          };
        } catch {
          errors.push({
            field: 'deliveryAddressId',
            message: 'Delivery address not found',
          });
        }
      } else if (dto.deliveryAddress) {
        deliveryAddress = {
          address: dto.deliveryAddress.address,
          street: dto.deliveryAddress.street,
          city: dto.deliveryAddress.city,
          state: dto.deliveryAddress.state,
          country: dto.deliveryAddress.country || 'Nigeria',
          coordinates:
            dto.deliveryAddress.latitude && dto.deliveryAddress.longitude
              ? {
                  latitude: dto.deliveryAddress.latitude,
                  longitude: dto.deliveryAddress.longitude,
                }
              : undefined,
          instructions: dto.deliveryAddress.instructions,
          contactPhone: dto.deliveryAddress.contactPhone,
        };
      } else {
        errors.push({
          field: 'deliveryAddress',
          message: 'Delivery address is required for door-delivery',
        });
      }

      // Find nearest pickup location for delivery
      if (deliveryAddress?.coordinates) {
        try {
          const nearest = await this.pickupLocationsService.findNearest({
            latitude: deliveryAddress.coordinates.latitude,
            longitude: deliveryAddress.coordinates.longitude,
          });
          pickupLocation = nearest.data;
          // Calculate distance manually
          distanceKm = this.calculateDistance(
            deliveryAddress.coordinates.latitude,
            deliveryAddress.coordinates.longitude,
            nearest.data.latitude,
            nearest.data.longitude,
          );
        } catch {
          errors.push({
            field: 'deliveryAddress',
            message: 'No pickup locations available near your address',
          });
        }
      }
    } else {
      // Pickup - need pickup location
      if (dto.pickupLocationId) {
        try {
          const location = await this.pickupLocationsService.findOne(
            dto.pickupLocationId,
          );
          pickupLocation = location.data;
        } catch {
          errors.push({
            field: 'pickupLocationId',
            message: 'Pickup location not found',
          });
        }
      } else {
        errors.push({
          field: 'pickupLocationId',
          message: 'Pickup location is required',
        });
      }
    }

    // Calculate delivery fee
    const deliveryFee =
      dto.deliveryType === DeliveryType.DOOR_DELIVERY
        ? this.calculateDeliveryFee(distanceKm, cart.itemCount)
        : 0;

    // Validate promo code if provided
    let discountAmount = cart.discountAmount;
    let discountPercent = cart.discountPercent;
    let promoCode = cart.promoCode;

    if (dto.promoCode && dto.promoCode !== cart.promoCode) {
      const cartTotal = cart.subtotal + cart.extrasTotal;
      const validation = await this.promotionsService.validateDiscountCode(
        dto.promoCode,
        cartTotal,
      );
      if (!validation.valid) {
        errors.push({
          field: 'promoCode',
          message: validation.message || 'Invalid promo code',
        });
      } else {
        discountAmount = validation.discountAmount || 0;
        discountPercent = validation.promotion?.discountValue;
        promoCode = dto.promoCode.toUpperCase();
      }
    }

    // Calculate totals
    const subtotal = cart.subtotal;
    const extrasTotal = cart.extrasTotal;
    const total = Math.max(
      0,
      subtotal + extrasTotal + deliveryFee - discountAmount,
    );

    // Calculate estimated time
    const maxPrepTime = Math.max(
      ...items.map((item) => item.estimatedTime?.max || 30),
    );
    const estimatedTime = this.calculateEstimatedTime(
      maxPrepTime,
      distanceKm,
      dto.deliveryType,
    );
    const estimatedDeliveryTime = new Date();
    estimatedDeliveryTime.setMinutes(
      estimatedDeliveryTime.getMinutes() + estimatedTime.total,
    );

    return {
      success: true,
      data: {
        isValid: errors.length === 0,
        cart: {
          subtotal,
          extrasTotal,
          discountAmount,
          discountPercent,
          promoCode,
          total,
        },
        deliveryFee,
        estimatedDeliveryTime: estimatedDeliveryTime.toISOString(),
        estimatedPreparationTime: estimatedTime.prepTime,
        errors: errors.length > 0 ? errors : undefined,
        warnings: warnings.length > 0 ? warnings : undefined,
      },
    };
  }

  /**
   * Place an order
   */
  async placeOrder(userId: string, dto: PlaceOrderDto) {
    // Validate checkout first
    const validation = await this.validateCheckout(userId, {
      deliveryType: dto.deliveryType,
      deliveryAddressId: dto.deliveryAddressId,
      deliveryAddress: dto.deliveryAddress,
      pickupLocationId: dto.pickupLocationId,
      promoCode: dto.promoCode,
    });

    if (!validation.data.isValid) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Checkout validation failed',
          details: validation.data.errors,
        },
      });
    }

    // Get cart data
    const cartData = await this.cartService.getCartForCheckout(userId);
    if (!cartData || cartData.items.length === 0) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'CART_EMPTY',
          message: 'Your cart is empty',
        },
      });
    }

    const { cart, items, extras } = cartData;

    // Build delivery address
    let deliveryAddress: any = null;
    let pickupLocationId: string | undefined;

    if (dto.deliveryType === DeliveryType.DOOR_DELIVERY) {
      if (dto.deliveryAddressId) {
        const savedLocation = await this.savedLocationsService.findOne(
          dto.deliveryAddressId,
          userId,
        );
        deliveryAddress = {
          id: dto.deliveryAddressId,
          address: savedLocation.data.streetAddress,
          state: savedLocation.data.state,
          country: savedLocation.data.country,
          coordinates: {
            latitude: savedLocation.data.latitude,
            longitude: savedLocation.data.longitude,
          },
        };
      } else if (dto.deliveryAddress) {
        deliveryAddress = {
          address: dto.deliveryAddress.address,
          street: dto.deliveryAddress.street,
          city: dto.deliveryAddress.city,
          state: dto.deliveryAddress.state,
          country: dto.deliveryAddress.country || 'Nigeria',
          coordinates:
            dto.deliveryAddress.latitude && dto.deliveryAddress.longitude
              ? {
                  latitude: dto.deliveryAddress.latitude,
                  longitude: dto.deliveryAddress.longitude,
                }
              : undefined,
          instructions: dto.instructions || dto.deliveryAddress.instructions,
          contactPhone: dto.deliveryAddress.contactPhone,
        };
      }

      // Find nearest pickup location
      if (deliveryAddress?.coordinates) {
        const nearest = await this.pickupLocationsService.findNearest({
          latitude: deliveryAddress.coordinates.latitude,
          longitude: deliveryAddress.coordinates.longitude,
        });
        pickupLocationId = nearest.data.id;
      }
    } else {
      pickupLocationId = dto.pickupLocationId;
    }

    // Generate order number
    const orderNumber = await this.generateOrderNumber();

    // Get promo details
    let promotionId: string | undefined;
    if (dto.promoCode) {
      const promotion = await this.promotionsService.getPromotionByDiscountCode(
        dto.promoCode,
      );
      if (promotion) {
        promotionId = promotion._id.toString();
        // Increment usage count
        await this.promotionsService.incrementPromoUsage(promotionId);
      }
    }

    // Create order
    let order = await this.ordersRepository.createOrder({
      orderNumber,
      userId,
      deliveryType: dto.deliveryType,
      subtotal: validation.data.cart.subtotal,
      extrasTotal: validation.data.cart.extrasTotal,
      deliveryFee: validation.data.deliveryFee,
      discountAmount: validation.data.cart.discountAmount,
      discountPercent: validation.data.cart.discountPercent,
      promoCode: validation.data.cart.promoCode,
      promotionId,
      total: validation.data.cart.total,
      itemCount: cart.itemCount,
      extrasCount: cart.extrasCount,
      deliveryAddress,
      pickupLocationId,
      estimatedDeliveryTime: new Date(validation.data.estimatedDeliveryTime),
      estimatedPreparationTime: validation.data.estimatedPreparationTime,
      paymentMethod: dto.paymentMethod,
      paymentIntentId: dto.paymentIntentId,
      instructions: dto.instructions,
    });

    // Create order items
    for (const item of items) {
      const itemExtras = extras.get(item._id.toString()) || [];
      const extrasTotal =
        itemExtras.reduce((sum, e) => sum + e.price * e.quantity, 0) *
        item.quantity;
      const lineTotal = item.price * item.quantity + extrasTotal;

      const orderItem = await this.ordersRepository.createOrderItem({
        orderId: order._id.toString(),
        foodItemId: item.foodItemId.toString(),
        name: item.name,
        description: item.description,
        slug: item.slug,
        price: item.price,
        currency: item.currency,
        imageUrl: item.imageUrl,
        quantity: item.quantity,
        estimatedTime: item.estimatedTime,
        lineTotal,
      });

      // Create order extras
      for (const extra of itemExtras) {
        await this.ordersRepository.createOrderExtra({
          orderItemId: orderItem._id.toString(),
          foodExtraId: extra.foodExtraId.toString(),
          name: extra.name,
          price: extra.price,
          currency: extra.currency,
          quantity: extra.quantity,
        });
      }
    }

    // Create initial delivery status
    await this.ordersRepository.createDeliveryStatus({
      orderId: order._id.toString(),
      status: DeliveryStatus.PENDING,
      message: 'Order placed',
    });

    // Clear cart
    await this.cartService.clearCartAfterOrder(userId);

    // Send order placed notification to customer
    await this.notificationsService.sendOrderPlacedNotification(
      userId,
      orderNumber,
      order._id.toString(),
      order.total,
    );

    // Send notification to pickup location if order has one
    if (order.pickupLocationId) {
      await this.notificationsGateway.emitOrderPlacedToPickupLocation(
        order.pickupLocationId.toString(),
        orderNumber,
        order._id.toString(),
        order.total,
        order.itemCount,
      );
    }

    // Fix timing issue: If payment was already successful (webhook/verify ran before order creation),
    // verify and update payment status now
    if (
      order.paymentIntentId &&
      order.paymentStatus === PaymentStatus.PENDING
    ) {
      try {
        const verification = await this.transactionsService.verifyPayment(
          order.paymentIntentId,
        );
        if (verification.success) {
          // Payment was already successful, update order status
          await this.ordersRepository.updateOrder(order._id.toString(), {
            paymentStatus: PaymentStatus.PAID,
          });
          // Reload order to get updated status
          const updatedOrder = await this.ordersRepository.findById(
            order._id.toString(),
          );
          if (updatedOrder) {
            order = updatedOrder;
          }
        }
      } catch (error) {
        // Payment verification failed or payment not found yet, that's okay
        // Order will remain pending and can be verified later
      }
    }

    // Get formatted order
    const formattedOrder = await this.formatOrder(order);

    return {
      success: true,
      message: 'Order placed successfully',
      data: formattedOrder,
    };
  }

  /**
   * Get user's orders with pagination
   */
  async getOrders(userId: string, filter: GetOrdersFilterDto) {
    const result = await this.ordersRepository.findByUserId(userId, filter);

    const orders = await Promise.all(
      result.items.map((order) => this.formatOrder(order)),
    );

    return {
      success: true,
      message: 'Orders retrieved successfully',
      data: {
        orders,
        pagination: result.pagination,
      },
    };
  }

  /**
   * Get order by ID
   */
  async getOrderById(userId: string, orderId: string) {
    // Try by order number first
    let order: OrderDocument | null =
      await this.ordersRepository.findByOrderNumber(orderId);
    if (!order) {
      order = await this.ordersRepository.findById(orderId);
    }

    if (!order) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'ORDER_NOT_FOUND',
          message: 'Order not found',
        },
      });
    }

    // Check ownership
    if (order.userId.toString() !== userId) {
      throw new ForbiddenException({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have access to this order',
        },
      });
    }

    // Auto-verify payment if order is pending and has paymentIntentId
    if (
      order.paymentStatus === PaymentStatus.PENDING &&
      order.paymentIntentId &&
      order.paymentMethod === 'card'
    ) {
      try {
        const verification = await this.transactionsService.verifyPayment(
          order.paymentIntentId,
        );
        if (verification.success) {
          // Payment is successful, update order status
          await this.ordersRepository.updateOrder(order._id.toString(), {
            paymentStatus: PaymentStatus.PAID,
          });
          // Reload order to get updated status
          const updatedOrder = await this.ordersRepository.findById(
            order._id.toString(),
          );
          if (updatedOrder) {
            order = updatedOrder;
          }
        } else if (!verification.success) {
          // Payment failed, update order status
          await this.ordersRepository.updateOrder(order._id.toString(), {
            paymentStatus: PaymentStatus.FAILED,
          });
          // Reload order to get updated status
          const updatedOrder = await this.ordersRepository.findById(
            order._id.toString(),
          );
          if (updatedOrder) {
            order = updatedOrder;
          }
        }
      } catch {
        // Payment verification failed, keep order as pending
        // This could happen if payment hasn't been processed yet
      }
    }

    const formattedOrder = await this.formatOrder(order);

    return {
      success: true,
      message: 'Order retrieved successfully',
      data: formattedOrder,
    };
  }

  /**
   * Cancel an order (only before payment)
   */
  async cancelOrder(userId: string, orderId: string, reason?: string) {
    const order = await this.ordersRepository.findById(orderId);

    if (!order) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'ORDER_NOT_FOUND',
          message: 'Order not found',
        },
      });
    }

    // Check ownership
    if (order.userId.toString() !== userId) {
      throw new ForbiddenException({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have access to this order',
        },
      });
    }

    // Can only cancel before payment
    if (order.paymentStatus !== PaymentStatus.PENDING) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'ORDER_CANNOT_BE_CANCELLED',
          message: 'Order cannot be cancelled after payment',
        },
      });
    }

    // Update order status
    const updatedOrder = await this.ordersRepository.updateOrder(orderId, {
      status: OrderStatus.CANCELLED,
      cancelledAt: new Date(),
      cancellationReason: reason,
    });

    // Create delivery status entry
    await this.ordersRepository.createDeliveryStatus({
      orderId,
      status: DeliveryStatus.CANCELLED,
      message: reason || 'Order cancelled by user',
    });

    // Send order cancelled notification
    await this.notificationsService.sendOrderCancelledNotification(
      userId,
      order.orderNumber,
      orderId,
      reason,
    );

    const formattedOrder = await this.formatOrder(updatedOrder!);

    return {
      success: true,
      message: 'Order cancelled successfully',
      data: formattedOrder,
    };
  }

  /**
   * Reorder - add items from previous order to cart
   */
  async reorder(userId: string, orderId: string) {
    const order = await this.ordersRepository.findById(orderId);

    if (!order) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'ORDER_NOT_FOUND',
          message: 'Order not found',
        },
      });
    }

    // Check ownership
    if (order.userId.toString() !== userId) {
      throw new ForbiddenException({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have access to this order',
        },
      });
    }

    // Get order items
    const orderItems =
      await this.ordersRepository.findOrderItemsByOrderId(orderId);

    const skippedItems: string[] = [];
    const addedItems: string[] = [];

    for (const item of orderItems) {
      // Check if item is still available
      const foodItem = await this.foodItemsRepository.findById(
        item.foodItemId.toString(),
      );
      if (!foodItem || !foodItem.isAvailable || !foodItem.isActive) {
        skippedItems.push(item.name);
        continue;
      }

      // Get extras for this item
      const orderExtras =
        await this.ordersRepository.findOrderExtrasByOrderItemId(
          item._id.toString(),
        );

      // Filter available extras
      const availableExtras: Array<{ foodExtraId: string; quantity: number }> =
        [];
      for (const extra of orderExtras) {
        const foodExtra = await this.foodItemsRepository.findExtraById(
          extra.foodExtraId.toString(),
        );
        if (foodExtra && foodExtra.isAvailable) {
          availableExtras.push({
            foodExtraId: extra.foodExtraId.toString(),
            quantity: extra.quantity,
          });
        }
      }

      // Add to cart
      try {
        await this.cartService.addItem(userId, {
          foodItemId: item.foodItemId.toString(),
          quantity: item.quantity,
          extras: availableExtras,
        });
        addedItems.push(item.name);
      } catch {
        skippedItems.push(item.name);
      }
    }

    // Get updated cart
    const cartResult = await this.cartService.getCart(userId);

    return {
      success: true,
      message:
        skippedItems.length > 0
          ? `${addedItems.length} items added to cart. ${skippedItems.length} items were not available.`
          : 'Items added to cart',
      data: {
        cart: cartResult.data,
        addedItems,
        skippedItems,
      },
    };
  }

  /**
   * Get order tracking information
   */
  async getOrderTracking(userId: string, orderId: string) {
    const order = await this.ordersRepository.findById(orderId);

    if (!order) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'ORDER_NOT_FOUND',
          message: 'Order not found',
        },
      });
    }

    // Check ownership
    if (order.userId.toString() !== userId) {
      throw new ForbiddenException({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have access to this order',
        },
      });
    }

    // Get status history
    const statusHistory =
      await this.ordersRepository.findDeliveryStatusHistory(orderId);

    // Get latest status for location
    const latestStatus =
      await this.ordersRepository.findLatestDeliveryStatus(orderId);

    // Calculate remaining time
    let estimatedTimeRemaining: number | undefined;
    if (order.estimatedDeliveryTime && order.status !== OrderStatus.DELIVERED) {
      const now = new Date();
      const remaining = Math.round(
        (order.estimatedDeliveryTime.getTime() - now.getTime()) / 60000,
      );
      estimatedTimeRemaining = Math.max(0, remaining);
    }

    return {
      success: true,
      data: {
        order: {
          id: order._id.toString(),
          orderNumber: order.orderNumber,
          status: order.status,
        },
        tracking: {
          status: latestStatus?.status || order.status,
          statusHistory: statusHistory.map((s) => ({
            status: s.status,
            timestamp: s.createdAt?.toISOString(),
            message: s.message,
          })),
          currentLocation:
            latestStatus?.location?.coordinates &&
            Array.isArray(latestStatus.location.coordinates) &&
            latestStatus.location.coordinates.length >= 2
              ? {
                  latitude: latestStatus.location.coordinates[1],
                  longitude: latestStatus.location.coordinates[0],
                  lastUpdated: latestStatus.updatedAt?.toISOString(),
                }
              : undefined,
          estimatedDeliveryTime: order.estimatedDeliveryTime?.toISOString(),
          estimatedTimeRemaining,
        },
      },
    };
  }

  /**
   * Update order status (admin/restaurant)
   */
  async updateOrderStatus(
    orderId: string,
    dto: UpdateOrderStatusDto,
    updatedById: string,
  ) {
    const order = await this.ordersRepository.findById(orderId);

    if (!order) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'ORDER_NOT_FOUND',
          message: 'Order not found',
        },
      });
    }

    // Map delivery status to order status
    const orderStatusMap: Record<DeliveryStatus, OrderStatus> = {
      [DeliveryStatus.PENDING]: OrderStatus.PENDING,
      [DeliveryStatus.PREPARING]: OrderStatus.PREPARING,
      [DeliveryStatus.READY]: OrderStatus.READY,
      [DeliveryStatus.RIDER_REQUESTED]: OrderStatus.READY,
      [DeliveryStatus.RIDER_PRESENT]: OrderStatus.READY,
      [DeliveryStatus.RIDER_PICKED_UP]: OrderStatus.OUT_FOR_DELIVERY,
      [DeliveryStatus.DELIVERED]: OrderStatus.DELIVERED,
      [DeliveryStatus.CANCELLED]: OrderStatus.CANCELLED,
    };

    const newOrderStatus = orderStatusMap[dto.status];

    // Validate status transitions
    const allowedTransitions: Record<OrderStatus, OrderStatus[]> = {
      [OrderStatus.PENDING]: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
      [OrderStatus.CONFIRMED]: [OrderStatus.PREPARING], // If CONFIRMED is used, allow transition to PREPARING
      [OrderStatus.PREPARING]: [OrderStatus.READY],
      [OrderStatus.READY]: [OrderStatus.OUT_FOR_DELIVERY],
      [OrderStatus.OUT_FOR_DELIVERY]: [OrderStatus.DELIVERED],
      [OrderStatus.DELIVERED]: [], // No transitions from DELIVERED
      [OrderStatus.CANCELLED]: [], // No transitions from CANCELLED
    };

    // Check if cancellation is allowed (only from PENDING)
    if (dto.status === DeliveryStatus.CANCELLED) {
      if (order.status !== OrderStatus.PENDING) {
        throw new BadRequestException({
          success: false,
          error: {
            code: 'ORDER_CANNOT_BE_CANCELLED',
            message: 'Only pending orders can be cancelled',
          },
        });
      }
    } else {
      // Check if the transition is allowed
      const currentStatus = order.status;
      if (!allowedTransitions[currentStatus]?.includes(newOrderStatus)) {
        throw new BadRequestException({
          success: false,
          error: {
            code: 'INVALID_STATUS_TRANSITION',
            message: `Cannot change order status from ${currentStatus} to ${newOrderStatus}. Allowed transitions: ${allowedTransitions[currentStatus]?.join(', ') || 'none'}`,
          },
        });
      }

      // Validate that order is paid before allowing status change to anything other than PENDING or CANCELLED
      if (
        newOrderStatus !== OrderStatus.PENDING &&
        newOrderStatus !== OrderStatus.CANCELLED &&
        order.paymentStatus !== PaymentStatus.PAID
      ) {
        throw new BadRequestException({
          success: false,
          error: {
            code: 'ORDER_NOT_PAID',
            message: 'Order must be paid before status can be changed. Please ensure payment is completed first.',
          },
        });
      }
    }

    // Update order status if needed
    const updateData: {
      status?: OrderStatus;
      deliveredAt?: Date;
    } = {};

    if (newOrderStatus !== order.status) {
      updateData.status = newOrderStatus;
      if (newOrderStatus === OrderStatus.DELIVERED) {
        updateData.deliveredAt = new Date();
      }
    }

    if (Object.keys(updateData).length > 0) {
      await this.ordersRepository.updateOrder(orderId, updateData);
    }

    // Create delivery status entry
    await this.ordersRepository.createDeliveryStatus({
      orderId,
      status: dto.status,
      message: dto.message,
      updatedBy: updatedById,
      latitude: dto.latitude,
      longitude: dto.longitude,
    });

    // Send appropriate notification based on status
    const userId = order.userId.toString();
    switch (dto.status) {
      case DeliveryStatus.PREPARING:
        await this.notificationsService.sendOrderPreparingNotification(
          userId,
          order.orderNumber,
          orderId,
        );
        break;
      case DeliveryStatus.READY:
        await this.notificationsService.sendOrderReadyNotification(
          userId,
          order.orderNumber,
          orderId,
          order.deliveryType === DeliveryType.PICKUP,
        );

        // Find nearby active riders for door delivery orders
        if (order.deliveryType === DeliveryType.DOOR_DELIVERY) {
          await this.findAndNotifyNearbyRiders(order);
        }
        break;
      case DeliveryStatus.RIDER_PICKED_UP: {
        // Fetch rider name if order is assigned to a rider
        let riderName: string | undefined;
        if (order.assignedRiderId) {
          const riderProfile = await this.ridersRepository.findById(
            order.assignedRiderId.toString(),
          );
          if (riderProfile) {
            riderName =
              `${riderProfile.firstName || ''} ${riderProfile.lastName || ''}`.trim() ||
              undefined;
          }
        }
        await this.notificationsService.sendOrderOutForDeliveryNotification(
          userId,
          order.orderNumber,
          orderId,
          riderName,
        );
        break;
      }
      case DeliveryStatus.DELIVERED:
        await this.notificationsService.sendOrderDeliveredNotification(
          userId,
          order.orderNumber,
          orderId,
        );
        break;
    }

    // Get updated order
    const updatedOrder = await this.ordersRepository.findById(orderId);
    const formattedOrder = await this.formatOrder(updatedOrder!);

    return {
      success: true,
      message: 'Order status updated successfully',
      data: formattedOrder,
    };
  }

  /**
   * Update order payment status by payment reference
   * Used by webhook handlers to update payment status
   */
  async updatePaymentStatusByReference(
    reference: string,
    paymentStatus: PaymentStatus,
  ): Promise<void> {
    const order = await this.ordersRepository.findByPaymentIntentId(reference);

    if (!order) {
      // Order might not exist yet, that's okay
      return;
    }

    // Update payment status and order status if payment is successful
    const updateData: { paymentStatus: PaymentStatus; status?: OrderStatus } = {
      paymentStatus,
    };

    // When payment is successful, set order status to CONFIRMED if it's currently PENDING
    // Pickup location will manually set it to PREPARING when they start preparing
    if (
      paymentStatus === PaymentStatus.PAID &&
      order.status === OrderStatus.PENDING
    ) {
      updateData.status = OrderStatus.CONFIRMED;
    }

    await this.ordersRepository.updateOrder(order._id.toString(), updateData);

    // Send notification based on payment status
    if (paymentStatus === PaymentStatus.PAID) {
      await this.notificationsService.sendPaymentSuccessNotification(
        order.userId.toString(),
        order.orderNumber,
        order._id.toString(),
        order.total,
      );

      // Notify pickup location about the paid order
      if (order.pickupLocationId) {
        await this.notificationsGateway.emitOrderPlacedToPickupLocation(
          order.pickupLocationId.toString(),
          order.orderNumber,
          order._id.toString(),
          order.total,
          order.itemCount,
        );
        this.logger.log(
          `[updatePaymentStatusByReference] Notified pickup location ${order.pickupLocationId.toString()} about paid order ${order.orderNumber}`,
        );
      }
    } else if (paymentStatus === PaymentStatus.FAILED) {
      await this.notificationsService.sendPaymentFailedNotification(
        order.userId.toString(),
        order.orderNumber,
        order._id.toString(),
      );
    }
  }

  // ============ Helper Methods ============

  private async formatOrder(order: OrderDocument): Promise<OrderResponse> {
    const orderItems = await this.ordersRepository.findOrderItemsByOrderId(
      order._id.toString(),
    );

    const items: OrderItemResponse[] = await Promise.all(
      orderItems.map(async (item) => {
        const extras = await this.ordersRepository.findOrderExtrasByOrderItemId(
          item._id.toString(),
        );
        return this.formatOrderItem(item, extras);
      }),
    );

    const pickupLocationDoc = order.pickupLocationId as any;

    return {
      id: order._id.toString(),
      orderNumber: order.orderNumber,
      userId: order.userId.toString(),
      status: order.status,
      deliveryType: order.deliveryType,
      items,
      subtotal: order.subtotal,
      extrasTotal: order.extrasTotal,
      deliveryFee: order.deliveryFee,
      discountAmount: order.discountAmount,
      discountPercent: order.discountPercent,
      promoCode: order.promoCode,
      total: order.total,
      formattedTotal: this.formatPrice(order.total),
      itemCount: order.itemCount,
      extrasCount: order.extrasCount,
      deliveryAddress: order.deliveryAddress,
      pickupLocation:
        pickupLocationDoc && pickupLocationDoc._id
          ? {
              id: pickupLocationDoc._id.toString(),
              name: pickupLocationDoc.name,
              address: pickupLocationDoc.address,
              latitude: pickupLocationDoc.location?.coordinates?.[1],
              longitude: pickupLocationDoc.location?.coordinates?.[0],
            }
          : undefined,
      estimatedDeliveryTime: order.estimatedDeliveryTime?.toISOString(),
      estimatedPreparationTime: order.estimatedPreparationTime,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      createdAt: order.createdAt?.toISOString(),
      updatedAt: order.updatedAt?.toISOString(),
      deliveredAt: order.deliveredAt?.toISOString(),
      cancelledAt: order.cancelledAt?.toISOString(),
      cancellationReason: order.cancellationReason,
      assignedRiderId: order.assignedRiderId?.toString(),
      assignedAt: order.assignedAt?.toISOString(),
      assignedBy: order.assignedBy?.toString(),
    };
  }

  private formatOrderSummary(
    order: OrderDocument,
  ): Omit<OrderResponse, 'items'> & { items?: never } {
    const pickupLocationDoc = order.pickupLocationId as any;

    return {
      id: order._id.toString(),
      orderNumber: order.orderNumber,
      userId: order.userId.toString(),
      status: order.status,
      deliveryType: order.deliveryType,
      subtotal: order.subtotal,
      extrasTotal: order.extrasTotal,
      deliveryFee: order.deliveryFee,
      discountAmount: order.discountAmount,
      discountPercent: order.discountPercent,
      promoCode: order.promoCode,
      total: order.total,
      formattedTotal: this.formatPrice(order.total),
      itemCount: order.itemCount,
      extrasCount: order.extrasCount,
      deliveryAddress: order.deliveryAddress,
      pickupLocation:
        pickupLocationDoc && pickupLocationDoc._id
          ? {
              id: pickupLocationDoc._id.toString(),
              name: pickupLocationDoc.name,
              address: pickupLocationDoc.address,
              latitude: pickupLocationDoc.location?.coordinates?.[1],
              longitude: pickupLocationDoc.location?.coordinates?.[0],
            }
          : undefined,
      estimatedDeliveryTime: order.estimatedDeliveryTime?.toISOString(),
      estimatedPreparationTime: order.estimatedPreparationTime,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      createdAt: order.createdAt?.toISOString(),
      updatedAt: order.updatedAt?.toISOString(),
      deliveredAt: order.deliveredAt?.toISOString(),
      cancelledAt: order.cancelledAt?.toISOString(),
      cancellationReason: order.cancellationReason,
    } as any;
  }

  private formatOrderItem(
    item: OrderItemDocument,
    extras: OrderExtraDocument[],
  ): OrderItemResponse {
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
      extras: extras.map((e) => ({
        id: e._id.toString(),
        foodExtraId: e.foodExtraId.toString(),
        name: e.name,
        price: e.price,
        formattedPrice: this.formatPrice(e.price, e.currency),
        quantity: e.quantity,
      })),
      lineTotal: item.lineTotal,
    };
  }

  /**
   * Find nearby active riders when order is ready
   * Riders must be within 15KM of both pickup location and delivery address
   */
  private async findAndNotifyNearbyRiders(order: OrderDocument): Promise<void> {
    try {
      // Get pickup location to get region and coordinates
      if (!order.pickupLocationId) {
        return; // No pickup location, skip
      }

      // Handle both ObjectId and populated object cases
      let pickupLocationId: string;
      if (
        order.pickupLocationId &&
        typeof order.pickupLocationId === 'object' &&
        '_id' in order.pickupLocationId
      ) {
        // Populated object - extract _id
        pickupLocationId = (
          order.pickupLocationId as unknown as PickupLocationDocument
        )._id.toString();
      } else {
        // ObjectId - convert directly
        pickupLocationId = (
          order.pickupLocationId as Types.ObjectId
        ).toString();
      }

      // Get pickup location - use the same coordinate extraction as getRiderEligibleOrders
      // First check if pickupLocationId is already populated
      let orderWithPickup: OrderDocument = order;
      if (
        !order.pickupLocationId ||
        typeof order.pickupLocationId === 'string' ||
        !('location' in (order.pickupLocationId as any))
      ) {
        // Need to fetch with populated pickupLocationId
        const fetchedOrder = await this.ordersRepository.findById(
          order._id.toString(),
        );
        if (!fetchedOrder) {
          return; // Order not found, skip
        }
        orderWithPickup = fetchedOrder;
      }

      // Get populated pickup location
      const populatedPickupLocation = orderWithPickup.pickupLocationId as any;
      if (
        !populatedPickupLocation ||
        !populatedPickupLocation.location?.coordinates
      ) {
        return; // No pickup location coordinates, skip
      }

      const regionId = populatedPickupLocation.regionId?.toString();
      if (!regionId) {
        return; // No region, skip
      }

      // Get delivery address coordinates
      if (
        !order.deliveryAddress?.coordinates?.latitude ||
        !order.deliveryAddress?.coordinates?.longitude
      ) {
        return; // No delivery coordinates, skip
      }

      // Extract coordinates in same format as getRiderEligibleOrders
      const pickupLat = populatedPickupLocation.location.coordinates[1]; // GeoJSON: [lng, lat]
      const pickupLng = populatedPickupLocation.location.coordinates[0];
      const deliveryLat = order.deliveryAddress.coordinates.latitude;
      const deliveryLng = order.deliveryAddress.coordinates.longitude;

      // Find active riders in the region
      const { profiles } = await this.ridersRepository.findProfiles(
        {
          status: RiderStatus.ACTIVE,
          regionId: regionId,
        },
        { page: 1, limit: 100 }, // Get up to 100 active riders
      );

      if (profiles.length === 0) {
        return; // No active riders in region
      }

      // Get rider profile IDs
      const riderProfileIds = profiles.map((p) => p._id);

      // Find riders within 15KM of both pickup location and delivery address
      const MAX_DISTANCE_METERS = 15000; // 15KM

      const nearbyRiders =
        await this.riderLocationRepository.findNearbyMultiplePoints(
          [
            { latitude: pickupLat, longitude: pickupLng },
            { latitude: deliveryLat, longitude: deliveryLng },
          ],
          MAX_DISTANCE_METERS,
          riderProfileIds,
        );

      // Notify nearby riders via WebSocket (only those within 15KM of both locations)
      if (nearbyRiders.length > 0) {
        // Get pickup location details for notification
        const pickupLocationData = {
          id: populatedPickupLocation._id.toString(),
          name: populatedPickupLocation.name,
          address: populatedPickupLocation.address,
          latitude: pickupLat,
          longitude: pickupLng,
        };

        const deliveryAddressData = {
          address: order.deliveryAddress.address,
          coordinates: {
            latitude: deliveryLat,
            longitude: deliveryLng,
          },
        };

        // Emit to each nearby rider individually via their personal room
        const notificationPromises = nearbyRiders.map((riderLocation) => {
          const riderProfileId = riderLocation.riderProfileId.toString();
          return this.ordersGateway
            .emitOrderReadyToRider(
              riderProfileId,
              order._id.toString(),
              order.orderNumber,
              pickupLocationData,
              deliveryAddressData,
              order.total,
              order.itemCount,
            )
            .catch((err) => {
              this.logger.warn(
                `Failed to send notification to rider ${riderProfileId}: ${err instanceof Error ? err.message : String(err)}`,
              );
              return false;
            });
        });

        await Promise.all(notificationPromises);

        this.logger.log(
          `Order ready notifications sent to ${nearbyRiders.length} nearby rider(s) for order ${order.orderNumber}`,
        );
      } else {
        this.logger.debug(
          `No nearby riders found within 15KM of both pickup and delivery locations for order ${order.orderNumber}`,
        );
      }
    } catch (error) {
      // Log error but don't fail the order status update
      this.logger.error('Error finding nearby riders:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  }

  /**
   * Get orders eligible for rider
   * Returns orders that are READY and in the rider's region
   * Filters by proximity: rider must be within 15KM of both pickup location and delivery address
   */
  async getRiderEligibleOrders(userId: string, filter: GetRiderOrdersDto) {
    // Get rider profile to get region
    const riderProfile = await this.ridersRepository.findByUserId(userId);
    if (!riderProfile) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'RIDER_PROFILE_NOT_FOUND',
          message: 'Rider profile not found',
        },
      });
    }

    // Get rider's current location
    const riderLocation =
      await this.riderLocationRepository.findByRiderProfileId(
        riderProfile._id.toString(),
      );

    if (!riderLocation) {
      // If rider hasn't set their location, return empty result
      // They need to update their location first to see orders
      return {
        success: true,
        message: 'Eligible orders retrieved successfully',
        data: {
          orders: [],
          pagination: {
            page: filter.page || 1,
            limit: filter.limit || 20,
            total: 0,
            totalPages: 0,
            hasNext: false,
            hasPrev: false,
          },
        },
      };
    }

    const riderLat = riderLocation.location.coordinates[1]; // GeoJSON: [lng, lat]
    const riderLng = riderLocation.location.coordinates[0];

    // Only show READY orders in the rider's region
    const regionId = riderProfile.regionId.toString();
    const status = filter.status || OrderStatus.READY;

    // Get a larger set of orders to filter by proximity
    // We'll filter by proximity after fetching, so get more than needed
    const page = filter.page || 1;
    const limit = filter.limit || 20;
    const fetchLimit = limit * 3; // Fetch 3x to account for proximity filtering

    // Find orders in the region with the specified status
    const orders = await this.ordersRepository.findByRegionAndStatus(
      regionId,
      status,
      {
        page: 1, // Start from page 1
        limit: fetchLimit, // Fetch more to filter
      },
    );

    // Filter orders by proximity: rider must be within 15KM of both pickup and delivery
    const MAX_DISTANCE_KM = 15;
    const eligibleOrders = orders.items.filter((order) => {
      // Check pickup location proximity
      const pickupLocationDoc = order.pickupLocationId as any;
      if (!pickupLocationDoc || !pickupLocationDoc.location?.coordinates) {
        return false; // No pickup location coordinates
      }

      const pickupLat = pickupLocationDoc.location.coordinates[1];
      const pickupLng = pickupLocationDoc.location.coordinates[0];
      const distanceToPickup = this.calculateDistance(
        riderLat,
        riderLng,
        pickupLat,
        pickupLng,
      );

      if (distanceToPickup > MAX_DISTANCE_KM) {
        return false; // Too far from pickup
      }

      // Check delivery address proximity
      if (
        !order.deliveryAddress?.coordinates?.latitude ||
        !order.deliveryAddress?.coordinates?.longitude
      ) {
        return false; // No delivery coordinates
      }

      const deliveryLat = order.deliveryAddress.coordinates.latitude;
      const deliveryLng = order.deliveryAddress.coordinates.longitude;
      const distanceToDelivery = this.calculateDistance(
        riderLat,
        riderLng,
        deliveryLat,
        deliveryLng,
      );

      if (distanceToDelivery > MAX_DISTANCE_KM) {
        return false; // Too far from delivery
      }

      return true; // Within 15KM of both locations
    });

    // Apply pagination to filtered results
    const skip = (page - 1) * limit;
    const paginatedOrders = eligibleOrders.slice(skip, skip + limit);
    const total = eligibleOrders.length;
    const totalPages = Math.ceil(total / limit);

    const formattedOrders = await Promise.all(
      paginatedOrders.map((order) => this.formatOrder(order)),
    );

    return {
      success: true,
      message: 'Eligible orders retrieved successfully',
      data: {
        orders: formattedOrders,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
    };
  }

  /**
   * Accept an order (Rider only)
   * Atomically assigns a rider to an order, preventing race conditions
   */
  async acceptOrder(userId: string, orderId: string) {
    // Get rider profile
    const riderProfile = await this.ridersRepository.findByUserId(userId);
    if (!riderProfile) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'RIDER_PROFILE_NOT_FOUND',
          message: 'Rider profile not found',
        },
      });
    }

    // Verify rider is active
    if (riderProfile.status !== RiderStatus.ACTIVE) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'RIDER_NOT_ACTIVE',
          message: 'Only active riders can accept orders',
        },
      });
    }

    // Check if rider has less than 3 active orders
    const activeOrdersCount =
      await this.ordersRepository.countActiveAssignedOrders(
        riderProfile._id.toString(),
      );

    if (activeOrdersCount >= 3) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'MAX_ORDERS_REACHED',
          message:
            'You cannot accept more than 3 orders at once. Please deliver some orders first.',
        },
      });
    }

    // Atomically assign rider to order (prevents race conditions)
    const order = await this.ordersRepository.assignRiderToOrder(
      orderId,
      riderProfile._id.toString(),
      userId,
    );

    if (!order) {
      // Order might be already assigned, not READY, or not DOOR_DELIVERY
      const existingOrder = await this.ordersRepository.findById(orderId);
      if (!existingOrder) {
        throw new NotFoundException({
          success: false,
          error: {
            code: 'ORDER_NOT_FOUND',
            message: 'Order not found',
          },
        });
      }

      if (existingOrder.assignedRiderId) {
        throw new ConflictException({
          success: false,
          error: {
            code: 'ORDER_ALREADY_ASSIGNED',
            message: 'This order has already been assigned to another rider',
          },
        });
      }

      if (existingOrder.status !== OrderStatus.READY) {
        throw new BadRequestException({
          success: false,
          error: {
            code: 'ORDER_NOT_READY',
            message: 'Order is not ready for assignment',
          },
        });
      }

      if (existingOrder.deliveryType !== DeliveryType.DOOR_DELIVERY) {
        throw new BadRequestException({
          success: false,
          error: {
            code: 'INVALID_ORDER_TYPE',
            message: 'Only door delivery orders can be assigned to riders',
          },
        });
      }

      // If we get here, something unexpected happened
      throw new BadRequestException({
        success: false,
        error: {
          code: 'ORDER_ASSIGNMENT_FAILED',
          message: 'Failed to assign order. Please try again.',
        },
      });
    }

    // At this point, order is guaranteed to be non-null
    // Get formatted order
    const formattedOrder = await this.formatOrder(order);

    // Notify customer that rider is on the way (using normal notification flow)
    const riderName =
      `${riderProfile.firstName || ''} ${riderProfile.lastName || ''}`.trim() ||
      'A rider';
    await this.notificationsService.queueNotification(
      order.userId.toString(),
      NotificationType.ORDER_OUT_FOR_DELIVERY,
      'Rider Assigned',
      `${riderName} is on the way to pick up your order ${order.orderNumber}.`,
      {
        orderId: order._id.toString(),
        orderNumber: order.orderNumber,
        riderName,
        riderProfileId: riderProfile._id.toString(),
      },
      [NotificationChannel.IN_APP, NotificationChannel.SMS],
    );

    // Notify pickup location that rider is on the way
    if (order.pickupLocationId) {
      await this.notificationsGateway.emitRiderAssignedToPickupLocation(
        order.pickupLocationId.toString(),
        order.orderNumber,
        order._id.toString(),
        {
          riderName:
            `${riderProfile.firstName || ''} ${riderProfile.lastName || ''}`.trim() ||
            'A rider',
          orderNumber: order.orderNumber,
        },
      );
    }

    return {
      success: true,
      message: 'Order accepted successfully',
      data: formattedOrder,
    };
  }

  /**
   * Get orders assigned to the current rider
   * Returns orders that have been accepted by the rider
   */
  async getRiderAssignedOrders(userId: string, filter: GetRiderOrdersDto) {
    // Get rider profile
    const riderProfile = await this.ridersRepository.findByUserId(userId);
    if (!riderProfile) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'RIDER_PROFILE_NOT_FOUND',
          message: 'Rider profile not found',
        },
      });
    }

    // Find orders assigned to this rider
    const orders = await this.ordersRepository.findByAssignedRider(
      riderProfile._id.toString(),
      {
        page: filter.page || 1,
        limit: filter.limit || 20,
        status: filter.status,
      },
    );

    const formattedOrders = await Promise.all(
      orders.items.map((order) => this.formatOrder(order)),
    );

    return {
      success: true,
      message: 'Assigned orders retrieved successfully',
      data: {
        orders: formattedOrders,
        pagination: orders.pagination,
      },
    };
  }

  /**
   * Mark order as delivered (Rider only)
   * Only the assigned rider can mark their order as delivered
   */
  async markOrderAsDelivered(
    orderId: string,
    userId: string,
    message?: string,
    latitude?: number,
    longitude?: number,
  ) {
    // Get rider profile
    const riderProfile = await this.ridersRepository.findByUserId(userId);
    if (!riderProfile) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'RIDER_PROFILE_NOT_FOUND',
          message: 'Rider profile not found',
        },
      });
    }

    // Get order
    const order = await this.ordersRepository.findById(orderId);
    if (!order) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'ORDER_NOT_FOUND',
          message: 'Order not found',
        },
      });
    }

    // Verify order is assigned to this rider
    if (!order.assignedRiderId) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'ORDER_NOT_ASSIGNED',
          message: 'This order is not assigned to any rider',
        },
      });
    }

    if (order.assignedRiderId.toString() !== riderProfile._id.toString()) {
      throw new ForbiddenException({
        success: false,
        error: {
          code: 'ORDER_NOT_ASSIGNED_TO_RIDER',
          message: 'This order is not assigned to you',
        },
      });
    }

    // Verify order can be marked as delivered (must be OUT_FOR_DELIVERY)
    if (order.status !== OrderStatus.OUT_FOR_DELIVERY) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'INVALID_ORDER_STATUS',
          message: `Order must be out for delivery to mark as delivered. Current status: ${order.status}`,
        },
      });
    }

    // Update order status to DELIVERED
    const updatedOrder = await this.ordersRepository.updateOrder(orderId, {
      status: OrderStatus.DELIVERED,
      deliveredAt: new Date(),
    });

    if (!updatedOrder) {
      throw new InternalServerErrorException({
        success: false,
        error: {
          code: 'ORDER_UPDATE_FAILED',
          message: 'Failed to update order status',
        },
      });
    }

    // Create delivery status entry
    await this.ordersRepository.createDeliveryStatus({
      orderId,
      status: DeliveryStatus.DELIVERED,
      message: message || 'Order has been delivered',
      updatedBy: userId,
      latitude,
      longitude,
    });

    // Calculate and update distance covered
    // Need to fetch order with populated pickupLocationId to get coordinates
    const orderWithPickup = await this.ordersRepository.findById(orderId);
    if (
      orderWithPickup?.pickupLocationId &&
      orderWithPickup.deliveryAddress?.coordinates
    ) {
      const pickupLocation = orderWithPickup.pickupLocationId as any; // Populated
      const pickupCoords = pickupLocation.location?.coordinates;
      const deliveryCoords = orderWithPickup.deliveryAddress.coordinates;

      if (pickupCoords && deliveryCoords) {
        // Calculate distance in kilometers, then convert to meters
        const distanceKm = this.calculateDistance(
          pickupCoords[1], // pickup lat
          pickupCoords[0], // pickup lng
          deliveryCoords.latitude,
          deliveryCoords.longitude,
        );
        const distanceMeters = distanceKm * 1000;

        // Update rider profile with distance
        // Need to fetch current value first since updateProfile doesn't support $inc
        const currentDistance = riderProfile.totalDistanceToday || 0;
        await this.ridersRepository.updateProfile(riderProfile._id.toString(), {
          totalDistanceToday: currentDistance + distanceMeters,
        });
      }
    }

    // Send delivery notification to customer
    await this.notificationsService.sendOrderDeliveredNotification(
      order.userId.toString(),
      order.orderNumber,
      orderId,
    );

    return {
      success: true,
      message: 'Order marked as delivered successfully',
      data: await this.formatOrder(updatedOrder),
    };
  }

  /**
   * Mark order as picked up (Rider only)
   * Only the assigned rider can mark their order as picked up
   */
  async markOrderAsPickedUp(
    orderId: string,
    userId: string,
    message?: string,
    latitude?: number,
    longitude?: number,
  ) {
    // Get rider profile
    const riderProfile = await this.ridersRepository.findByUserId(userId);
    if (!riderProfile) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'RIDER_PROFILE_NOT_FOUND',
          message: 'Rider profile not found',
        },
      });
    }

    // Get order
    const order = await this.ordersRepository.findById(orderId);
    if (!order) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'ORDER_NOT_FOUND',
          message: 'Order not found',
        },
      });
    }

    // Verify order is assigned to this rider
    if (!order.assignedRiderId) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'ORDER_NOT_ASSIGNED',
          message: 'This order is not assigned to any rider',
        },
      });
    }

    if (order.assignedRiderId.toString() !== riderProfile._id.toString()) {
      throw new ForbiddenException({
        success: false,
        error: {
          code: 'ORDER_NOT_ASSIGNED_TO_RIDER',
          message: 'This order is not assigned to you',
        },
      });
    }

    // Verify order can be marked as picked up (must be READY)
    if (order.status !== OrderStatus.READY) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'INVALID_ORDER_STATUS',
          message: `Order must be ready to mark as picked up. Current status: ${order.status}`,
        },
      });
    }

    // Update order status to OUT_FOR_DELIVERY
    const updatedOrder = await this.ordersRepository.updateOrder(orderId, {
      status: OrderStatus.OUT_FOR_DELIVERY,
    });

    if (!updatedOrder) {
      throw new InternalServerErrorException({
        success: false,
        error: {
          code: 'ORDER_UPDATE_FAILED',
          message: 'Failed to update order status',
        },
      });
    }

    // Create delivery status entry
    await this.ordersRepository.createDeliveryStatus({
      orderId,
      status: DeliveryStatus.RIDER_PICKED_UP,
      message: message || 'Order has been picked up by rider',
      updatedBy: userId,
      latitude,
      longitude,
    });

    // Send notification to customer
    const riderName =
      `${riderProfile.firstName || ''} ${riderProfile.lastName || ''}`.trim() ||
      'A rider';
    await this.notificationsService.sendOrderOutForDeliveryNotification(
      order.userId.toString(),
      order.orderNumber,
      orderId,
      riderName,
    );

    return {
      success: true,
      message: 'Order marked as picked up successfully',
      data: await this.formatOrder(updatedOrder),
    };
  }
}

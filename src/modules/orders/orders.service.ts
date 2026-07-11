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
import { MarketersService } from '../marketers/marketers.service';
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
import { PlacesService } from '../places/places.service';
import { Types, ClientSession } from 'mongoose';
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
import { PickupLocationsRepository } from '../pickup-locations/pickup-locations.repository';
import { WalletsService } from '../wallets/wallets.service';
import { ChatService } from '../chat/chat.service';
import { AuthRepository } from '../auth/auth.repository';
import { AdminMenuRepository } from '../admin/admin-menu.repository';
import { ConfigService } from '@nestjs/config';
import { SettingsService } from '../settings/settings.service';
import { RedisService } from '../../common/redis/redis.service';
import { createHash } from 'crypto';
import { FoodCategory, PricingType } from '../food-items/schemas/food-item.schema';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

export interface OrderExtraResponse {
  id: string;
  foodExtraId: string;
  name: string;
  description?: string;
  imageUrl?: string;
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
    contactName?: string;
  };
  riderPayout?: number; // deliveryFee + platform base fee — only present in rider-context responses
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
  deliveryConfirmationCode?: string; // 4-digit code for door-delivery orders
  refundId?: number; // Paystack refund ID (for retry when needs-attention)
  hasBeenRefunded?: boolean; // True when refund.processed webhook received (refund completed)
}

@Injectable()
export class OrdersService {

  // Delivery time estimation (in minutes)
  // Riders travel at 15 km/h → 60/15 = 4 minutes per km
  private readonly DELIVERY_TIME_PER_KM = 4;
  private readonly PREP_TIME_MINUTES = 25; // kitchen prep + rider dispatch

  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly ordersRepository: OrdersRepository,
    private readonly cartService: CartService,
    private readonly pickupLocationsService: PickupLocationsService,
    private readonly savedLocationsService: SavedLocationsService,
    private readonly promotionsService: PromotionsService,
    private readonly marketersService: MarketersService,
    private readonly foodItemsRepository: FoodItemsRepository,
    private readonly notificationsService: NotificationsService,
    private readonly notificationsGateway: NotificationsGateway,
    private readonly ordersGateway: OrdersGateway,
    private readonly riderLocationRepository: RiderLocationRepository,
    private readonly ridersRepository: RidersRepository,
    private readonly authRepository: AuthRepository,
    @Inject(forwardRef(() => TransactionsService))
    private readonly transactionsService: TransactionsService,
    @Inject(forwardRef(() => WalletsService))
    private readonly walletsService: WalletsService,
    @Inject(forwardRef(() => ChatService))
    private readonly chatService: ChatService,
    @Inject(forwardRef(() => 'AdminGateway'))
    private readonly adminGateway: any,
    @Inject(forwardRef(() => AdminMenuRepository))
    private readonly adminMenuRepository: AdminMenuRepository | null,
    private readonly pickupLocationsRepository: PickupLocationsRepository,
    private readonly configService: ConfigService,
    private readonly settingsService: SettingsService,
    private readonly redisService: RedisService,
    private readonly placesService: PlacesService,
    @InjectQueue('rider-search') private readonly riderSearchQueue: Queue,
    @InjectQueue('pickup-timeout') private readonly pickupTimeoutQueue: Queue,
  ) {}

  private orderIdempotencyKey(userId: string, itemNames: string[]): string {
    const hash = createHash('sha256')
      .update(`${userId}:${[...itemNames].sort().join(',')}`)
      .digest('hex');
    return `order:idempotency:${hash}`;
  }


  private formatPrice(price: number, currency: string = 'NGN'): string {
    if (price === 0) return 'Free';
    const amount = price / 100;
    return `₦${amount.toLocaleString('en-NG')}`;
  }

  /**
   * Generate a random 4-digit confirmation code
   */
  private generateDeliveryConfirmationCode(): string {
    return Math.floor(1000 + Math.random() * 9000).toString();
  }

  /**
   * Calculate delivery fee charged to the customer.
   * - ₦deliveryFeePerKmKobo per whole km (round), minimum 1km charge
   * The platform separately credits riders a base fee on delivery (see riderBaseFeeKobo in settings).
   */
  private calculateDeliveryFee(
    distanceKm: number,
    deliveryFeePerKmKobo: number,
  ): number {
    if (distanceKm === 0) return 0; // Pickup orders

    return Math.max(1, Math.round(distanceKm)) * deliveryFeePerKmKobo;
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
   * Get road distance + duration via Google Routes API.
   * Falls back to Haversine + DELIVERY_TIME_PER_KM if the API is unavailable.
   */
  private async getRouteWithFallback(
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number,
  ): Promise<{ distanceKm: number; durationMinutes: number }> {
    try {
      const route = await this.placesService.getRoute(
        originLat,
        originLng,
        destLat,
        destLng,
      );
      if (route) {
        return {
          distanceKm: route.distanceMeters / 1000,
          durationMinutes: Math.round(route.durationSeconds / 60),
        };
      }
    } catch {
      // fall through to Haversine
    }
    const distanceKm = this.calculateDistance(originLat, originLng, destLat, destLng);
    return {
      distanceKm,
      durationMinutes: Math.round(distanceKm * this.DELIVERY_TIME_PER_KM),
    };
  }

  /**
   * Generate order number: ORD-YYYY-XXXXXX
   */
  private async generateOrderNumber(): Promise<string> {
    const year = new Date().getFullYear();
    let orderNumber: string;
    do {
      const digits = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
      orderNumber = `ORD-${year}-${digits}`;
    } while (await this.ordersRepository.orderNumberExists(orderNumber));
    return orderNumber;
  }

  private isDemoUser(isDemo: boolean): boolean {
    return isDemo === true;
  }

  private async advanceDemoOrderStatus(order: OrderDocument): Promise<void> {
    const sequence: OrderStatus[] = [
      OrderStatus.CONFIRMED,
      OrderStatus.PREPARING,
      OrderStatus.READY,
      OrderStatus.OUT_FOR_DELIVERY,
      OrderStatus.DELIVERED,
    ];

    const deliveryStatusMap: Partial<Record<OrderStatus, DeliveryStatus>> = {
      [OrderStatus.PREPARING]: DeliveryStatus.PREPARING,
      [OrderStatus.READY]: DeliveryStatus.READY,
      [OrderStatus.OUT_FOR_DELIVERY]: DeliveryStatus.RIDER_PICKED_UP,
      [OrderStatus.DELIVERED]: DeliveryStatus.DELIVERED,
    };

    const currentIndex = sequence.indexOf(order.status);
    if (currentIndex === -1 || currentIndex === sequence.length - 1) return;

    const nextStatus = sequence[currentIndex + 1];

    const updateData: Record<string, unknown> = { status: nextStatus };
    if (nextStatus === OrderStatus.DELIVERED)
      updateData.deliveredAt = new Date();

    await this.ordersRepository.updateOrder(
      order._id.toString(),
      updateData as any,
    );

    const deliveryStatus = deliveryStatusMap[nextStatus];
    if (deliveryStatus) {
      await this.ordersRepository.createDeliveryStatus({
        orderId: order._id.toString(),
        status: deliveryStatus,
        message: 'demo',
        updatedBy: order.userId.toString(),
      });
    }
  }

  /**
   * Validate checkout data
   */
  async validateCheckout(userId: string, dto: ValidateCheckoutDto, isDemo = false) {
    const errors: Array<{ field: string; message: string }> = [];
    const warnings: Array<{ field: string; message: string }> = [];

    this.logger.debug('Checkout validation started', {
      context: 'OrdersService',
      method: 'validateCheckout',
      userId,
      deliveryType: dto.deliveryType,
      hasDeliveryAddressId: Boolean(dto.deliveryAddressId),
      hasInlineDeliveryAddress: Boolean(dto.deliveryAddress),
      hasPickupLocationId: Boolean(dto.pickupLocationId),
      hasPromoCode: Boolean(dto.promoCode),
    });

    // Email and phone are required before checkout
    if (!this.isDemoUser(isDemo)) {
      const userRecord = await this.authRepository.findUserById(userId);
      if (!userRecord?.email) {
        throw new BadRequestException({
          success: false,
          error: {
            code: 'EMAIL_REQUIRED',
            message: 'An email address is required to place an order. Please add one in your profile.',
          },
        });
      }
      if (!userRecord?.phone) {
        throw new BadRequestException({
          success: false,
          error: {
            code: 'PHONE_REQUIRED',
            message: 'A phone number is required to place an order. Please add one in your profile.',
          },
        });
      }
    }

    // Enforce order cutoff time (default 8PM WAT = UTC+1)
    if (!this.isDemoUser(isDemo)) {
      const settings = await this.settingsService.get();
      const nowWAT = new Date(Date.now() + 60 * 60 * 1000); // WAT = UTC+1
      if (nowWAT.getUTCHours() >= settings.orderCutoffHour) {
        throw new BadRequestException({
          success: false,
          error: {
            code: 'ORDER_CUTOFF_REACHED',
            message: `Orders are not accepted after ${settings.orderCutoffHour}:00. Please order again tomorrow.`,
          },
        });
      }
    }

    // Get cart
    const cartData = await this.cartService.getCartForCheckout(userId);
    if (!cartData || cartData.items.length === 0) {
      this.logger.warn('Checkout validation failed - cart empty', {
        context: 'OrdersService',
        method: 'validateCheckout',
        userId,
      });
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
    let routeDurationMinutes = 0;

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
          // Haversine for eligibility gate (fast, no external call)
          distanceKm = this.calculateDistance(
            deliveryAddress.coordinates.latitude,
            deliveryAddress.coordinates.longitude,
            nearest.data.latitude,
            nearest.data.longitude,
          );
          if (distanceKm > 5) {
            errors.push({
              field: 'deliveryType',
              message:
                'Door delivery is not available for your location. Please select pickup.',
            });
          } else if (!this.isDemoUser(isDemo)) {
            // Road distance + duration for accurate fee and ETA
            const road = await this.getRouteWithFallback(
              deliveryAddress.coordinates.latitude,
              deliveryAddress.coordinates.longitude,
              nearest.data.latitude,
              nearest.data.longitude,
            );
            distanceKm = road.distanceKm;
            routeDurationMinutes = road.durationMinutes;
          }
        } catch {
          errors.push({
            field: 'deliveryAddress',
            message: 'No open branches near your location, try again later',
          });
        }
      }
    } else {
      // Pickup - need pickup location
      // Demo mode: auto-assign first active location when none provided
      if (!dto.pickupLocationId && this.isDemoUser(isDemo)) {
        const fallback = await this.pickupLocationsRepository.findFirstActive();
        if (fallback)
          dto = { ...dto, pickupLocationId: fallback._id.toString() };
      }

      if (dto.pickupLocationId) {
        try {
          const location = await this.pickupLocationsService.findOne(
            dto.pickupLocationId,
          );
          pickupLocation = location.data;
          if (!pickupLocation.isActive) {
            errors.push({
              field: 'pickupLocationId',
              message: 'This pickup location is currently closed',
            });
          }
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

    // Check per-location stock
    if (this.adminMenuRepository && pickupLocation?.id) {
      const cartItemIds = items.map((item) => ({
        itemId: item.foodItemId.toString(),
        itemType: 'food' as const,
        name: item.name,
      }));
      const stockStatuses = await this.adminMenuRepository.getStockStatusBatch(
        pickupLocation.id,
        cartItemIds,
      );
      const outOfStockItems: string[] = [];
      for (const item of cartItemIds) {
        const inStock = stockStatuses.get(item.itemId) ?? true;
        if (!inStock) outOfStockItems.push(item.name ?? item.itemId);
      }
      if (outOfStockItems.length > 0) {
        errors.push({
          field: 'items',
          message: `The following items are currently out of stock at this location: ${outOfStockItems.join(', ')}`,
        });
      }
    }

    // Apply location-specific food prices to subtotal
    let adjustedSubtotal = cart.subtotal;
    let locationFoodPrices: Map<string, number | null> | null = null;
    if (this.adminMenuRepository && pickupLocation?.id) {
      const foodInputs = items.map((item) => ({
        itemId: item.foodItemId.toString(),
        itemType: 'food' as const,
      }));
      locationFoodPrices = await this.adminMenuRepository.getLocationPriceBatch(
        pickupLocation.id,
        foodInputs,
      );
      adjustedSubtotal = items.reduce((sum, item) => {
        const locPrice = locationFoodPrices!.get(item.foodItemId.toString());
        return sum + (locPrice ?? item.price) * item.quantity;
      }, 0);
    }

    const settings = await this.settingsService.get();

    // Calculate packaging fee:
    // - per_portion items: 1 pack per 3 portions (ceil), e.g. 7 portions = 3 packs
    // - per_pack items: 1 fee per unit ordered
    // - Protein and Drinks category items are excluded (they share packaging with the main food)
    let packagingFee = 0;
    if (!this.isDemoUser(isDemo)) {
      const itemIds = items.map((item) => item.foodItemId.toString());
      const itemInfo = await this.foodItemsRepository.findPricingTypesByIds(itemIds);
      let packCount = 0;
      for (const item of items) {
        const info = itemInfo.get(item.foodItemId.toString());
        if (info?.category === FoodCategory.PROTEIN || info?.category === FoodCategory.DRINKS) continue;
        const type = info?.pricingType ?? PricingType.PER_PORTION;
        packCount +=
          type === PricingType.PER_PACK
            ? item.quantity
            : Math.ceil(item.quantity / 3);
      }
      packagingFee = packCount * settings.packagingFeeKobo;
    }

    // Calculate delivery fee (customer-facing: floor(km) × per-km rate)
    const deliveryFee =
      dto.deliveryType === DeliveryType.DOOR_DELIVERY
        ? this.calculateDeliveryFee(
            distanceKm,
            settings.deliveryFeePerKmKobo ?? 40000,
          )
        : 0;

    // Validate promo code - always re-validate when promo present (needed for free_delivery + deliveryFee context)
    const codeToValidate = dto.promoCode ?? cart.promoCode;
    let discountAmount = cart.discountAmount;
    let discountPercent = cart.discountPercent;
    let promoCode = cart.promoCode;

    if (codeToValidate) {
      const cartTotal = adjustedSubtotal + cart.extrasTotal;
      const cartItemsForPromo = items.map((item) => {
        const locPrice = locationFoodPrices?.get(item.foodItemId.toString());
        const effectivePrice = locPrice ?? item.price;
        return {
          foodItemId: item.foodItemId.toString(),
          quantity: item.quantity,
          price: effectivePrice,
          lineTotal: effectivePrice * item.quantity,
        };
      });
      const promoContext = {
        orderAmount: cartTotal,
        deliveryFee,
        cartItems: cartItemsForPromo,
      };
      const promoValidation = await this.promotionsService.validateDiscountCode(
        codeToValidate,
        promoContext,
      );
      if (promoValidation.valid) {
        discountAmount = promoValidation.discountAmount || 0;
        discountPercent = promoValidation.promotion?.discountValue;
        promoCode = codeToValidate.toUpperCase();
      } else {
        const marketerValidation = await this.marketersService.validateMarketerCode(
          codeToValidate,
          userId,
          promoContext,
        );
        if (marketerValidation.valid) {
          discountAmount = marketerValidation.discountAmount || 0;
          discountPercent = marketerValidation.marketer?.discountValue;
          promoCode = codeToValidate.toUpperCase();
        } else {
          const message =
            promoValidation.message !== 'Invalid or expired discount code'
              ? promoValidation.message
              : marketerValidation.message || promoValidation.message;
          errors.push({
            field: 'promoCode',
            message: message || 'Invalid promo code',
          });
        }
      }
    }

    // Calculate totals
    const subtotal = adjustedSubtotal;
    const extrasTotal = cart.extrasTotal;
    const total = Math.max(
      0,
      subtotal + extrasTotal + deliveryFee + packagingFee - discountAmount,
    );

    const ridingMinutes = this.isDemoUser(isDemo)
      ? 0
      : (routeDurationMinutes || Math.round(distanceKm * this.DELIVERY_TIME_PER_KM));
    const totalMinutes = this.isDemoUser(isDemo)
      ? 5
      : this.PREP_TIME_MINUTES + ridingMinutes;
    const estimatedDeliveryTime = new Date();
    estimatedDeliveryTime.setMinutes(
      estimatedDeliveryTime.getMinutes() + totalMinutes,
    );

    const isValid = errors.length === 0;

    this.logger.debug('Checkout validation completed', {
      context: 'OrdersService',
      method: 'validateCheckout',
      userId,
      isValid,
      deliveryType: dto.deliveryType,
      errorsCount: errors.length,
      warningsCount: warnings.length,
      errorFields: errors.map((e) => e.field),
    });

    return {
      success: true,
      data: {
        isValid,
        cart: {
          subtotal,
          extrasTotal,
          packagingFee,
          discountAmount,
          discountPercent,
          promoCode,
          total,
        },
        deliveryFee,
        estimatedDeliveryTime: estimatedDeliveryTime.toISOString(),
        estimatedPreparationTime: totalMinutes,
        errors: errors.length > 0 ? errors : undefined,
        warnings: warnings.length > 0 ? warnings : undefined,
      },
    };
  }

  /**
   * Place an order
   *
   * If payment has already succeeded (card + paymentIntentId) and order placement
   * fails before the order is created, this method will attempt to request a refund
   * from Paystack using the payment reference.
   */
  async placeOrder(userId: string, dto: PlaceOrderDto, isDemo = false) {
    let order: OrderDocument | null = null;

    try {
      // Idempotency: if an order already exists for this payment reference, return it
      if (dto.paymentIntentId) {
        const existing = await this.ordersRepository.findByPaymentIntentId(
          dto.paymentIntentId,
        );
        if (existing) {
          this.logger.log(
            `Order already exists for paymentIntentId ${dto.paymentIntentId}, returning existing order`,
          );
          return {
            success: true,
            message: 'Order placed successfully',
            data: await this.formatOrder(existing),
          };
        }
      }

      // Demo mode: resolve pickup location fallback ONCE before validation
      let resolvedPickupLocationId = dto.pickupLocationId;
      if (
        !resolvedPickupLocationId &&
        dto.deliveryType === DeliveryType.PICKUP &&
        this.isDemoUser(isDemo)
      ) {
        const fallback = await this.pickupLocationsRepository.findFirstActive();
        if (fallback) {
          resolvedPickupLocationId = fallback._id.toString();
        }
      }

      // Validate checkout first
      const validation = await this.validateCheckout(userId, {
        deliveryType: dto.deliveryType,
        deliveryAddressId: dto.deliveryAddressId,
        deliveryAddress: dto.deliveryAddress,
        pickupLocationId: resolvedPickupLocationId,
        promoCode: dto.promoCode,
      }, isDemo);

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

      // Idempotency: prevent placing the same order twice within 10 minutes.
      // Key is derived from userId + sorted item names — different items or different
      // user both get a different key, so legitimate back-to-back orders are allowed.
      if (!this.isDemoUser(isDemo)) {
        const itemNames = items.map((i) => i.name);
        const idempotencyKey = this.orderIdempotencyKey(userId, itemNames);
        const existingOrderId = await this.redisService.get(idempotencyKey);
        if (existingOrderId) {
          const existingOrder = await this.ordersRepository.findById(existingOrderId);
          if (existingOrder) {
            this.logger.log(
              `Idempotency hit for user ${userId} — blocking duplicate of order ${existingOrder.orderNumber}`,
            );
            throw new ConflictException({
              success: false,
              error: {
                code: 'DUPLICATE_ORDER',
                message:
                  'You placed this same order recently. Please wait a few minutes before trying again.',
              },
            });
          }
          // Stale key (order was deleted/cancelled) — proceed to create a new one
          await this.redisService.del(idempotencyKey);
        }
      }

      // Build delivery address
      let deliveryAddress: any = null;
      let pickupLocationId: string | undefined;

      if (dto.deliveryType === DeliveryType.DOOR_DELIVERY) {
        // Fetch user name once to store as contactName on the order
        const placeOrderUser = this.isDemoUser(isDemo)
          ? null
          : await this.authRepository.findUserById(userId).catch(() => null);
        const contactName =
          placeOrderUser
            ? [placeOrderUser.firstName, placeOrderUser.lastName].filter(Boolean).join(' ') || undefined
            : undefined;

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
            contactName,
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
            contactName,
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
        // Use the resolved pickup location ID (with demo fallback already applied)
        pickupLocationId = resolvedPickupLocationId;
      }

      // Generate order number
      const orderNumber = await this.generateOrderNumber();

      // Get promo/marketer details for the discount code used
      let promotionId: string | undefined;
      let marketerId: string | undefined;
      if (dto.promoCode) {
        const promotion = await this.promotionsService.getPromotionByDiscountCode(dto.promoCode);
        if (promotion) {
          promotionId = promotion._id.toString();
        } else {
          const marketer = await this.marketersService.findByCode(dto.promoCode);
          if (marketer && marketer.isActive) {
            marketerId = marketer._id.toString();
          }
        }
      }

      // Fetch location-specific prices for order items so stored prices reflect what was paid
      let orderItemLocationPrices: Map<string, number | null> | null = null;
      if (this.adminMenuRepository && pickupLocationId) {
        const foodInputs = items.map((item) => ({
          itemId: item.foodItemId.toString(),
          itemType: 'food' as const,
        }));
        orderItemLocationPrices =
          await this.adminMenuRepository.getLocationPriceBatch(
            pickupLocationId,
            foodInputs,
          );
      }

      // Atomically create order, items, extras, and delivery status
      const session = await this.ordersRepository.startSession();
      try {
        await session.withTransaction(async () => {
          order = await this.ordersRepository.createOrder(
            {
              orderNumber,
              userId,
              deliveryType: dto.deliveryType,
              subtotal: validation.data.cart.subtotal,
              extrasTotal: validation.data.cart.extrasTotal,
              deliveryFee: validation.data.deliveryFee,
              packagingFee: validation.data.cart.packagingFee,
              discountAmount: validation.data.cart.discountAmount,
              discountPercent: validation.data.cart.discountPercent,
              promoCode: validation.data.cart.promoCode,
              promotionId,
              marketerId,
              total: validation.data.cart.total,
              itemCount: cart.itemCount,
              extrasCount: cart.extrasCount,
              deliveryAddress,
              pickupLocationId,
              estimatedDeliveryTime: new Date(
                validation.data.estimatedDeliveryTime,
              ),
              estimatedPreparationTime:
                validation.data.estimatedPreparationTime,
              paymentMethod: this.isDemoUser(isDemo) ? 'demo' : dto.paymentMethod,
              paymentIntentId: this.isDemoUser(isDemo) ? undefined : dto.paymentIntentId,
              instructions: dto.instructions,
            },
            session,
          );

          for (const item of items) {
            const itemExtras = extras.get(item._id.toString()) || [];
            const extrasTotal =
              itemExtras.reduce((sum, e) => sum + e.price * e.quantity, 0) *
              item.quantity;
            const effectivePrice =
              orderItemLocationPrices?.get(item.foodItemId.toString()) ??
              item.price;
            const lineTotal = effectivePrice * item.quantity + extrasTotal;

            const orderItem = await this.ordersRepository.createOrderItem(
              {
                orderId: order!._id.toString(),
                foodItemId: item.foodItemId.toString(),
                name: item.name,
                description: item.description,
                slug: item.slug,
                price: effectivePrice,
                currency: item.currency,
                imageUrl: item.imageUrl,
                quantity: item.quantity,
                estimatedTime: item.estimatedTime,
                lineTotal,
              },
              session,
            );

            for (const extra of itemExtras) {
              await this.ordersRepository.createOrderExtra(
                {
                  orderItemId: orderItem._id.toString(),
                  foodExtraId: extra.foodExtraId.toString(),
                  name: extra.name,
                  description: extra.description,
                  imageUrl: extra.imageUrl,
                  price: extra.price,
                  currency: extra.currency,
                  quantity: extra.quantity,
                },
                session,
              );
            }
          }

          await this.ordersRepository.createDeliveryStatus(
            {
              orderId: order!._id.toString(),
              status: DeliveryStatus.PENDING,
              message: 'Order placed',
            },
            session,
          );
        });
      } catch (transactionError) {
        this.logger.error(
          `Transaction failed while creating order ${orderNumber}`,
          transactionError instanceof Error
            ? transactionError.stack
            : String(transactionError),
        );
        throw new InternalServerErrorException({
          success: false,
          error: {
            code: 'ORDER_TRANSACTION_FAILED',
            message: 'Failed to create order due to database error',
          },
        });
      } finally {
        await session.endSession();
      }

      if (!order) {
        throw new InternalServerErrorException({
          success: false,
          error: {
            code: 'ORDER_CREATE_FAILED',
            message: 'Order creation did not return an order',
          },
        });
      }

      // Assigned inside withTransaction; TS does not narrow `order` across that callback.
      let activeOrder: OrderDocument = order;

      // Demo users bypass Paystack entirely — mark order paid + confirmed immediately
      if (this.isDemoUser(isDemo)) {
        await this.ordersRepository.updateOrder(activeOrder._id.toString(), {
          paymentStatus: PaymentStatus.PAID,
          status: OrderStatus.CONFIRMED,
        });
        const updatedOrder = await this.ordersRepository.findById(activeOrder._id.toString());
        if (updatedOrder) {
          order = updatedOrder;
          activeOrder = updatedOrder;
        }
        return {
          success: true,
          message: 'Order placed successfully',
          data: await this.formatOrder(activeOrder),
        };
      }

      // Card payment path.
      if (activeOrder.paymentMethod === 'card' || activeOrder.paymentMethod === 'paystack') {
        // Legacy "pay-first" flow: client initialized payment separately before creating the
        // order, so a successful transaction already exists for dto.paymentIntentId.
        // Do NOT re-initialize — that would overwrite paymentIntentId with a new reference
        // that was never paid, leaving the order stuck in PENDING forever.
        if (dto.paymentIntentId) {
          try {
            await this.transactionsService.linkTransactionToOrder(
              dto.paymentIntentId,
              activeOrder._id.toString(),
            );
          } catch (e) {
            this.logger.warn(
              `Could not link transaction ${dto.paymentIntentId} to order ${orderNumber}: ${e instanceof Error ? e.message : String(e)}`,
            );
          }

          try {
            await this.transactionsService.verifyPayment(dto.paymentIntentId);
          } catch (e) {
            this.logger.warn(
              `Could not verify pre-existing payment ${dto.paymentIntentId} for order ${orderNumber}: ${e instanceof Error ? e.message : String(e)}`,
            );
          }

          const finalOrder = await this.ordersRepository.findById(activeOrder._id.toString());
          return {
            success: true,
            message: 'Order placed successfully',
            data: await this.formatOrder(finalOrder ?? activeOrder),
          };
        }

        // New "order-first" flow: initialize a fresh Paystack payment now.
        const userRecord = await this.authRepository.findUserById(userId);
        try {
          const paystackResult = await this.transactionsService.initializePayment(
            activeOrder._id.toString(),
            userId,
            userRecord?.email ?? '',
            activeOrder.total,
            'paystack',
          );

          // Persist the Paystack reference on the order so webhook/verify can find it
          await this.ordersRepository.updateOrder(activeOrder._id.toString(), {
            paymentIntentId: paystackResult.data.reference,
          });

          // Set idempotency key — expires in 10 minutes
          const idempotencyKey = this.orderIdempotencyKey(
            userId,
            items.map((i) => i.name),
          );
          await this.redisService.set(idempotencyKey, activeOrder._id.toString(), 600);

          return {
            success: true,
            message: 'Order placed successfully',
            data: {
              ...(await this.formatOrder(activeOrder)),
              authorizationUrl: paystackResult.data.authorizationUrl,
              reference: paystackResult.data.reference,
            },
          };
        } catch (paystackError) {
          this.logger.error(
            `Failed to initialize Paystack payment for order ${orderNumber}`,
            paystackError instanceof Error ? paystackError.message : String(paystackError),
          );
          await this.ordersRepository.updateOrder(activeOrder._id.toString(), {
            status: OrderStatus.CANCELLED,
            cancelledAt: new Date(),
            cancellationReason: 'Payment initialization failed',
          });
          throw paystackError;
        }
      }

      // All other payment methods
      return {
        success: true,
        message: 'Order placed successfully',
        data: await this.formatOrder(activeOrder),
      };
    } catch (error) {
      throw error;
    }
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
      (order.paymentMethod === 'card' || order.paymentMethod === 'paystack')
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
   * Cancel an order. If paid via card, requests a refund before cancelling.
   * Cannot cancel after order has been picked up by rider.
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

    // Cannot cancel after order has been picked up
    if (
      order.status === OrderStatus.OUT_FOR_DELIVERY ||
      order.status === OrderStatus.DELIVERED
    ) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'ORDER_CANNOT_BE_CANCELLED',
          message: 'Order cannot be cancelled after it has been picked up',
        },
      });
    }

    // If paid via Paystack, request refund before cancelling
    if (order.paymentStatus === PaymentStatus.PAID) {
      const paymentReference =
        order.paymentIntentId ??
        (await this.transactionsService.getTransactionByOrderId(orderId))
          ?.reference;

      if (paymentReference) {
        const refundResult =
          await this.transactionsService.requestRefund(paymentReference);
        if (!refundResult.success) {
          throw new BadRequestException({
            success: false,
            error: {
              code: 'REFUND_FAILED',
              message:
                (refundResult.data?.error as string) ??
                'Could not process refund. Please contact support.',
            },
          });
        }
      } else {
        this.logger.warn(
          `Cannot refund order ${orderId}: no payment reference (paymentIntentId or linked transaction)`,
        );
      }
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
  async getOrderTracking(userId: string, orderId: string, isDemo = false) {
    let order = await this.ordersRepository.findById(orderId);

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

    if (this.isDemoUser(isDemo)) {
      await this.advanceDemoOrderStatus(order);
      order = (await this.ordersRepository.findById(orderId))!;
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

    // Get rider information if assigned
    let riderInfo:
      | {
          riderProfileId: string;
          userId: string;
          firstName: string;
          lastName: string;
          phone?: string;
          avatar?: string;
          rating?: number;
          assignedAt?: string;
        }
      | undefined;

    if (order.assignedRiderId) {
      const riderProfile = await this.ridersRepository.findById(
        order.assignedRiderId.toString(),
      );

      if (riderProfile && riderProfile.userId) {
        const riderUser = await this.authRepository.findUserById(
          riderProfile.userId.toString(),
        );

        if (riderUser) {
          riderInfo = {
            riderProfileId: riderProfile._id.toString(),
            userId: riderUser._id.toString(),
            firstName: riderUser.firstName || riderProfile.firstName || '',
            lastName: riderUser.lastName || riderProfile.lastName || '',
            phone: riderUser.phone || riderProfile.phone,
            avatar: riderUser.avatar,
            rating: riderProfile.rating,
            assignedAt: order.assignedAt?.toISOString(),
          };
        }
      }
    }

    return {
      success: true,
      data: {
        order: {
          id: order._id.toString(),
          orderNumber: order.orderNumber,
          status: order.status,
          deliveryConfirmationCode: order.deliveryConfirmationCode,
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
          rider: riderInfo,
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
    skipRefund = false,
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
      [DeliveryStatus.RIDER_DROPPED]: OrderStatus.READY,
      [DeliveryStatus.DELIVERED]: OrderStatus.DELIVERED,
      [DeliveryStatus.CANCELLED]: OrderStatus.CANCELLED,
    };

    const newOrderStatus = orderStatusMap[dto.status];

    // Validate status transitions
    const allowedTransitions: Record<OrderStatus, OrderStatus[]> = {
      [OrderStatus.PENDING]: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
      [OrderStatus.CONFIRMED]: [OrderStatus.PREPARING], // If CONFIRMED is used, allow transition to PREPARING
      [OrderStatus.PREPARING]: [OrderStatus.READY, OrderStatus.CANCELLED],
      [OrderStatus.READY]: [
        OrderStatus.OUT_FOR_DELIVERY,
        ...(order.deliveryType === DeliveryType.PICKUP
          ? [OrderStatus.DELIVERED]
          : []),
        OrderStatus.CANCELLED,
      ],
      [OrderStatus.OUT_FOR_DELIVERY]: [OrderStatus.DELIVERED],
      [OrderStatus.DELIVERED]: [], // No transitions from DELIVERED
      [OrderStatus.CANCELLED]: [], // No transitions from CANCELLED
    };

    // Check if cancellation is allowed (cannot cancel after picked up)
    if (dto.status === DeliveryStatus.CANCELLED) {
      if (
        order.status === OrderStatus.OUT_FOR_DELIVERY ||
        order.status === OrderStatus.DELIVERED
      ) {
        throw new BadRequestException({
          success: false,
          error: {
            code: 'ORDER_CANNOT_BE_CANCELLED',
            message: 'Order cannot be cancelled after it has been picked up',
          },
        });
      }
      // If paid via Paystack, request refund before cancelling (unless explicitly skipped)
      if (order.paymentStatus === PaymentStatus.PAID && !skipRefund) {
        const paymentReference =
          order.paymentIntentId ??
          (await this.transactionsService.getTransactionByOrderId(orderId))
            ?.reference;

        if (paymentReference) {
          const refundResult =
            await this.transactionsService.requestRefund(paymentReference);
          if (!refundResult.success) {
            throw new BadRequestException({
              success: false,
              error: {
                code: 'REFUND_FAILED',
                message:
                  (refundResult.data?.error as string) ??
                  'Could not process refund. Please contact support.',
              },
            });
          }
        } else {
          this.logger.warn(
            `Cannot refund order ${orderId}: no payment reference (paymentIntentId or linked transaction)`,
          );
        }
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
            message:
              'Order must be paid before status can be changed. Please ensure payment is completed first.',
          },
        });
      }
    }

    // Update order status if needed
    const updateData: {
      status?: OrderStatus;
      deliveredAt?: Date;
      cancelledAt?: Date;
      cancellationReason?: string;
    } = {};

    if (newOrderStatus !== order.status) {
      updateData.status = newOrderStatus;
      if (newOrderStatus === OrderStatus.DELIVERED) {
        updateData.deliveredAt = new Date();
      }
      if (newOrderStatus === OrderStatus.CANCELLED) {
        updateData.cancelledAt = new Date();
        updateData.cancellationReason = dto.message;
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
      case DeliveryStatus.READY: {
        let pickupLocationName: string | undefined;
        let pickupLocationAddress: string | undefined;
        let pickupLocationLatitude: number | undefined;
        let pickupLocationLongitude: number | undefined;

        // Pickup details are only required for pickup orders.
        if (order.deliveryType === DeliveryType.PICKUP) {
          const pickupLocationId = this.getPickupLocationIdString(
            order.pickupLocationId,
          );
          if (pickupLocationId && Types.ObjectId.isValid(pickupLocationId)) {
            const pickupLocation =
              await this.pickupLocationsService.findOne(pickupLocationId);
            pickupLocationName = pickupLocation.data?.name ?? undefined;
            pickupLocationAddress = pickupLocation.data?.address ?? undefined;
            pickupLocationLatitude = pickupLocation.data?.latitude ?? undefined;
            pickupLocationLongitude =
              pickupLocation.data?.longitude ?? undefined;
          }
        }
        await this.notificationsService.sendOrderReadyNotification(
          userId,
          order.orderNumber,
          orderId,
          order.deliveryType === DeliveryType.PICKUP,
          pickupLocationName,
          pickupLocationAddress,
          pickupLocationLatitude,
          pickupLocationLongitude,
        );

        // Find nearby active riders for door delivery orders
        if (order.deliveryType === DeliveryType.DOOR_DELIVERY) {
          const ridersFound = await this.findAndNotifyNearbyRiders(order);
          if (!ridersFound) {
            await this.riderSearchQueue.add(
              'search',
              { orderId: order._id.toString(), attempt: 1 },
              { delay: 20 * 60 * 1000 },
            );
            this.logger.log(
              `No riders found for order ${order.orderNumber} on first attempt. Queued retry.`,
            );
            await this.notificationsService.queueNotification(
              userId,
              NotificationType.RIDER_SEARCH_DELAYED,
              'Delay finding a rider',
              `We're having trouble finding a rider for order ${order.orderNumber}. We'll keep trying and update you shortly, or you'll be fully refunded.`,
              { orderId: order._id.toString(), orderNumber: order.orderNumber },
              [
                NotificationChannel.IN_APP,
                NotificationChannel.PUSH,
                NotificationChannel.EMAIL,
              ],
            );
          }
        }
        break;
      }
      case DeliveryStatus.RIDER_PICKED_UP: {
        // Fetch rider name if order is assigned to a rider
        let riderName: string | undefined;
        let riderProfileId: string | undefined;
        if (order.assignedRiderId) {
          const riderProfile = await this.ridersRepository.findById(
            order.assignedRiderId.toString(),
          );
          if (riderProfile) {
            riderName =
              `${riderProfile.firstName || ''} ${riderProfile.lastName || ''}`.trim() ||
              undefined;
            riderProfileId = riderProfile._id.toString();
          }
        }

        // Notify customer
        await this.notificationsService.sendOrderOutForDeliveryNotification(
          userId,
          order.orderNumber,
          orderId,
          riderName,
        );

        // Notify pickup location (for cross-device sync)
        const pickupLocationIdStr = this.getPickupLocationIdString(
          order.pickupLocationId,
        );
        if (pickupLocationIdStr) {
          // Emit to admin dashboard via /admin namespace
          if (this.adminGateway && this.adminGateway.emitOrderPickedUp) {
            await this.adminGateway.emitOrderPickedUp(pickupLocationIdStr, {
              orderId,
              orderNumber: order.orderNumber,
              riderName,
            });

            // Emit status change
            await this.adminGateway.emitOrderStatusChanged(
              pickupLocationIdStr,
              {
                orderId,
                orderNumber: order.orderNumber,
                oldStatus: 'Ready',
                newStatus: 'Picked Up',
              },
            );

            // Emit updated stats
            const pickupLocationObjId = this.getPickupLocationObjectId(
              order.pickupLocationId,
            );
            const stats =
              await this.ordersRepository.getOrderCountsByStatus(
                pickupLocationObjId,
              );
            const todayRevenue =
              await this.ordersRepository.getTodayRevenue(pickupLocationObjId);
            await this.adminGateway.emitOrderStatsUpdate(pickupLocationIdStr, {
              totalOrders:
                stats.pending +
                stats.confirmed +
                stats.preparing +
                stats.ready +
                stats[OrderStatus.OUT_FOR_DELIVERY] +
                stats.delivered +
                stats.cancelled,
              pendingOrders: stats.pending,
              confirmedOrders: stats.confirmed,
              preparingOrders: stats.preparing,
              readyOrders: stats.ready,
              outForDeliveryOrders: stats[OrderStatus.OUT_FOR_DELIVERY],
              deliveredOrders: stats.delivered,
              cancelledOrders: stats.cancelled,
              todayRevenue,
            });
          }

          // Keep backward compatibility for old notification system
          await this.notificationsGateway.emitOrderPickedUpToPickupLocation(
            pickupLocationIdStr,
            order.orderNumber,
            orderId,
            riderName,
          );

          // Notify pickup location's admins that order was picked up
          this.notificationsService
            .notifyPickupLocationAdminsOrderPickedUp(
              pickupLocationIdStr,
              order.orderNumber,
              orderId,
              riderName,
            )
            .catch((err) => {
              this.logger.warn(
                `Failed to notify pickup location admins of order picked up for ${order.orderNumber}: ${err instanceof Error ? err.message : String(err)}`,
              );
            });
        }

        // Notify rider (when pickup location marks as picked up)
        if (riderProfileId) {
          await this.ordersGateway.emitOrderPickedUpToRider(
            riderProfileId,
            orderId,
            order.orderNumber,
          );
        }

        break;
      }
      case DeliveryStatus.DELIVERED:
        await this.notificationsService.sendOrderDeliveredNotification(
          userId,
          order.orderNumber,
          orderId,
        );
        break;
      case DeliveryStatus.CANCELLED:
        await this.notificationsService.sendOrderCancelledNotification(
          userId,
          order.orderNumber,
          orderId,
          dto.message,
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
   * Set hasBeenRefunded on order by payment reference.
   * Used when refund.processed webhook is received (refund completed).
   */
  async updateOrderHasBeenRefundedByReference(
    reference: string,
  ): Promise<void> {
    const order = await this.ordersRepository.findByPaymentIntentId(reference);
    if (!order) return;
    await this.ordersRepository.updateOrder(order._id.toString(), {
      hasBeenRefunded: true,
    });
  }

  /**
   * Update order refundId by payment reference.
   * Used when refund.needs-attention webhook is received to store refundId for retry.
   */
  async updateOrderRefundIdByReference(
    reference: string,
    refundId: number,
  ): Promise<void> {
    const order = await this.ordersRepository.findByPaymentIntentId(reference);
    if (!order) return;
    await this.ordersRepository.updateOrder(order._id.toString(), { refundId });
  }

  /**
   * Update order payment status by payment reference
   * Used by webhook handlers to update payment status
   */
  async updatePaymentStatusByReference(
    reference: string,
    paymentStatus: PaymentStatus,
    refundId?: number,
    session?: ClientSession,
  ): Promise<void> {
    // Atomic conditional update: only transitions from PENDING → new status.
    // If two callers race (webhook + verify, or duplicate webhooks), exactly one
    // gets a non-null document back and runs side effects; the other exits here.
    const extra: Parameters<typeof this.ordersRepository.atomicUpdatePaymentStatus>[2] = {};

    if (refundId !== undefined) extra.refundId = refundId;

    if (paymentStatus === PaymentStatus.PAID) {
      extra.status = OrderStatus.CONFIRMED;
    }

    const order = await this.ordersRepository.atomicUpdatePaymentStatus(
      reference,
      paymentStatus,
      extra,
      session,
    );

    // null means the order was already processed (or doesn't exist) — nothing to do
    if (!order) return;

    if (paymentStatus === PaymentStatus.PAID) {
      // Clear cart now that payment is confirmed
      try {
        await this.cartService.clearCartAfterOrder(order.userId.toString());
      } catch (e) {
        this.logger.warn(
          `Could not clear cart for order ${order.orderNumber}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }

      // Burn promo code now that payment is confirmed
      if (order.promotionId) {
        try {
          await this.promotionsService.incrementPromoUsage(order.promotionId.toString());
        } catch (e) {
          this.logger.warn(
            `Could not increment promo usage for order ${order.orderNumber}: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }

      // Record marketer code usage now that payment is confirmed
      if (order.marketerId) {
        try {
          await this.marketersService.recordUsage(
            order.marketerId.toString(),
            order.userId.toString(),
            order._id.toString(),
            order.subtotal,
            order.discountAmount,
          );
        } catch (e) {
          this.logger.warn(
            `Could not record marketer usage for order ${order.orderNumber}: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }

      // Notify customer — order placed
      await this.notificationsService.sendOrderPlacedNotification(
        order.userId.toString(),
        order.orderNumber,
        order._id.toString(),
        order.total,
      );

      // Notify pickup location admins
      const pickupLocationIdStrForConfirm = this.getPickupLocationIdString(order.pickupLocationId);
      if (pickupLocationIdStrForConfirm) {
        this.notificationsService
          .notifyPickupLocationAdminsNewOrderConfirmed(
            pickupLocationIdStrForConfirm,
            order.orderNumber,
            order._id.toString(),
            order.total,
          )
          .catch((err) => {
            this.logger.warn(
              `Failed to notify pickup location admins of new confirmed order ${order.orderNumber}: ${err instanceof Error ? err.message : String(err)}`,
            );
          });

        this.pickupLocationsRepository
          .findById(pickupLocationIdStrForConfirm)
          .then((location) => {
            return this.notificationsService.notifySuperadminsNewPickupOrderConfirmed(
              pickupLocationIdStrForConfirm,
              location?.name ?? 'Unknown Location',
              order._id.toString(),
              order.orderNumber,
              order.total,
            );
          })
          .catch((err) => {
            this.logger.warn(
              `Failed to notify superadmins of new pickup order ${order.orderNumber}: ${err instanceof Error ? err.message : String(err)}`,
            );
          });
      }

      // Send delivery confirmation code (door delivery only)
      if (
        order.deliveryType === DeliveryType.DOOR_DELIVERY &&
        order.deliveryConfirmationCode
      ) {
        const confirmationCode = order.deliveryConfirmationCode;

        try {
          const user = await this.authRepository.findUserById(order.userId.toString());
          if (user && user.phone) {
            await this.notificationsService.queueNotification(
              order.userId.toString(),
              NotificationType.GENERAL,
              'Delivery Confirmation Code',
              `Your delivery confirmation code for order ${order.orderNumber} is ${confirmationCode}. Share this code with your rider when they deliver your order.`,
              {
                orderId: order._id.toString(),
                orderNumber: order.orderNumber,
                confirmationCode,
                type: 'delivery_confirmation',
                message: `Your delivery confirmation code for order ${order.orderNumber} is ${confirmationCode}. Share this code with your rider when they deliver your order.`,
              },
              [NotificationChannel.SMS],
            );
          }
        } catch (error) {
          this.logger.warn(
            `Failed to send confirmation code SMS for order ${order.orderNumber}`,
            { error: error instanceof Error ? error.message : String(error) },
          );
        }

        await this.notificationsGateway.sendToUser(
          order.userId.toString(),
          'order:confirm_delivery',
          {
            orderId: order._id.toString(),
            orderNumber: order.orderNumber,
            confirmationCode,
            message: `Your delivery confirmation code is ${confirmationCode}. Share this code with your rider when they deliver your order.`,
            timestamp: new Date().toISOString(),
          },
        );
      }

      // Notify admin dashboard
      const pickupLocationIdStr = this.getPickupLocationIdString(order.pickupLocationId);
      if (pickupLocationIdStr) {
        if (this.adminGateway && this.adminGateway.emitOrderCreated) {
          const formattedOrder = await this.formatOrder(order);

          await this.adminGateway.emitOrderCreated(pickupLocationIdStr, {
            orderId: order._id.toString(),
            orderNumber: order.orderNumber,
            total: order.total,
            itemCount: order.itemCount,
            order: formattedOrder,
          });

          const pickupLocationObjId = this.getPickupLocationObjectId(order.pickupLocationId);
          const stats = await this.ordersRepository.getOrderCountsByStatus(pickupLocationObjId);
          const todayRevenue = await this.ordersRepository.getTodayRevenue(pickupLocationObjId);
          await this.adminGateway.emitOrderStatsUpdate(pickupLocationIdStr, {
            totalOrders:
              stats.pending +
              stats.confirmed +
              stats.preparing +
              stats.ready +
              stats[OrderStatus.OUT_FOR_DELIVERY] +
              stats.delivered +
              stats.cancelled,
            pendingOrders: stats.pending,
            confirmedOrders: stats.confirmed,
            preparingOrders: stats.preparing,
            readyOrders: stats.ready,
            outForDeliveryOrders: stats[OrderStatus.OUT_FOR_DELIVERY],
            deliveredOrders: stats.delivered,
            cancelledOrders: stats.cancelled,
            todayRevenue,
          });
        }

        await this.notificationsGateway.emitOrderPlacedToPickupLocation(
          pickupLocationIdStr,
          order.orderNumber,
          order._id.toString(),
          order.total,
          order.itemCount,
        );

        this.logger.log(
          `[updatePaymentStatusByReference] Notified pickup location ${pickupLocationIdStr} about paid order ${order.orderNumber}`,
        );
      }
    } else if (paymentStatus === PaymentStatus.FAILED) {
      await this.notificationsService.sendPaymentFailedNotification(
        order.userId.toString(),
        order.orderNumber,
        order._id.toString(),
      );
      try {
        await this.ordersRepository.deleteById(order._id.toString());
      } catch (e) {
        this.logger.warn(
          `Could not delete failed-payment order ${order.orderNumber}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  }

  // ============ Helper Methods ============

  /**
   * Extract pickup location ID string from order.
   * Handles both ObjectId (unpopulated) and populated document.
   */
  private getPickupLocationIdString(
    pickupLocationId: OrderDocument['pickupLocationId'],
  ): string | null {
    if (!pickupLocationId) return null;
    const pl = pickupLocationId as
      | Types.ObjectId
      | (PickupLocationDocument & { _id: Types.ObjectId });
    if (typeof pl === 'object' && '_id' in pl && pl._id) {
      return pl._id.toString();
    }
    return (pl as Types.ObjectId).toString();
  }

  /**
   * Extract pickup location ObjectId from order for repository queries.
   * Handles both ObjectId (unpopulated) and populated document.
   */
  private getPickupLocationObjectId(
    pickupLocationId: OrderDocument['pickupLocationId'],
  ): Types.ObjectId | undefined {
    const str = this.getPickupLocationIdString(pickupLocationId);
    if (!str || !Types.ObjectId.isValid(str)) return undefined;
    return new Types.ObjectId(str);
  }

  private async formatOrder(
    order: OrderDocument,
    riderBaseFeeKobo?: number,
  ): Promise<OrderResponse> {
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

    // Backfill contactPhone and contactName from the user record if missing on the order
    let deliveryAddress = order.deliveryAddress;
    if (deliveryAddress && (!deliveryAddress.contactPhone || !deliveryAddress.contactName)) {
      try {
        const user = await this.authRepository.findUserById(
          order.userId.toString(),
        );
        if (user) {
          const patch: Partial<typeof deliveryAddress> = {};
          if (!deliveryAddress.contactPhone && user.phone) patch.contactPhone = user.phone;
          if (!deliveryAddress.contactName) {
            const name = [user.firstName, user.lastName].filter(Boolean).join(' ');
            if (name) patch.contactName = name;
          }
          if (Object.keys(patch).length > 0) {
            deliveryAddress = { ...deliveryAddress, ...patch };
          }
        }
      } catch {
        // If user fetch fails, continue without overriding deliveryAddress
      }
    }

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
      deliveryAddress,
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
      deliveryConfirmationCode: order.deliveryConfirmationCode,
      refundId: order.refundId,
      hasBeenRefunded: order.hasBeenRefunded ?? false,
      ...(riderBaseFeeKobo !== undefined && {
        riderPayout: order.deliveryFee + riderBaseFeeKobo,
      }),
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
      refundId: order.refundId,
      hasBeenRefunded: order.hasBeenRefunded ?? false,
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
        description: e.description,
        imageUrl: e.imageUrl,
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
  private async findAndNotifyNearbyRiders(
    order: OrderDocument,
  ): Promise<boolean> {
    try {
      // Get pickup location to get region and coordinates
      if (!order.pickupLocationId) {
        return false;
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
          return false;
        }
        orderWithPickup = fetchedOrder;
      }

      // Get populated pickup location
      const populatedPickupLocation = orderWithPickup.pickupLocationId as any;
      if (
        !populatedPickupLocation ||
        !populatedPickupLocation.location?.coordinates
      ) {
        return false;
      }

      const regionId = populatedPickupLocation.regionId?.toString();
      if (!regionId) {
        return false;
      }

      // Get delivery address coordinates
      if (
        !order.deliveryAddress?.coordinates?.latitude ||
        !order.deliveryAddress?.coordinates?.longitude
      ) {
        return false;
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
        return false;
      }

      // Get rider profile IDs
      const riderProfileIds = profiles.map((p) => p._id);

      // Find riders within 10KM of both pickup location and delivery address
      const MAX_DISTANCE_METERS = 10000; // 10KM

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
        // Also send notifications module notifications (IN_APP + PUSH)
        const notificationPromises = nearbyRiders.map(async (riderLocation) => {
          const riderProfileId = riderLocation.riderProfileId.toString();

          // WebSocket notification (real-time)
          const wsPromise = this.ordersGateway
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
                `Failed to send WebSocket notification to rider ${riderProfileId}: ${err instanceof Error ? err.message : String(err)}`,
              );
              return false;
            });

          // Notifications module notification (IN_APP + PUSH)
          const notificationPromise = (async () => {
            try {
              const rider =
                await this.ridersRepository.findById(riderProfileId);
              if (rider && rider.userId) {
                await this.notificationsService.queueNotification(
                  rider.userId.toString(),
                  NotificationType.RIDER_ORDER_AVAILABLE,
                  'New Delivery Available',
                  `Order ${order.orderNumber} is ready for pickup. Total: ₦${(order.total / 100).toLocaleString('en-NG')}`,
                  {
                    orderId: order._id.toString(),
                    orderNumber: order.orderNumber,
                    pickupLocation: pickupLocationData,
                    deliveryAddress: deliveryAddressData,
                    total: order.total,
                    formattedTotal: `₦${(order.total / 100).toLocaleString('en-NG')}`,
                    itemCount: order.itemCount,
                    source: 'rider_order_available',
                  },
                  [NotificationChannel.IN_APP, NotificationChannel.PUSH],
                );
              }
            } catch (err) {
              this.logger.warn(
                `Failed to send notifications module notification to rider ${riderProfileId}: ${err instanceof Error ? err.message : String(err)}`,
              );
            }
          })();

          // Wait for both to complete (don't fail if one fails)
          await Promise.allSettled([wsPromise, notificationPromise]);
        });

        await Promise.all(notificationPromises);

        this.logger.log(
          `Order ready notifications (WebSocket + Notifications) sent to ${nearbyRiders.length} nearby rider(s) for order ${order.orderNumber}`,
        );
        return true;
      } else {
        this.logger.debug(
          `No nearby riders found within 10KM of both pickup and delivery locations for order ${order.orderNumber}`,
        );
        return false;
      }
    } catch (error) {
      // Log error but don't fail the order status update
      this.logger.error('Error finding nearby riders:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      return false;
    }
  }

  async notifyNearbyRidersForOrder(orderId: string): Promise<boolean> {
    const order = await this.ordersRepository.findById(orderId);
    if (!order || order.status !== OrderStatus.READY || order.assignedRiderId) {
      return false;
    }
    return this.findAndNotifyNearbyRiders(order);
  }

  async isOrderResolved(orderId: string): Promise<boolean> {
    const order = await this.ordersRepository.findById(orderId);
    if (!order || order.status !== OrderStatus.READY || order.assignedRiderId) return true;
    return false;
  }

  async notifyAdminRiderSearch(orderId: string, attempt: number): Promise<void> {
    try {
      const order = await this.ordersRepository.findById(orderId);
      if (!order) return;
      const pickupLocationIdStr = this.getPickupLocationIdString(order.pickupLocationId);
      if (pickupLocationIdStr && this.adminGateway?.emitRiderSearchAttempt) {
        await this.adminGateway.emitRiderSearchAttempt(pickupLocationIdStr, {
          orderId: order._id.toString(),
          orderNumber: order.orderNumber,
          attempt,
          maxAttempts: 3,
        });
      }
    } catch (err) {
      this.logger.warn(
        `Failed to notify admin of rider search for order ${orderId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async cancelOrderBySystem(orderId: string, reason: string): Promise<void> {
    const order = await this.ordersRepository.findById(orderId);
    if (!order) {
      this.logger.warn(`cancelOrderBySystem: order ${orderId} not found`);
      return;
    }

    if (order.paymentStatus === PaymentStatus.PAID) {
      const paymentReference =
        order.paymentIntentId ??
        (await this.transactionsService.getTransactionByOrderId(orderId))
          ?.reference;

      if (paymentReference) {
        try {
          const refundResult =
            await this.transactionsService.requestRefund(paymentReference);
          if (!refundResult.success) {
            this.logger.error(
              `System refund failed for order ${orderId}: ${refundResult.data?.error ?? 'unknown error'}`,
            );
          }
        } catch (err) {
          this.logger.error(
            `System refund threw for order ${orderId}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      } else {
        this.logger.warn(
          `cancelOrderBySystem: no payment reference for order ${orderId}`,
        );
      }
    }

    await this.ordersRepository.updateOrder(orderId, {
      status: OrderStatus.CANCELLED,
      cancelledAt: new Date(),
      cancellationReason: reason,
    });

    await this.ordersRepository.createDeliveryStatus({
      orderId,
      status: DeliveryStatus.CANCELLED,
      message: reason,
    });

    await this.notificationsService.sendOrderCancelledNotification(
      order.userId.toString(),
      order.orderNumber,
      orderId,
      reason,
    );

    this.logger.log(`Order ${order.orderNumber} cancelled by system: ${reason}`);
  }

  /**
   * Get orders eligible for rider
   * Returns orders that are READY and in the rider's region
   * Filters by proximity: rider must be within 15KM of both pickup location and delivery address
   */
  async getRiderEligibleOrders(userId: string, filter: GetRiderOrdersDto, isDemo = false) {
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

    // If rider is not ACTIVE, do not show any eligible orders
    if (riderProfile.status !== RiderStatus.ACTIVE) {
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

    const siteSettings = await this.settingsService.get().catch(() => null);
    const riderBaseFeeKobo = siteSettings?.riderBaseFeeKobo ?? 50000;

    // Demo riders: skip location check and return only their seeded demo orders
    if (isDemo) {
      const demoCustomer = await this.authRepository.findDemoCustomerUser();
      if (!demoCustomer) {
        return {
          success: true,
          message: 'Eligible orders retrieved successfully',
          data: {
            orders: [],
            pagination: { page: 1, limit: 20, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
          },
        };
      }
      const demoOrders = await this.ordersRepository.findDemoReadyOrders(demoCustomer._id.toString());
      const validDemoOrders = demoOrders.filter((o) => o.deliveryAddress?.address);
      const formattedOrders = await Promise.all(validDemoOrders.map((o) => this.formatOrder(o, riderBaseFeeKobo)));
      return {
        success: true,
        message: 'Eligible orders retrieved successfully',
        data: {
          orders: formattedOrders,
          pagination: {
            page: 1,
            limit: formattedOrders.length,
            total: formattedOrders.length,
            totalPages: 1,
            hasNext: false,
            hasPrev: false,
          },
        },
      };
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

    // Get a larger set of orders to filter by proximity.
    // Always fetch from page 1 up to page*limit*3 so that after proximity
    // filtering there are enough results to correctly slice page N.
    const page = filter.page || 1;
    const limit = filter.limit || 20;
    const fetchLimit = page * limit * 3;

    // Find orders in the region with the specified status
    const orders = await this.ordersRepository.findByRegionAndStatus(
      regionId,
      status,
      {
        page: 1,
        limit: fetchLimit,
      },
    );

    // Filter orders by proximity: rider must be within 10KM of both pickup and delivery
    const MAX_DISTANCE_KM = 10;
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
      paginatedOrders.map((order) => this.formatOrder(order, riderBaseFeeKobo)),
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
   * Fire all rider-assigned notifications (customer SMS/in-app, admin WS, pickup location admins).
   * Called by both the rider self-serve acceptOrder flow and the admin assign-rider action.
   */
  async notifyRiderAssigned(order: OrderDocument, riderProfileId: string, riderName: string): Promise<void> {
    await this.notificationsService.queueNotification(
      order.userId.toString(),
      NotificationType.ORDER_OUT_FOR_DELIVERY,
      'Rider Assigned',
      `${riderName} is on the way to pick up your order ${order.orderNumber}.`,
      {
        orderId: order._id.toString(),
        orderNumber: order.orderNumber,
        riderName,
        riderProfileId,
      },
      [NotificationChannel.IN_APP, NotificationChannel.SMS],
    );

    const pickupLocationIdStr = this.getPickupLocationIdString(order.pickupLocationId);
    if (pickupLocationIdStr) {
      if (this.adminGateway?.emitRiderAssigned) {
        await this.adminGateway.emitRiderAssigned(pickupLocationIdStr, {
          orderId: order._id.toString(),
          orderNumber: order.orderNumber,
          riderName,
        });
      }

      await this.notificationsGateway.emitRiderAssignedToPickupLocation(
        pickupLocationIdStr,
        order.orderNumber,
        order._id.toString(),
        { riderName, orderNumber: order.orderNumber },
      );

      this.notificationsService
        .notifyPickupLocationAdminsRiderAssigned(
          pickupLocationIdStr,
          order.orderNumber,
          order._id.toString(),
          riderName,
        )
        .catch((err) => {
          this.logger.warn(
            `Failed to notify pickup location admins of rider assignment for order ${order.orderNumber}: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
    }
  }

  async schedulePickupTimeout(orderId: string, riderProfileId: string): Promise<void> {
    const jobId = `pt-${orderId}`;
    const existing = await this.pickupTimeoutQueue.getJob(jobId);
    if (existing) await existing.remove().catch(() => {});
    await this.pickupTimeoutQueue.add(
      'check',
      { orderId, riderProfileId },
      { jobId, delay: 3 * 60 * 60 * 1000 },
    );
  }

  async releaseTimedOutAssignment(orderId: string, riderProfileId: string): Promise<void> {
    const order = await this.ordersRepository.unassignRiderIfStillAssigned(
      orderId,
      riderProfileId,
    );

    if (!order) {
      this.logger.log(
        `Pickup timeout no-op for order ${orderId} — already picked up, cancelled, or reassigned`,
      );
      return;
    }

    this.logger.warn(
      `Rider ${riderProfileId} did not pick up order ${order.orderNumber} within 3 hours — returning to pool`,
    );

    // Notify the rider their assignment was released
    const riderProfile = await this.ridersRepository.findById(riderProfileId);
    if (riderProfile?.userId) {
      await this.notificationsService
        .queueNotification(
          riderProfile.userId.toString(),
          NotificationType.RIDER_ASSIGNMENT_RELEASED,
          'Assignment Released',
          `Order ${order.orderNumber} was returned to the pool because it wasn't picked up within 3 hours.`,
          { orderId: order._id.toString(), orderNumber: order.orderNumber },
          [NotificationChannel.IN_APP, NotificationChannel.PUSH],
        )
        .catch((err) =>
          this.logger.warn(
            `Failed to notify rider of released assignment for order ${order.orderNumber}: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
    }

    // Notify the customer we're finding them a new rider
    await this.notificationsService
      .queueNotification(
        order.userId.toString(),
        NotificationType.ORDER_FINDING_NEW_RIDER,
        'Finding a new rider',
        `Your rider for order ${order.orderNumber} was unable to pick up your order in time. We're finding you a new rider.`,
        { orderId: order._id.toString(), orderNumber: order.orderNumber },
        [NotificationChannel.IN_APP, NotificationChannel.PUSH],
      )
      .catch((err) =>
        this.logger.warn(
          `Failed to notify customer of re-pool for order ${order.orderNumber}: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );

    // Notify the admin dashboard
    const pickupLocationIdStr = this.getPickupLocationIdString(order.pickupLocationId);
    if (pickupLocationIdStr && this.adminGateway?.emitRiderUnassigned) {
      await this.adminGateway
        .emitRiderUnassigned(pickupLocationIdStr, {
          orderId: order._id.toString(),
          orderNumber: order.orderNumber,
        })
        .catch((err) =>
          this.logger.warn(
            `Failed to notify admin of rider unassignment for order ${order.orderNumber}: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
    }

    // Re-pool: broadcast to nearby riders, fall back to queued search if none online
    try {
      const ridersFound = await this.notifyNearbyRidersForOrder(orderId);
      if (!ridersFound) {
        await this.riderSearchQueue.add(
          'search',
          { orderId: order._id.toString(), attempt: 1 },
          { delay: 20 * 60 * 1000 },
        );
        this.logger.log(
          `No riders online for re-pooled order ${order.orderNumber} — queued rider-search retry`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Failed to re-pool order ${order.orderNumber} after pickup timeout — order may need manual intervention: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
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
    const acceptSiteSettings = await this.settingsService.get().catch(() => null);
    const formattedOrder = await this.formatOrder(order, acceptSiteSettings?.riderBaseFeeKobo ?? 50000);

    await this.notifyRiderAssigned(order, riderProfile._id.toString(), `${riderProfile.firstName || ''} ${riderProfile.lastName || ''}`.trim() || 'A rider');

    await this.schedulePickupTimeout(order._id.toString(), riderProfile._id.toString());

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

    const assignedSiteSettings = await this.settingsService.get().catch(() => null);
    const assignedRiderBaseFee = assignedSiteSettings?.riderBaseFeeKobo ?? 50000;

    const formattedOrders = await Promise.all(
      orders.items.map((order) => this.formatOrder(order, assignedRiderBaseFee)),
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
   * Requires delivery confirmation code from customer
   */
  async markOrderAsDelivered(
    orderId: string,
    userId: string,
    confirmationCode: string,
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

    // Verify delivery confirmation code (for door delivery orders)
    if (order.deliveryType === DeliveryType.DOOR_DELIVERY) {
      if (!order.deliveryConfirmationCode) {
        throw new BadRequestException({
          success: false,
          error: {
            code: 'CONFIRMATION_CODE_MISSING',
            message:
              'Delivery confirmation code is required but not found for this order',
          },
        });
      }

      if (order.deliveryConfirmationCode !== confirmationCode) {
        throw new BadRequestException({
          success: false,
          error: {
            code: 'INVALID_CONFIRMATION_CODE',
            message:
              'Invalid delivery confirmation code. Please verify the code with the customer.',
          },
        });
      }
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

        await this.ridersRepository.incrementProfile(
          riderProfile._id.toString(),
          { totalDistanceToday: distanceMeters },
        );
      }
    }

    // Send delivery notification to customer
    await this.notificationsService.sendOrderDeliveredNotification(
      order.userId.toString(),
      order.orderNumber,
      orderId,
    );

    // Set conversation as read-only (chat is no longer active)
    try {
      await this.chatService.setConversationReadOnly(orderId);
    } catch (error) {
      this.logger.warn(
        `Failed to set conversation as read-only for order ${orderId}`,
        {
          error: error instanceof Error ? error.message : String(error),
        },
      );
      // Don't throw - this is not critical
    }

    // Fetch settings once — used both for wallet credit and riderPayout in response
    const deliverySiteSettings = await this.settingsService.get().catch(() => null);
    const deliveryRiderBaseFee = deliverySiteSettings?.riderBaseFeeKobo ?? 50000;

    // Credit rider wallet immediately with delivery earnings + platform base fee
    // (do not block delivery flow if this fails)
    try {
      if (
        order.deliveryType === DeliveryType.DOOR_DELIVERY &&
        riderProfile._id &&
        order.assignedRiderId &&
        order.assignedRiderId.toString() === riderProfile._id.toString()
      ) {
        await this.walletsService.creditRiderEarningForOrder({
          riderProfileId: riderProfile._id.toString(),
          orderId,
          orderNumber: order.orderNumber,
          amount: order.deliveryFee + deliveryRiderBaseFee,
        });
      }
    } catch (error) {
      this.logger.error(
        `Failed to credit rider earnings for order ${orderId} and rider ${riderProfile._id.toString()}`,
        error instanceof Error ? error.stack : String(error),
      );
    }

    return {
      success: true,
      message: 'Order marked as delivered successfully',
      data: await this.formatOrder(updatedOrder, deliveryRiderBaseFee),
    };
  }

  /**
   * Mark order as picked up (Rider only)
   * Only the assigned rider can mark their order as picked up
   */
  async markOrderAsPickedUp(
    orderId: string,
    userId: string,
    isDemo: boolean,
    message?: string,
    latitude?: number,
    longitude?: number,
  ) {
    // Rider-side self-serve pickup is reserved for the demo flow.
    // In production, pickup must be confirmed by the pickup location admin
    // so the rider's claim is verified at the store.
    if (!isDemo) {
      throw new ForbiddenException({
        success: false,
        error: {
          code: 'PICKUP_REQUIRES_ADMIN_CONFIRMATION',
          message: 'Pickup must be confirmed by the pickup location, not the rider.',
        },
      });
    }

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

    const pickupSiteSettings = await this.settingsService.get().catch(() => null);

    return {
      success: true,
      message: 'Order marked as picked up successfully',
      data: await this.formatOrder(updatedOrder, pickupSiteSettings?.riderBaseFeeKobo ?? 50000),
    };
  }

  /**
   * Drop an accepted order before pickup (Rider only).
   * Unassigns the rider, puts the order back in the eligible pool, and
   * re-notifies nearby riders so it appears as a fresh available order.
   */
  async dropOrder(orderId: string, userId: string) {
    const riderProfile = await this.ridersRepository.findByUserId(userId);
    if (!riderProfile) {
      throw new NotFoundException({
        success: false,
        error: { code: 'RIDER_PROFILE_NOT_FOUND', message: 'Rider profile not found' },
      });
    }

    const order = await this.ordersRepository.findById(orderId);
    if (!order) {
      throw new NotFoundException({
        success: false,
        error: { code: 'ORDER_NOT_FOUND', message: 'Order not found' },
      });
    }

    if (!order.assignedRiderId || order.assignedRiderId.toString() !== riderProfile._id.toString()) {
      throw new ForbiddenException({
        success: false,
        error: { code: 'FORBIDDEN', message: 'This order is not assigned to you' },
      });
    }

    if (order.status !== OrderStatus.READY) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'ORDER_ALREADY_PICKED_UP',
          message: 'Order cannot be dropped after it has been picked up',
        },
      });
    }

    const updatedOrder = await this.ordersRepository.unassignRiderFromOrder(orderId);
    if (!updatedOrder) {
      throw new NotFoundException({
        success: false,
        error: { code: 'ORDER_NOT_FOUND', message: 'Order not found' },
      });
    }

    await this.ordersRepository.createDeliveryStatus({
      orderId,
      status: DeliveryStatus.RIDER_DROPPED,
      message: 'Rider dropped the order before pickup',
      updatedBy: userId,
    });

    // Notify pickup location admins
    const pickupLocationIdStr = this.getPickupLocationIdString(order.pickupLocationId);
    if (pickupLocationIdStr) {
      this.notificationsService
        .notifyPickupLocationAdminsRiderAssigned(
          pickupLocationIdStr,
          order.orderNumber,
          order._id.toString(),
          'A rider dropped this order — it is back in the available pool.',
        )
        .catch((err) => {
          this.logger.warn(
            `Failed to notify pickup location of dropped order ${order.orderNumber}: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
    }

    // Re-notify nearby riders so the order appears as available again (skip demo orders)
    if (updatedOrder.paymentMethod !== 'demo') this.findAndNotifyNearbyRiders(updatedOrder).catch((err) => {
      this.logger.warn(
        `Failed to re-notify nearby riders after order drop ${order.orderNumber}: ${err instanceof Error ? err.message : String(err)}`,
      );
    });

    return {
      success: true,
      message: 'Order dropped successfully',
    };
  }
}

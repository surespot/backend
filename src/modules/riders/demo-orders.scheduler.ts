import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { OrdersRepository } from '../orders/orders.repository';
import { RidersRepository } from './riders.repository';
import { AuthRepository } from '../auth/auth.repository';
import { PickupLocationsRepository } from '../pickup-locations/pickup-locations.repository';
import {
  OrderStatus,
  DeliveryType,
  PaymentStatus,
} from '../orders/schemas/order.schema';

const DEMO_ORDER_TARGET = 3; // keep at least this many READY demo orders
const DEMO_DELIVERY_CODE = '1234'; // fixed code — demo rider always knows it

@Injectable()
export class DemoOrdersScheduler {
  private readonly logger = new Logger(DemoOrdersScheduler.name);

  constructor(
    private readonly ordersRepository: OrdersRepository,
    private readonly ridersRepository: RidersRepository,
    private readonly authRepository: AuthRepository,
    private readonly pickupLocationsRepository: PickupLocationsRepository,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Every 30 minutes: ensure at least DEMO_ORDER_TARGET READY demo orders exist.
   */
  @Cron('*/30 * * * *')
  async replenishDemoOrders() {
    const demoCustomer = await this.authRepository.findDemoCustomerUser();
    if (!demoCustomer) {
      this.logger.debug('No demo customer user found — skipping demo order replenishment');
      return;
    }
    const customerUserId = demoCustomer._id.toString();

    // Find the demo rider profile
    const demoRider = await this.ridersRepository.findDemoRider();
    if (!demoRider) {
      this.logger.debug('No demo rider profile found — skipping demo order replenishment');
      return;
    }

    // Count existing READY demo orders
    const existingOrders = await this.ordersRepository.findDemoReadyOrders(customerUserId);
    const needed = DEMO_ORDER_TARGET - existingOrders.length;
    if (needed <= 0) return;

    // Get pickup location for coordinates
    const pickupLocationIdEnv = this.configService.get<string>('DEMO_PICKUP_LOCATION_ID');
    const pickupLocation = pickupLocationIdEnv
      ? await this.pickupLocationsRepository.findById(pickupLocationIdEnv)
      : await this.pickupLocationsRepository.findFirstActive();

    if (!pickupLocation) {
      this.logger.warn('No active pickup location found — cannot generate demo orders');
      return;
    }

    const pickupLng = pickupLocation.location.coordinates[0]; // GeoJSON [lng, lat]
    const pickupLat = pickupLocation.location.coordinates[1];

    for (let i = 0; i < needed; i++) {
      const orderNumber = `SS-DEMO-${Date.now()}-${i}`;
      const deliveryCoords = this.randomNearby(pickupLat, pickupLng, 1.5, 5);
      const deliveryFeeKobo = Math.round((300000 + Math.random() * 170000) / 1000) * 1000; // ₦300–₦470
      const subtotalKobo = deliveryFeeKobo * 3;
      const totalKobo = subtotalKobo + deliveryFeeKobo;

      try {
        // Create the order directly via repository, bypassing the normal
        // cart/payment flow, and override the auto-generated confirmation code.
        const order = await this.ordersRepository.createOrder({
          orderNumber,
          userId: customerUserId,
          deliveryType: DeliveryType.DOOR_DELIVERY,
          subtotal: subtotalKobo,
          extrasTotal: 0,
          deliveryFee: deliveryFeeKobo,
          packagingFee: 0,
          discountAmount: 0,
          total: totalKobo,
          itemCount: 1,
          extrasCount: 0,
          pickupLocationId: pickupLocation._id.toString(),
          deliveryAddress: {
            address: this.randomStreet(),
            coordinates: deliveryCoords,
            contactPhone: demoCustomer.phone,
          },
        });

        // Override the random confirmation code with the fixed demo code
        await this.ordersRepository.patchDemoOrder(order._id.toString(), {
          status: OrderStatus.READY,
          paymentStatus: PaymentStatus.PAID,
          paymentMethod: 'demo',
          deliveryConfirmationCode: DEMO_DELIVERY_CODE,
        });

        this.logger.log(`Created demo order ${orderNumber}`);
      } catch (err) {
        this.logger.error(`Failed to create demo order: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  /**
   * Daily at 3am: clean up old delivered/cancelled demo orders.
   */
  @Cron('0 3 * * *')
  async cleanupOldDemoOrders() {
    const demoCustomer = await this.authRepository.findDemoCustomerUser();
    if (!demoCustomer) return;

    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const deleted = await this.ordersRepository.deleteDemoOrdersBefore(demoCustomer._id.toString(), cutoff);
    if (deleted > 0) {
      this.logger.log(`Cleaned up ${deleted} old demo orders`);
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private randomNearby(
    lat: number,
    lng: number,
    minKm: number,
    maxKm: number,
  ): { latitude: number; longitude: number } {
    const distanceKm = minKm + Math.random() * (maxKm - minKm);
    const angle = Math.random() * 2 * Math.PI;
    const latOffset = (Math.sin(angle) * distanceKm) / 111;
    const lngOffset = (Math.cos(angle) * distanceKm) / (111 * Math.cos((lat * Math.PI) / 180));
    return { latitude: lat + latOffset, longitude: lng + lngOffset };
  }

  private randomStreet(): string {
    const streets = [
      '14 Admiralty Way, Lekki Phase 1',
      '7 Ozumba Mbadiwe Ave, Victoria Island',
      '22 Bode Thomas Street, Surulere',
      '5 Allen Avenue, Ikeja',
      '31 Akin Adesola Street, Victoria Island',
      '18 Adetokunbo Ademola Street, Wuse 2',
      '3 Ligali Ayorinde Street, Victoria Island',
      '9 Isaac John Street, GRA Ikeja',
    ];
    return streets[Math.floor(Math.random() * streets.length)];
  }
}

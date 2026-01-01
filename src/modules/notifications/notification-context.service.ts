import { Injectable, Logger } from '@nestjs/common';
import { AuthRepository } from '../auth/auth.repository';
import { OrdersRepository } from '../orders/orders.repository';
import {
  UserContext,
  OrderContext,
  NotificationContext,
} from './types/notification-job.types';

@Injectable()
export class NotificationContextService {
  private readonly logger = new Logger(NotificationContextService.name);

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly ordersRepository: OrdersRepository,
  ) {}

  /**
   * Fetch user context for notification processing
   * Only retrieves the fields needed for notifications
   */
  async fetchUserContext(userId: string): Promise<UserContext | null> {
    try {
      const user = await this.authRepository.findUserById(userId);

      if (!user) {
        this.logger.warn(`User not found for context: ${userId}`);
        return null;
      }

      return {
        userId: user._id.toString(),
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        email: user.email || '',
        phone: user.phone || '',
        isEmailVerified: user.isEmailVerified || false,
        expoPushTokens: (user.expoPushTokens as string[] | undefined) || [],
      };
    } catch (error: unknown) {
      this.logger.error(`Failed to fetch user context for ${userId}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Fetch order context for notification processing
   * Only retrieves the fields needed for notifications
   */
  async fetchOrderContext(orderId: string): Promise<OrderContext | null> {
    try {
      const order = await this.ordersRepository.findById(orderId);

      if (!order) {
        this.logger.warn(`Order not found for context: ${orderId}`);
        return null;
      }

      // Fetch order items for the notification
      const orderItems =
        await this.ordersRepository.findOrderItemsByOrderId(orderId);

      return {
        orderId: order._id.toString(),
        orderNumber: order.orderNumber,
        total: order.total,
        subtotal: order.subtotal,
        deliveryFee: order.deliveryFee,
        serviceFee: 0, // Add if exists in schema
        deliveryType: order.deliveryType,
        status: order.status,
        deliveryAddress: order.deliveryAddress
          ? {
              address: order.deliveryAddress.address,
              city: order.deliveryAddress.city,
              state: order.deliveryAddress.state,
            }
          : undefined,
        items: orderItems.map((item) => ({
          name: item.name || '',
          quantity: item.quantity,
          price: item.price,
        })),
        createdAt: order.createdAt || new Date(),
        deliveredAt: order.deliveredAt,
      };
    } catch (error: unknown) {
      this.logger.error(`Failed to fetch order context for ${orderId}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Fetch all required context in parallel
   * Only fetches what's needed based on the data provided
   */
  async fetchContext(
    userId: string,
    data?: Record<string, unknown>,
  ): Promise<NotificationContext> {
    const orderId = data?.orderId as string | undefined;

    // Build promise array for parallel fetching
    const promises: [
      Promise<UserContext | null>,
      Promise<OrderContext | null>,
    ] = [
      this.fetchUserContext(userId),
      orderId ? this.fetchOrderContext(orderId) : Promise.resolve(null),
    ];

    const [user, order] = await Promise.all(promises);

    return { user, order };
  }
}


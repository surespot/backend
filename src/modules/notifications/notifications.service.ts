import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { NotificationsRepository } from './notifications.repository';
import {
  NotificationDocument,
  NotificationType,
  NotificationChannel,
} from './schemas/notification.schema';
import { MailService } from '../mail/mail.service';
import { AuthRepository } from '../auth/auth.repository';
import { OrdersRepository } from '../orders/orders.repository';
import { PickupLocationsService } from '../pickup-locations/pickup-locations.service';
import { NotificationsGateway } from './notifications.gateway';
import {
  NotificationJobData,
  NotificationJobName,
} from './types/notification-job.types';

export interface NotificationResponse {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  channels: NotificationChannel[];
  isRead: boolean;
  readAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly notificationsRepository: NotificationsRepository,
    private readonly mailService: MailService,
    private readonly authRepository: AuthRepository,
    private readonly ordersRepository: OrdersRepository,
    private readonly pickupLocationsService: PickupLocationsService,
    private readonly gateway: NotificationsGateway,
    @InjectQueue('notifications') private readonly notificationQueue: Queue,
  ) {}

  /**
   * Create a notification
   */
  async create(
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    data?: Record<string, unknown>,
    channels: NotificationChannel[] = [NotificationChannel.IN_APP],
  ): Promise<NotificationDocument> {
    const notification = await this.notificationsRepository.create({
      userId,
      type,
      title,
      message,
      data,
      channels,
    });

    this.logger.log(`Notification created for user ${userId}: ${type}`);

    // Send email if channel includes EMAIL
    if (channels.includes(NotificationChannel.EMAIL)) {
      try {
        const user = await this.authRepository.findUserById(userId);
        if (user && user.email && user.isEmailVerified) {
          // Email sending will be handled by specific notification methods
          // This is just a placeholder for future generic email notifications
        }
      } catch (error) {
        this.logger.warn(
          `Failed to send email notification for user ${userId}`,
          {
            error: error instanceof Error ? error.message : String(error),
          },
        );
        // Don't throw - email failure shouldn't break notification creation
      }
    }

    // TODO: Send push notification if channel includes PUSH
    // TODO: Send SMS if channel includes SMS

    return notification;
  }

  /**
   * Queue a notification for processing
   * This is the main method that other modules should use to send notifications
   *
   * Flow:
   * 1. Save notification to DB (for immediate in-app polling visibility)
   * 2. Emit via WebSocket for real-time in-app updates
   * 3. Queue job for SMS/Email/Push processing
   */
  async queueNotification(
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    data?: Record<string, unknown>,
    channels: NotificationChannel[] = [NotificationChannel.IN_APP],
  ): Promise<{ notificationId: string; queued: boolean }> {
    // 1. Save notification to DB (for polling-based in-app notifications)
    const notification = await this.notificationsRepository.create({
      userId,
      type,
      title,
      message,
      data,
      channels,
    });

    const notificationId = notification._id.toString();

    this.logger.log(
      `Notification created: ${notificationId}, type=${type}, channels=${channels.join(',')}`,
    );

    // 2. Emit via WebSocket for real-time in-app updates
    if (channels.includes(NotificationChannel.IN_APP)) {
      try {
        await this.gateway.sendToUser(userId, 'notification', {
          id: notificationId,
          userId,
          type,
          title,
          message,
          data,
          channels,
          isRead: false,
          createdAt: notification.createdAt?.toISOString(),
        });
      } catch (error: unknown) {
        this.logger.warn(
          `Failed to emit WebSocket notification for ${userId}`,
          {
            error: error instanceof Error ? error.message : String(error),
          },
        );
        // Don't throw - WebSocket failure shouldn't break the flow
      }
    }

    // 3. Queue job for other channels (SMS, Email, Push)
    const otherChannels = channels.filter(
      (c) => c !== NotificationChannel.IN_APP,
    );

    if (otherChannels.length > 0) {
      try {
        const jobData: NotificationJobData = {
          notificationId,
          userId,
          type,
          title,
          message,
          data,
          channels: otherChannels,
        };

        await this.notificationQueue.add(
          NotificationJobName.SEND_NOTIFICATION,
          jobData,
          {
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 2000,
            },
            removeOnComplete: 100,
            removeOnFail: 1000,
          },
        );

        this.logger.log(
          `Notification job queued: ${notificationId}, channels=${otherChannels.join(',')}`,
        );

        return { notificationId, queued: true };
      } catch (error: unknown) {
        this.logger.error(`Failed to queue notification job for ${userId}`, {
          error: error instanceof Error ? error.message : String(error),
        });
        // Return success for DB save even if queue fails
        return { notificationId, queued: false };
      }
    }

    return { notificationId, queued: true };
  }

  /**
   * Get user's notifications with pagination
   */
  async getNotifications(
    userId: string,
    filter: {
      page?: number;
      limit?: number;
      isRead?: boolean;
      type?: NotificationType;
    } = {},
  ) {
    const result = await this.notificationsRepository.findByUserId(
      userId,
      filter,
    );

    return {
      success: true,
      message: 'Notifications retrieved successfully',
      data: {
        notifications: result.items.map((n) => this.formatNotification(n)),
        pagination: result.pagination,
      },
    };
  }

  /**
   * Get unread notification count
   */
  async getUnreadCount(userId: string) {
    const count = await this.notificationsRepository.countUnread(userId);

    return {
      success: true,
      data: {
        unreadCount: count,
      },
    };
  }

  /**
   * Mark a notification as read
   */
  async markAsRead(userId: string, notificationId: string) {
    const notification =
      await this.notificationsRepository.findById(notificationId);

    if (!notification) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'NOTIFICATION_NOT_FOUND',
          message: 'Notification not found',
        },
      });
    }

    // Verify ownership
    if (notification.userId.toString() !== userId) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'NOTIFICATION_NOT_FOUND',
          message: 'Notification not found',
        },
      });
    }

    const updated =
      await this.notificationsRepository.markAsRead(notificationId);

    return {
      success: true,
      message: 'Notification marked as read',
      data: this.formatNotification(updated!),
    };
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(userId: string) {
    const count = await this.notificationsRepository.markAllAsRead(userId);

    return {
      success: true,
      message: `${count} notifications marked as read`,
      data: {
        markedCount: count,
      },
    };
  }

  /**
   * Delete a notification
   */
  async delete(userId: string, notificationId: string) {
    const notification =
      await this.notificationsRepository.findById(notificationId);

    if (!notification) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'NOTIFICATION_NOT_FOUND',
          message: 'Notification not found',
        },
      });
    }

    // Verify ownership
    if (notification.userId.toString() !== userId) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'NOTIFICATION_NOT_FOUND',
          message: 'Notification not found',
        },
      });
    }

    await this.notificationsRepository.delete(notificationId);

    return {
      success: true,
      message: 'Notification deleted',
    };
  }

  /**
   * Delete all notifications for a user
   */
  async deleteAll(userId: string) {
    const count = await this.notificationsRepository.deleteAllByUserId(userId);

    return {
      success: true,
      message: `${count} notifications deleted`,
      data: {
        deletedCount: count,
      },
    };
  }

  // ============ Order Notification Helpers ============

  /**
   * Send order placed notification
   * Channels: IN_APP, PUSH
   */
  async sendOrderPlacedNotification(
    userId: string,
    orderNumber: string,
    orderId: string,
    total: number,
  ): Promise<void> {
    await this.queueNotification(
      userId,
      NotificationType.ORDER_PLACED,
      'Order Placed',
      `Your order ${orderNumber} has been placed successfully. Total: ₦${(total / 100).toLocaleString('en-NG')}`,
      { orderId, orderNumber, total },
      [NotificationChannel.IN_APP, NotificationChannel.PUSH],
    );
  }

  /**
   * Send order confirmed notification
   * Channels: IN_APP only
   */
  async sendOrderConfirmedNotification(
    userId: string,
    orderNumber: string,
    orderId: string,
  ): Promise<void> {
    await this.queueNotification(
      userId,
      NotificationType.ORDER_CONFIRMED,
      'Order Confirmed',
      `Your order ${orderNumber} has been confirmed and is being prepared.`,
      { orderId, orderNumber },
      [NotificationChannel.IN_APP],
    );
  }

  /**
   * Send order preparing notification
   * Channels: IN_APP only
   */
  async sendOrderPreparingNotification(
    userId: string,
    orderNumber: string,
    orderId: string,
  ): Promise<void> {
    await this.queueNotification(
      userId,
      NotificationType.ORDER_PREPARING,
      'Order Being Prepared',
      `Your order ${orderNumber} is now being prepared.`,
      { orderId, orderNumber },
      [NotificationChannel.IN_APP],
    );
  }

  /**
   * Send order ready notification
   * Channels: IN_APP, SMS
   */
  async sendOrderReadyNotification(
    userId: string,
    orderNumber: string,
    orderId: string,
    isPickup: boolean,
  ): Promise<void> {
    const message = isPickup
      ? `Your order ${orderNumber} is ready for pickup.`
      : `Your order ${orderNumber} is ready and waiting for a rider.`;

    await this.queueNotification(
      userId,
      NotificationType.ORDER_READY,
      'Order Ready',
      message,
      { orderId, orderNumber, isPickup },
      [NotificationChannel.IN_APP, NotificationChannel.SMS],
    );
  }

  /**
   * Send order out for delivery notification
   * Channels: IN_APP, SMS
   */
  async sendOrderOutForDeliveryNotification(
    userId: string,
    orderNumber: string,
    orderId: string,
  ): Promise<void> {
    await this.queueNotification(
      userId,
      NotificationType.ORDER_OUT_FOR_DELIVERY,
      'Order Picked Up',
      `Your order ${orderNumber} has been picked up and is on its way to you.`,
      { orderId, orderNumber },
      [NotificationChannel.IN_APP, NotificationChannel.SMS],
    );
  }

  /**
   * Send order delivered notification
   * Channels: IN_APP, SMS, EMAIL, PUSH
   */
  async sendOrderDeliveredNotification(
    userId: string,
    orderNumber: string,
    orderId: string,
  ): Promise<void> {
    await this.queueNotification(
      userId,
      NotificationType.ORDER_DELIVERED,
      'Order Delivered',
      `Your order ${orderNumber} has been delivered. Enjoy your meal!`,
      { orderId, orderNumber },
      [
        NotificationChannel.IN_APP,
        NotificationChannel.SMS,
        NotificationChannel.EMAIL,
        NotificationChannel.PUSH,
      ],
    );
  }

  /**
   * Send order cancelled notification
   * Channels: IN_APP only
   */
  async sendOrderCancelledNotification(
    userId: string,
    orderNumber: string,
    orderId: string,
    reason?: string,
  ): Promise<void> {
    const message = reason
      ? `Your order ${orderNumber} has been cancelled. Reason: ${reason}`
      : `Your order ${orderNumber} has been cancelled.`;

    await this.queueNotification(
      userId,
      NotificationType.ORDER_CANCELLED,
      'Order Cancelled',
      message,
      { orderId, orderNumber, reason },
      [NotificationChannel.IN_APP],
    );
  }

  /**
   * Send payment success notification
   * Channels: IN_APP, EMAIL
   */
  async sendPaymentSuccessNotification(
    userId: string,
    orderNumber: string,
    orderId: string,
    amount: number,
  ): Promise<void> {
    await this.queueNotification(
      userId,
      NotificationType.PAYMENT_SUCCESS,
      'Payment Successful',
      `Payment of ₦${(amount / 100).toLocaleString('en-NG')} for order ${orderNumber} was successful.`,
      { orderId, orderNumber, amount },
      [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
    );
  }

  /**
   * Send payment failed notification
   * Channels: IN_APP, EMAIL
   */
  async sendPaymentFailedNotification(
    userId: string,
    orderNumber: string,
    orderId: string,
    reason?: string,
  ): Promise<void> {
    const message = reason
      ? `Payment for order ${orderNumber} failed. Reason: ${reason}`
      : `Payment for order ${orderNumber} failed. Please try again.`;

    await this.queueNotification(
      userId,
      NotificationType.PAYMENT_FAILED,
      'Payment Failed',
      message,
      { orderId, orderNumber, reason },
      [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
    );
  }

  /**
   * Send welcome notification when user signs up
   * Channels: IN_APP only
   */
  async sendWelcomeNotification(userId: string): Promise<void> {
    await this.queueNotification(
      userId,
      NotificationType.GENERAL,
      'Welcome to SureSpot!',
      "Thank you for joining SureSpot! We're excited to serve you delicious meals.",
      { isWelcome: true },
      [NotificationChannel.IN_APP],
    );
  }

  /**
   * Send rate order reminder notification
   * Channels: IN_APP, PUSH
   */
  async sendRateOrderReminderNotification(
    userId: string,
    orderNumber: string,
    orderId: string,
  ): Promise<void> {
    await this.queueNotification(
      userId,
      NotificationType.GENERAL,
      'Rate Your Order',
      `How was your order ${orderNumber}? We'd love to hear your feedback!`,
      { orderId, orderNumber, isRateReminder: true },
      [NotificationChannel.IN_APP, NotificationChannel.PUSH],
    );
  }

  /**
   * Send promotion notification
   * Channels: PUSH only
   */
  async sendPromotionNotification(
    userId: string,
    title: string,
    message: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    await this.queueNotification(
      userId,
      NotificationType.PROMOTION,
      title,
      message,
      data,
      [NotificationChannel.PUSH],
    );
  }

  /**
   * Register or update push notification token
   */
  async registerPushToken(userId: string, token: string) {
    try {
      const user = await this.authRepository.findUserById(userId);
      if (!user) {
        throw new NotFoundException({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found',
          },
        });
      }

      // Get existing tokens or initialize empty array
      const existingTokens: string[] =
        (user.expoPushTokens as string[] | undefined) || [];

      // Add token if it doesn't exist
      if (!existingTokens.includes(token)) {
        const updatedTokens = [...existingTokens, token];
        await this.authRepository.updateUser(userId, {
          expoPushTokens: updatedTokens,
        });

        this.logger.log(`Push token registered for user ${userId}`);
      } else {
        this.logger.debug(`Push token already exists for user ${userId}`);
      }

      return {
        success: true,
        message: 'Push token registered successfully',
      };
    } catch (error: unknown) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to register push token for user ${userId}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Remove push notification token
   */
  async removePushToken(userId: string, token: string) {
    try {
      const user = await this.authRepository.findUserById(userId);
      if (!user) {
        throw new NotFoundException({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found',
          },
        });
      }

      const existingTokens: string[] =
        (user.expoPushTokens as string[] | undefined) || [];
      const updatedTokens: string[] = existingTokens.filter(
        (t: string) => t !== token,
      );

      await this.authRepository.updateUser(userId, {
        expoPushTokens: updatedTokens,
      });

      this.logger.log(`Push token removed for user ${userId}`);

      return {
        success: true,
        message: 'Push token removed successfully',
      };
    } catch (error: unknown) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to remove push token for user ${userId}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private formatNotification(
    notification: NotificationDocument,
  ): NotificationResponse {
    return {
      id: notification._id.toString(),
      userId: notification.userId.toString(),
      type: notification.type,
      title: notification.title,
      message: notification.message,
      data: notification.data,
      channels: notification.channels,
      isRead: notification.isRead,
      readAt: notification.readAt?.toISOString(),
      createdAt: notification.createdAt?.toISOString(),
      updatedAt: notification.updatedAt?.toISOString(),
    };
  }
}

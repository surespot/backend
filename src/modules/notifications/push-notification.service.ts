import { Injectable, Logger } from '@nestjs/common';
import { AuthRepository } from '../auth/auth.repository';
import { UserRole } from '../auth/schemas/user.schema';
import { NotificationType } from './schemas/notification.schema';
import { FcmSenderService } from './fcm-sender.service';
import { ApnsSenderService } from './apns-sender.service';

export interface PushNotificationOptions {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  priority?: 'default' | 'normal' | 'high';
  badge?: number;
  channelId?: string;
}

/**
 * Sends push notifications directly via FCM (Android) and APNS (iOS),
 * bypassing Expo's push relay. See FcmSenderService / ApnsSenderService.
 */
@Injectable()
export class PushNotificationService {
  private readonly logger = new Logger(PushNotificationService.name);

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly fcmSender: FcmSenderService,
    private readonly apnsSender: ApnsSenderService,
  ) {}

  /**
   * Send push notification to a single user, across all of their registered devices.
   */
  async sendToUser(
    userId: string,
    options: PushNotificationOptions,
  ): Promise<boolean> {
    try {
      const user = await this.authRepository.findUserById(userId);
      if (!user) {
        this.logger.warn(`[sendToUser] User ${userId} not found in DB`);
        return false;
      }

      const pushTokens = user.pushTokens ?? [];
      if (pushTokens.length === 0) {
        this.logger.warn(`[sendToUser] User ${userId} has no push tokens stored`);
        return false;
      }

      const androidTokens = pushTokens
        .filter((t) => t.platform === 'android')
        .map((t) => t.token);
      const iosTokens = pushTokens
        .filter((t) => t.platform === 'ios')
        .map((t) => t.token);

      const [fcmResults, apnsResults] = await Promise.all([
        androidTokens.length
          ? this.fcmSender.sendToTokens(androidTokens, {
              title: options.title,
              body: options.body,
              data: options.data,
              sound: options.sound ?? 'default',
              priority: options.priority,
              channelId: options.channelId,
            })
          : Promise.resolve([]),
        iosTokens.length
          ? this.apnsSender.sendToTokens(iosTokens, {
              title: options.title,
              body: options.body,
              data: options.data,
              sound: options.sound ?? 'default',
              badge: options.badge,
              isRider: user.role === UserRole.RIDER,
            })
          : Promise.resolve([]),
      ]);

      const allResults = [...fcmResults, ...apnsResults];

      const invalidTokens = allResults
        .filter((r) => r.invalidToken)
        .map((r) => r.token);
      if (invalidTokens.length > 0) {
        await this.removeInvalidTokens(userId, invalidTokens);
      }

      const succeeded = allResults.filter((r) => r.success).length;
      const failed = allResults.filter((r) => !r.success);
      if (failed.length > 0) {
        this.logger.warn(
          `[sendToUser] ${failed.length}/${allResults.length} push(es) failed for user ${userId}`,
          { errors: failed.map((f) => f.error) },
        );
      }

      return succeeded > 0;
    } catch (error) {
      this.logger.error(`[sendToUser] Unhandled error for user ${userId}`, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      return false;
    }
  }

  /**
   * Send push notification to multiple users
   */
  async sendToUsers(
    userIds: string[],
    options: PushNotificationOptions,
  ): Promise<number> {
    let sentCount = 0;

    for (const userId of userIds) {
      const sent = await this.sendToUser(userId, options);
      if (sent) {
        sentCount++;
      }
    }

    return sentCount;
  }

  private async removeInvalidTokens(
    userId: string,
    invalidTokens: string[],
  ): Promise<void> {
    try {
      const user = await this.authRepository.findUserById(userId);
      if (user?.pushTokens) {
        const updatedTokens = user.pushTokens.filter(
          (t) => !invalidTokens.includes(t.token),
        );
        await this.authRepository.updateUser(userId, {
          pushTokens: updatedTokens,
        });
        this.logger.log(
          `Removed ${invalidTokens.length} invalid push token(s) for user ${userId}`,
        );
      }
    } catch (error) {
      this.logger.error(`Error removing invalid push tokens for user ${userId}`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Send order placed push notification
   */
  async sendOrderPlaced(
    userId: string,
    orderNumber: string,
    orderId: string,
    total: number,
  ): Promise<boolean> {
    return this.sendToUser(userId, {
      title: 'Order Placed',
      body: `Your order ${orderNumber} has been placed successfully. Total: ₦${(total / 100).toLocaleString('en-NG')}`,
      data: {
        type: NotificationType.ORDER_PLACED,
        orderId,
        orderNumber,
        total,
      },
      priority: 'high',
    });
  }

  async sendOrderReady(
    userId: string,
    orderNumber: string,
    orderId: string,
  ): Promise<boolean> {
    return this.sendToUser(userId, {
      title: 'Order Ready',
      body: `Your order ${orderNumber} is ready and a rider is on the way to pick it up!`,
      data: {
        type: NotificationType.ORDER_READY,
        orderId,
        orderNumber,
      },
      priority: 'high',
    });
  }

  /**
   * Send order delivered push notification
   */
  async sendOrderDelivered(
    userId: string,
    orderNumber: string,
    orderId: string,
  ): Promise<boolean> {
    return this.sendToUser(userId, {
      title: 'Order Delivered',
      body: `Your order ${orderNumber} has been delivered. Enjoy your meal!`,
      data: {
        type: NotificationType.ORDER_DELIVERED,
        orderId,
        orderNumber,
      },
      priority: 'high',
      badge: 1,
    });
  }

  /**
   * Send promotion push notification
   */
  async sendPromotion(
    userId: string,
    title: string,
    message: string,
    data?: Record<string, unknown>,
  ): Promise<boolean> {
    return this.sendToUser(userId, {
      title,
      body: message,
      data: {
        type: NotificationType.PROMOTION,
        ...data,
      },
      priority: 'default',
    });
  }

  /**
   * Send rate this meal push notification
   */
  async sendRateThisMeal(
    userId: string,
    orderNumber: string,
    orderId: string,
  ): Promise<boolean> {
    return this.sendToUser(userId, {
      title: 'Rate This Meal',
      body: `How was your order ${orderNumber}? We'd love to hear your feedback!`,
      data: {
        type: NotificationType.GENERAL,
        orderId,
        orderNumber,
      },
      priority: 'default',
    });
  }

  /**
   * Send Monday earnings-withdrawal reminder push notification to a rider
   */
  async sendMondayEarningsReminder(userId: string): Promise<boolean> {
    return this.sendToUser(userId, {
      title: 'Withdraw Your Earnings',
      body: "It's Monday! You can withdraw your earnings today.",
      data: {
        type: NotificationType.GENERAL,
        isMondayEarningsReminder: true,
      },
      priority: 'default',
    });
  }
}

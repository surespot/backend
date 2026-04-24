import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';
import { AuthRepository } from '../auth/auth.repository';
import { NotificationType } from './schemas/notification.schema';

export interface PushNotificationOptions {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  priority?: 'default' | 'normal' | 'high';
  badge?: number;
}

@Injectable()
export class PushNotificationService {
  private readonly logger = new Logger(PushNotificationService.name);
  private readonly expo: Expo;
  private readonly accessToken?: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly authRepository: AuthRepository,
  ) {
    this.accessToken = this.configService.get<string>('EXPO_ACCESS_TOKEN');
    this.expo = new Expo({ accessToken: this.accessToken });
    this.logger.log(
      `PushNotificationService initialized. EXPO_ACCESS_TOKEN ${this.accessToken ? 'is set' : 'is NOT set — pushes will likely fail'}`,
    );
  }

  /**
   * Send push notification to a single user
   */
  async sendToUser(
    userId: string,
    options: PushNotificationOptions,
  ): Promise<boolean> {
    this.logger.log(
      `[sendToUser] Starting push for userId=${userId}, title="${options.title}"`,
    );
    try {
      const user = await this.authRepository.findUserById(userId);
      if (!user) {
        this.logger.warn(`[sendToUser] User ${userId} not found in DB`);
        return false;
      }
      if (!user.expoPushTokens || user.expoPushTokens.length === 0) {
        this.logger.warn(
          `[sendToUser] User ${userId} has no expoPushTokens stored`,
        );
        return false;
      }

      this.logger.log(
        `[sendToUser] User ${userId} has ${user.expoPushTokens.length} token(s): ${JSON.stringify(user.expoPushTokens)}`,
      );

      // Filter out invalid tokens
      const validTokens = user.expoPushTokens.filter((token) =>
        Expo.isExpoPushToken(token),
      );

      if (validTokens.length === 0) {
        this.logger.warn(
          `[sendToUser] All tokens for user ${userId} failed Expo.isExpoPushToken() validation`,
        );
        return false;
      }

      this.logger.log(
        `[sendToUser] ${validTokens.length}/${user.expoPushTokens.length} tokens valid for user ${userId}`,
      );

      // Create push messages
      const messages: ExpoPushMessage[] = validTokens.map((token) => ({
        to: token,
        title: options.title,
        body: options.body,
        data: options.data,
        sound: options.sound ?? 'default',
        priority: options.priority ?? 'default',
        badge: options.badge,
      }));

      // Send notifications in chunks (Expo allows up to 100 at a time)
      const chunks = this.expo.chunkPushNotifications(messages);
      this.logger.log(
        `[sendToUser] Sending ${messages.length} message(s) in ${chunks.length} chunk(s) for user ${userId}`,
      );
      const tickets: ExpoPushTicket[] = [];

      for (const chunk of chunks) {
        try {
          const ticketChunk = await this.expo.sendPushNotificationsAsync(chunk);
          this.logger.log(
            `[sendToUser] Chunk response for user ${userId}: ${JSON.stringify(ticketChunk)}`,
          );
          tickets.push(...ticketChunk);
        } catch (error) {
          this.logger.error(
            `[sendToUser] Error sending push chunk for user ${userId}`,
            {
              error: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined,
            },
          );
        }
      }

      // Check for errors in tickets
      const errors: string[] = [];
      tickets.forEach((ticket, index) => {
        if (ticket.status === 'error') {
          errors.push(
            `Token ${validTokens[index]}: ${ticket.message || 'Unknown error'} (details: ${JSON.stringify(ticket.details)})`,
          );

          // If token is invalid, remove it from user's tokens
          if (ticket.details?.error === 'DeviceNotRegistered') {
            this.removeInvalidToken(userId, validTokens[index]);
          }
        }
      });

      if (errors.length > 0) {
        this.logger.warn(
          `[sendToUser] Some push notifications failed for user ${userId}`,
          { errors },
        );
      } else {
        this.logger.log(
          `[sendToUser] All tickets OK for user ${userId} (${tickets.length} ticket(s))`,
        );
      }

      this.logger.log(
        `[sendToUser] Done for user ${userId} — ${tickets.length} ticket(s) received`,
      );

      return true;
    } catch (error) {
      this.logger.error(
        `[sendToUser] Unhandled error for user ${userId}`,
        {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
      );
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

  /**
   * Remove invalid push token from user
   */
  private async removeInvalidToken(
    userId: string,
    token: string,
  ): Promise<void> {
    try {
      const user = await this.authRepository.findUserById(userId);
      if (user && user.expoPushTokens) {
        const updatedTokens = user.expoPushTokens.filter((t) => t !== token);
        await this.authRepository.updateUser(userId, {
          expoPushTokens: updatedTokens,
        });
        this.logger.log(`Removed invalid push token for user ${userId}`);
      }
    } catch (error) {
      this.logger.error(
        `Error removing invalid push token for user ${userId}`,
        {
          error: error instanceof Error ? error.message : String(error),
        },
      );
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
}

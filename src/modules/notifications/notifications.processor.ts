import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  NotificationJobData,
  NotificationJobName,
  NotificationJobResult,
  ChannelDeliveryResult,
} from './types/notification-job.types';
import {
  NotificationChannel,
  NotificationType,
} from './schemas/notification.schema';
import { NotificationContextService } from './notification-context.service';
import { NotificationsGateway } from './notifications.gateway';
import { PushNotificationService } from './push-notification.service';
import { SmsService } from '../sms/sms.service';
import { MailService } from '../mail/mail.service';
import { NotificationsRepository } from './notifications.repository';
import { DeliveryType } from '../orders/schemas/order.schema';

@Processor('notifications', {
  concurrency: 3,
})
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(
    private readonly contextService: NotificationContextService,
    private readonly gateway: NotificationsGateway,
    private readonly pushService: PushNotificationService,
    private readonly smsService: SmsService,
    private readonly mailService: MailService,
    private readonly notificationsRepository: NotificationsRepository,
  ) {
    super();
  }

  async process(job: Job<NotificationJobData>): Promise<NotificationJobResult> {
    const { notificationId, userId, type, title, message, data, channels } =
      job.data;

    this.logger.log(
      `Processing notification job ${job.id}: type=${type}, userId=${userId}, channels=${channels.join(',')}`,
    );

    // Fetch context in parallel
    const context = await this.contextService.fetchContext(userId, data);

    if (!context.user) {
      this.logger.warn(
        `User not found for notification ${notificationId}, skipping`,
      );
      return {
        notificationId,
        userId,
        type,
        channelResults: channels.map((channel) => ({
          channel,
          success: false,
          error: 'User not found',
        })),
        processedAt: new Date(),
      };
    }

    // Process each channel
    const channelResults: ChannelDeliveryResult[] = [];

    for (const channel of channels) {
      const result = await this.processChannel(
        channel,
        type,
        notificationId,
        context.user,
        context.order,
        title,
        message,
        data,
      );
      channelResults.push(result);

      // Update notification status for this channel
      await this.updateChannelStatus(notificationId, channel, result.success);
    }

    this.logger.log(
      `Notification job ${job.id} completed: ${channelResults.filter((r) => r.success).length}/${channelResults.length} channels successful`,
    );

    return {
      notificationId,
      userId,
      type,
      channelResults,
      processedAt: new Date(),
    };
  }

  private async processChannel(
    channel: NotificationChannel,
    type: NotificationType,
    notificationId: string,
    user: NonNullable<
      Awaited<ReturnType<NotificationContextService['fetchUserContext']>>
    >,
    order: Awaited<ReturnType<NotificationContextService['fetchOrderContext']>>,
    title: string,
    message: string,
    data?: Record<string, unknown>,
  ): Promise<ChannelDeliveryResult> {
    try {
      switch (channel) {
        case NotificationChannel.IN_APP:
          return await this.processInApp(
            type,
            notificationId,
            user,
            order,
            data,
          );

        case NotificationChannel.SMS:
          return await this.processSms(type, user, order, data);

        case NotificationChannel.EMAIL:
          return await this.processEmail(type, user, order, data);

        case NotificationChannel.PUSH:
          return await this.processPush(
            type,
            user,
            order,
            title,
            message,
            data,
          );

        default:
          return {
            channel,
            success: false,
            error: `Unknown channel: ${channel}`,
          };
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Error processing ${channel} for notification ${notificationId}`,
        { error: errorMessage },
      );
      return {
        channel,
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Process IN_APP notifications via WebSocket
   */
  private async processInApp(
    type: NotificationType,
    notificationId: string,
    user: NonNullable<
      Awaited<ReturnType<NotificationContextService['fetchUserContext']>>
    >,
    order: Awaited<ReturnType<NotificationContextService['fetchOrderContext']>>,
    data?: Record<string, unknown>,
  ): Promise<ChannelDeliveryResult> {
    const orderNumber = order?.orderNumber || '';
    const orderId = order?.orderId || '';
    const total = order?.total || 0;
    const isPickup = order?.deliveryType === DeliveryType.PICKUP;
    const amount = (data?.amount as number) || total;
    const reason = data?.reason as string | undefined;

    let success = false;

    switch (type) {
      case NotificationType.PAYMENT_SUCCESS:
        success = await this.gateway.emitPaymentReceived(
          user.userId,
          notificationId,
          orderNumber,
          orderId,
          amount,
        );
        break;

      case NotificationType.ORDER_PLACED:
        success = await this.gateway.emitOrderPlaced(
          user.userId,
          notificationId,
          orderNumber,
          orderId,
          total,
        );
        break;

      case NotificationType.ORDER_READY:
        success = await this.gateway.emitOrderReady(
          user.userId,
          notificationId,
          orderNumber,
          orderId,
          isPickup,
        );
        break;

      case NotificationType.ORDER_OUT_FOR_DELIVERY:
        success = await this.gateway.emitOrderPickedUp(
          user.userId,
          notificationId,
          orderNumber,
          orderId,
        );
        break;

      case NotificationType.ORDER_DELIVERED:
        success = await this.gateway.emitOrderDelivered(
          user.userId,
          notificationId,
          orderNumber,
          orderId,
        );
        break;

      case NotificationType.PAYMENT_FAILED:
        success = await this.gateway.emitPaymentFailed(
          user.userId,
          notificationId,
          orderNumber,
          orderId,
          reason,
        );
        break;

      case NotificationType.GENERAL:
        // Check if it's a rate reminder or welcome notification
        if (data?.isRateReminder && orderId) {
          success = await this.gateway.emitRateReminder(
            user.userId,
            notificationId,
            orderNumber,
            orderId,
          );
        } else if (data?.isWelcome) {
          success = await this.gateway.emitWelcome(user.userId, notificationId);
        } else {
          // Generic notification - send via sendToUser
          success = await this.gateway.sendToUser(user.userId, 'notification', {
            id: notificationId,
            type,
            title: data?.title || 'Notification',
            message: data?.message || '',
            data,
            isRead: false,
            createdAt: new Date().toISOString(),
          });
        }
        break;

      default:
        this.logger.warn(`Unhandled IN_APP notification type: ${type}`);
        return {
          channel: NotificationChannel.IN_APP,
          success: false,
          error: `Unhandled notification type: ${type}`,
        };
    }

    return {
      channel: NotificationChannel.IN_APP,
      success,
    };
  }

  /**
   * Process SMS notifications
   */
  private async processSms(
    type: NotificationType,
    user: NonNullable<
      Awaited<ReturnType<NotificationContextService['fetchUserContext']>>
    >,
    order: Awaited<ReturnType<NotificationContextService['fetchOrderContext']>>,
    data?: Record<string, unknown>,
  ): Promise<ChannelDeliveryResult> {
    if (!user.phone) {
      return {
        channel: NotificationChannel.SMS,
        success: false,
        error: 'User has no phone number',
      };
    }

    const orderNumber = order?.orderNumber || '';

    let result;

    switch (type) {
      case NotificationType.ORDER_READY:
        result = await this.smsService.sendOrderReadyNotification(
          user.phone,
          orderNumber,
        );
        break;

      case NotificationType.ORDER_OUT_FOR_DELIVERY:
        // Extract riderName from notification data if available
        const riderName = data?.riderName as string | undefined;
        result = await this.smsService.sendOrderPickedUpNotification(
          user.phone,
          orderNumber,
          riderName,
        );
        break;

      case NotificationType.ORDER_DELIVERED:
        result = await this.smsService.sendOrderDeliveredNotification(
          user.phone,
          orderNumber,
        );
        break;

      default:
        // SMS not supported for this notification type
        return {
          channel: NotificationChannel.SMS,
          success: false,
          error: `SMS not supported for notification type: ${type}`,
        };
    }

    return {
      channel: NotificationChannel.SMS,
      success: result.success,
      error: result.error,
    };
  }

  /**
   * Process EMAIL notifications
   */
  private async processEmail(
    type: NotificationType,
    user: NonNullable<
      Awaited<ReturnType<NotificationContextService['fetchUserContext']>>
    >,
    order: Awaited<ReturnType<NotificationContextService['fetchOrderContext']>>,
    data?: Record<string, unknown>,
  ): Promise<ChannelDeliveryResult> {
    if (!user.email) {
      return {
        channel: NotificationChannel.EMAIL,
        success: false,
        error: 'User has no email address',
      };
    }

    if (!user.isEmailVerified) {
      return {
        channel: NotificationChannel.EMAIL,
        success: false,
        error: 'User email not verified',
      };
    }

    const orderNumber = order?.orderNumber || '';
    const orderId = order?.orderId || '';
    const total = order?.total || 0;
    const amount = (data?.amount as number) || total;
    const reason = data?.reason as string | undefined;

    try {
      switch (type) {
        case NotificationType.PAYMENT_SUCCESS:
          await this.mailService.sendPaymentSuccessEmail({
            to: user.email,
            orderNumber,
            orderId,
            amount,
          });
          break;

        case NotificationType.PAYMENT_FAILED:
          await this.mailService.sendPaymentFailedEmail({
            to: user.email,
            orderNumber,
            orderId,
            amount,
            reason,
          });
          break;

        case NotificationType.ORDER_DELIVERED:
          await this.mailService.sendOrderDeliveredEmail({
            to: user.email,
            orderNumber,
            orderId,
            deliveredAt:
              order?.deliveredAt?.toISOString() || new Date().toISOString(),
          });
          break;

        default:
          // Email not supported for this notification type
          return {
            channel: NotificationChannel.EMAIL,
            success: false,
            error: `Email not supported for notification type: ${type}`,
          };
      }

      return {
        channel: NotificationChannel.EMAIL,
        success: true,
      };
    } catch (error: unknown) {
      return {
        channel: NotificationChannel.EMAIL,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Process PUSH notifications
   */
  private async processPush(
    type: NotificationType,
    user: NonNullable<
      Awaited<ReturnType<NotificationContextService['fetchUserContext']>>
    >,
    order: Awaited<ReturnType<NotificationContextService['fetchOrderContext']>>,
    title: string,
    message: string,
    data?: Record<string, unknown>,
  ): Promise<ChannelDeliveryResult> {
    if (!user.expoPushTokens || user.expoPushTokens.length === 0) {
      return {
        channel: NotificationChannel.PUSH,
        success: false,
        error: 'User has no push tokens',
      };
    }

    const orderNumber = order?.orderNumber || '';
    const orderId = order?.orderId || '';
    const total = order?.total || 0;

    let success = false;

    switch (type) {
      case NotificationType.ORDER_PLACED:
        success = await this.pushService.sendOrderPlaced(
          user.userId,
          orderNumber,
          orderId,
          total,
        );
        break;

      case NotificationType.ORDER_DELIVERED:
        success = await this.pushService.sendOrderDelivered(
          user.userId,
          orderNumber,
          orderId,
        );
        break;

      case NotificationType.PROMOTION:
        success = await this.pushService.sendPromotion(
          user.userId,
          title,
          message,
          data,
        );
        break;

      case NotificationType.GENERAL:
        // Check if it's a rate reminder
        if (data?.isRateReminder && orderId) {
          success = await this.pushService.sendRateThisMeal(
            user.userId,
            orderNumber,
            orderId,
          );
        } else {
          // Generic push not supported
          return {
            channel: NotificationChannel.PUSH,
            success: false,
            error: `Push not supported for generic notification`,
          };
        }
        break;

      default:
        return {
          channel: NotificationChannel.PUSH,
          success: false,
          error: `Push not supported for notification type: ${type}`,
        };
    }

    return {
      channel: NotificationChannel.PUSH,
      success,
    };
  }

  /**
   * Update notification document with channel delivery status
   */
  private async updateChannelStatus(
    notificationId: string,
    channel: NotificationChannel,
    success: boolean,
  ): Promise<void> {
    try {
      if (!success) return;

      const channelType =
        channel === NotificationChannel.PUSH
          ? 'push'
          : channel === NotificationChannel.SMS
            ? 'sms'
            : channel === NotificationChannel.EMAIL
              ? 'email'
              : null;

      if (channelType) {
        await this.notificationsRepository.updateSentStatus(
          notificationId,
          channelType,
        );
      }
    } catch (error: unknown) {
      this.logger.error(
        `Failed to update channel status for notification ${notificationId}`,
        {
          error: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }
}

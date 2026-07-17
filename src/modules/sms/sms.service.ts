import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SendSmsDto } from './dto/send-sms.dto';
import {
  SmsMessageBuilderService,
  OtpMessageOptions,
} from './sms-message-builder.service';
import type { ISmsProvider } from './interfaces/sms-provider.interface';
import { SMS_PROVIDER } from './sms.constants';

export interface SmsResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly senderId: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly messageBuilder: SmsMessageBuilderService,
    @Inject(SMS_PROVIDER) private readonly provider: ISmsProvider,
  ) {
    this.senderId =
      this.configService.get<string>('SMS_SENDER_ID') || 'N-Alert';
  }

  /**
   * Format phone number (remove + and ensure 234 prefix for Nigeria)
   */
  private formatPhoneNumber(phoneNumber: string): string {
    let formatted = phoneNumber.replace(/\+|\s/g, '');
    if (!formatted.startsWith('234') && formatted.length <= 10) {
      formatted = `234${formatted}`;
    }
    return formatted;
  }

  /**
   * Send SMS to a phone number
   */
  async sendSms(dto: SendSmsDto): Promise<SmsResponse> {
    const from = dto.from || this.senderId;
    return this.provider.sendSms({
      from,
      to: dto.to,
      body: dto.body,
    });
  }

  /**
   * Send OTP SMS
   */
  async sendOtp(
    phoneNumber: string,
    options: OtpMessageOptions,
    from?: string,
  ): Promise<SmsResponse> {
    const message = this.messageBuilder.buildOtpMessage(options);
    const senderId = from || this.senderId;

    return this.provider.sendSms({
      from: senderId,
      to: phoneNumber,
      body: message,
    });
  }

  /**
   * Send order ready notification
   */
  async sendOrderReadyNotification(
    phoneNumber: string,
    orderNumber: string,
    from?: string,
  ): Promise<SmsResponse> {
    const message = this.messageBuilder.buildOrderReadyMessage(orderNumber);
    const senderId = from || this.senderId;

    return this.provider.sendSms({
      from: senderId,
      to: phoneNumber,
      body: message,
    });
  }

  /**
   * Send order picked up notification
   */
  async sendOrderPickedUpNotification(
    phoneNumber: string,
    orderNumber: string,
    riderName?: string,
    from?: string,
  ): Promise<SmsResponse> {
    const message = this.messageBuilder.buildOrderPickedUpMessage(
      orderNumber,
      riderName,
    );
    const senderId = from || this.senderId;

    return this.provider.sendSms({
      from: senderId,
      to: phoneNumber,
      body: message,
    });
  }

  /**
   * Send order delivered notification
   */
  async sendOrderDeliveredNotification(
    phoneNumber: string,
    orderNumber: string,
    from?: string,
  ): Promise<SmsResponse> {
    const message = this.messageBuilder.buildOrderDeliveredMessage(orderNumber);
    const senderId = from || this.senderId;

    return this.provider.sendSms({
      from: senderId,
      to: phoneNumber,
      body: message,
    });
  }

  /**
   * Send the same message to multiple phone numbers individually.
   * Provider APIs (Termii, BulkSMS) only accept one recipient per call,
   * so this fans out sequentially and reports per-recipient results.
   */
  async sendBulkSms(
    phoneNumbers: string[],
    message: string,
    from?: string,
  ): Promise<{ successCount: number; failureCount: number }> {
    const senderId = from || this.senderId;
    let successCount = 0;
    let failureCount = 0;

    for (const phoneNumber of phoneNumbers) {
      const result = await this.provider.sendSms({
        from: senderId,
        to: this.formatPhoneNumber(phoneNumber),
        body: message,
      });
      if (result.success) {
        successCount++;
      } else {
        failureCount++;
        this.logger.error(
          `Bulk SMS failed for ${phoneNumber}: ${result.error}`,
        );
      }
    }

    return { successCount, failureCount };
  }

  /**
   * Check SMS delivery status (BulkSMS only; no-op for Termii)
   */
  async checkDeliveryStatus(messageId: string): Promise<{
    success: boolean;
    status?: string;
    error?: string;
  }> {
    if (this.provider.checkDeliveryStatus) {
      return this.provider.checkDeliveryStatus(messageId);
    }
    return {
      success: false,
      error: 'Delivery status check not supported by current SMS provider',
    };
  }
}

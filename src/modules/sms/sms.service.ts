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
      this.configService.get<string>('SMS_SENDER_ID') || 'Surespot NG';
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
   * Send bulk SMS to multiple phone numbers
   */
  async sendBulkSms(
    phoneNumbers: string[],
    message: string,
    from?: string,
  ): Promise<SmsResponse> {
    const senderId = from || this.senderId;
    const formattedNumbers = phoneNumbers.map((num) =>
      this.formatPhoneNumber(num),
    );
    const to = formattedNumbers.join(',');

    return this.provider.sendSms({
      from: senderId,
      to,
      body: message,
    });
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

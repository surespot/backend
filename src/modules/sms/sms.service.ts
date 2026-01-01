import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { SendSmsDto } from './dto/send-sms.dto';
import {
  SmsMessageBuilderService,
  OtpMessageOptions,
} from './sms-message-builder.service';

export interface SmsResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly axiosInstance: AxiosInstance;
  private readonly senderId: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly messageBuilder: SmsMessageBuilderService,
  ) {
    this.apiUrl =
      this.configService.get<string>('SMS_API_URL') ||
      'https://www.bulksmsnigeria.com/api/v2/sms';
    this.apiKey = this.configService.get<string>('SMS_API_KEY') || '';
    this.senderId =
      this.configService.get<string>('SMS_SENDER_ID') || 'SureSpot';

    if (!this.apiKey) {
      this.logger.warn(
        'SMS API Key not configured. SMS functionality may not work.',
      );
    }

    // Create axios instance with default config
    this.axiosInstance = axios.create({
      baseURL: this.apiUrl,
      timeout: 10000, // 10 seconds
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
    });
  }

  /**
   * Format phone number for BulkSMS Nigeria API (remove + and ensure proper format)
   */
  private formatPhoneNumber(phoneNumber: string): string {
    // Remove + sign and any spaces
    let formatted = phoneNumber.replace(/\+|\s/g, '');

    // Ensure it starts with country code (e.g., 234 for Nigeria)
    // If it doesn't start with a country code, assume it's a local number and add 234
    if (!formatted.startsWith('234') && formatted.length <= 10) {
      formatted = `234${formatted}`;
    }

    return formatted;
  }

  /**
   * Send SMS to a phone number
   */
  async sendSms(dto: SendSmsDto): Promise<SmsResponse> {
    // If API key is missing, only log the details and do NOT try to call the API
    if (!this.apiKey) {
      const logMessage = `[SMS SEND ATTEMPT WITHOUT API KEY] Details: from='${dto.from || this.senderId}', to='${dto.to}', body='${dto.body}'`;
      this.logger.log(logMessage);
      // Also log to console for direct developer output
      // eslint-disable-next-line no-console
      console.log(logMessage);
      return {
        success: true,
        error: 'SMS API Key not configured. SMS was not sent.',
      };
    }

    try {
      const phoneNumber: string = String(dto.to);
      const formattedTo = this.formatPhoneNumber(phoneNumber);
      this.logger.log(`Sending SMS to ${formattedTo}`);

      const fromValue: string = String(dto.from || this.senderId);
      const bodyValue: string = String(dto.body);

      const requestBody = {
        from: fromValue,
        to: formattedTo,
        body: bodyValue,
      };

      const response = await this.axiosInstance.post<{
        data?: { messageId?: string };
        id?: string;
        message?: string;
        error?: string;
      }>('', requestBody);

      this.logger.log(`SMS sent successfully to ${formattedTo}`);

      return {
        success: true,
        messageId:
          response.data?.data?.messageId || response.data?.id || undefined,
      };
    } catch (error: unknown) {
      let errorMessage = 'Failed to send SMS';

      if (axios.isAxiosError(error)) {
        const responseData = error.response?.data as
          | { message?: string; error?: string }
          | undefined;
        errorMessage =
          responseData?.message ||
          responseData?.error ||
          error.message ||
          'Failed to send SMS';

        this.logger.error(`Failed to send SMS to ${dto.to}`, {
          error: errorMessage,
          status: error.response?.status,
          data: error.response?.data as unknown,
        });
      } else if (error instanceof Error) {
        errorMessage = error.message;
        this.logger.error(`Failed to send SMS to ${dto.to}`, {
          error: errorMessage,
        });
      } else {
        this.logger.error(`Failed to send SMS to ${dto.to}`, {
          error: String(error),
        });
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
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

    return this.sendSms({
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

    return this.sendSms({
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

    return this.sendSms({
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

    return this.sendSms({
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

    // Format all phone numbers
    const formattedNumbers = phoneNumbers.map((num) =>
      this.formatPhoneNumber(num),
    );

    // BulkSMS Nigeria API accepts comma-separated phone numbers
    const to = formattedNumbers.join(',');

    return this.sendSms({
      from: senderId,
      to,
      body: message,
    });
  }

  /**
   * Check SMS delivery status
   */
  async checkDeliveryStatus(messageId: string): Promise<{
    success: boolean;
    status?: string;
    error?: string;
  }> {
    try {
      this.logger.log(`Checking delivery status for message ${messageId}`);

      const response = await this.axiosInstance.get<{
        status?: string;
        message?: string;
      }>(`/status/${messageId}`);

      return {
        success: true,
        status: response.data?.status,
      };
    } catch (error: unknown) {
      let errorMessage = 'Failed to check delivery status';

      if (axios.isAxiosError(error)) {
        const responseData = error.response?.data as
          | { message?: string; error?: string }
          | undefined;
        errorMessage =
          responseData?.message ||
          responseData?.error ||
          error.message ||
          'Failed to check delivery status';

        this.logger.error(`Failed to check delivery status for ${messageId}`, {
          error: errorMessage,
          status: error.response?.status,
        });
      } else if (error instanceof Error) {
        errorMessage = error.message;
        this.logger.error(`Failed to check delivery status for ${messageId}`, {
          error: errorMessage,
        });
      } else {
        this.logger.error(`Failed to check delivery status for ${messageId}`, {
          error: String(error),
        });
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  }
}

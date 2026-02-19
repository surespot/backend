import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import {
  DeliveryStatusResult,
  ISmsProvider,
  SmsResponse,
  SendSmsPayload,
} from '../interfaces/sms-provider.interface';

@Injectable()
export class BulksmsSmsProvider implements ISmsProvider {
  private readonly logger = new Logger(BulksmsSmsProvider.name);
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly axiosInstance: AxiosInstance;

  constructor(private readonly configService: ConfigService) {
    this.apiUrl =
      this.configService.get<string>('SMS_API_URL') ||
      'https://www.bulksmsnigeria.com/api/v2/sms';
    this.apiKey = this.configService.get<string>('SMS_API_KEY') || '';

    if (!this.apiKey) {
      this.logger.warn(
        'BulkSMS API Key not configured. SMS functionality may not work.',
      );
    }

    this.axiosInstance = axios.create({
      baseURL: this.apiUrl,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
    });
  }

  private formatPhoneNumber(phoneNumber: string): string {
    let formatted = phoneNumber.replace(/\+|\s/g, '');
    if (!formatted.startsWith('234') && formatted.length <= 10) {
      formatted = `234${formatted}`;
    }
    return formatted;
  }

  async sendSms(payload: SendSmsPayload): Promise<SmsResponse> {
    if (!this.apiKey) {
      this.logger.log(
        `[BulkSMS - NO API KEY] from='${payload.from}', to='${payload.to}'`,
      );
      return {
        success: true,
        error: 'SMS API Key not configured. SMS was not sent.',
      };
    }

    try {
      const formattedTo = this.formatPhoneNumber(payload.to);
      this.logger.log(`[BulkSMS] Sending SMS to ${formattedTo}`);

      const response = await this.axiosInstance.post<{
        data?: { messageId?: string };
        id?: string;
        message?: string;
        error?: string;
      }>('', {
        from: payload.from,
        to: formattedTo,
        body: payload.body,
      });

      this.logger.log(`[BulkSMS] SMS sent successfully to ${formattedTo}`);
      return {
        success: true,
        messageId:
          response.data?.data?.messageId || response.data?.id || undefined,
      };
    } catch (error: unknown) {
      let errorMessage = 'Failed to send SMS';
      if (axios.isAxiosError(error)) {
        const data = error.response?.data as { message?: string; error?: string };
        errorMessage = data?.message || data?.error || error.message;
        this.logger.error(`[BulkSMS] Failed to send to ${payload.to}`, {
          error: errorMessage,
          status: error.response?.status,
        });
      } else {
        this.logger.error(`[BulkSMS] Failed to send to ${payload.to}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return { success: false, error: errorMessage };
    }
  }

  async checkDeliveryStatus(messageId: string): Promise<DeliveryStatusResult> {
    try {
      const response = await this.axiosInstance.get<{
        status?: string;
        message?: string;
      }>(`/status/${messageId}`);
      return { success: true, status: response.data?.status };
    } catch (error: unknown) {
      let errorMessage = 'Failed to check delivery status';
      if (axios.isAxiosError(error)) {
        const data = error.response?.data as { message?: string };
        errorMessage = data?.message || error.message;
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      return { success: false, error: errorMessage };
    }
  }
}

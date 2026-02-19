import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  ISmsProvider,
  SmsResponse,
  SendSmsPayload,
} from '../interfaces/sms-provider.interface';

const DEFAULT_TERMII_BASE_URL = 'https://api.ng.termii.com';

@Injectable()
export class TermiiSmsProvider implements ISmsProvider {
  private readonly logger = new Logger(TermiiSmsProvider.name);
  private readonly apiUrl: string;
  private readonly apiKey: string;

  constructor(private readonly configService: ConfigService) {
    const baseUrl =
      this.configService.get<string>('TERMII_BASE_URL') ||
      DEFAULT_TERMII_BASE_URL;
    this.apiUrl = `${baseUrl.replace(/\/$/, '')}/api/sms/send`;
    this.apiKey = this.configService.get<string>('TERMII_API_KEY') || '';

    if (!this.apiKey) {
      this.logger.warn(
        'Termii API Key not configured. SMS functionality may not work.',
      );
    }
  }

  private formatPhoneNumber(phoneNumber: string): string {
    let formatted = phoneNumber.replace(/\+|\s/g, '');
    if (!formatted.startsWith('234') && formatted.length <= 10) {
      formatted = `234${formatted}`;
    }
    return formatted;
  }

  /**
   * Send SMS via Termii Messaging API.
   * Uses DND (transactional) route for reliable delivery of OTPs and order notifications.
   */
  async sendSms(payload: SendSmsPayload): Promise<SmsResponse> {
    if (!this.apiKey) {
      this.logger.log(
        `[Termii - NO API KEY] from='${payload.from}', to='${payload.to}'`,
      );
      return {
        success: true,
        error: 'Termii API Key not configured. SMS was not sent.',
      };
    }

    try {
      const formattedTo = this.formatPhoneNumber(payload.to);
      this.logger.log(`[Termii] Sending SMS to ${formattedTo}`);

      const response = await axios.post<{
        code?: string;
        message_id?: string;
        message?: string;
        balance?: number;
      }>(
        this.apiUrl,
        {
          api_key: this.apiKey,
          to: formattedTo,
          from: payload.from.slice(0, 11),
          sms: payload.body,
          type: 'plain',
          channel: 'dnd',
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000,
        },
      );

      const code = response.data?.code;
      const success = code === 'ok';

      if (success) {
        this.logger.log(`[Termii] SMS sent successfully to ${formattedTo}`);
        return {
          success: true,
          messageId: response.data?.message_id,
        };
      }

      this.logger.warn(`[Termii] API returned non-ok: ${code}`, {
        message: response.data?.message,
      });
      return {
        success: false,
        error: response.data?.message || `Termii returned: ${code}`,
      };
    } catch (error: unknown) {
      let errorMessage = 'Failed to send SMS';
      if (axios.isAxiosError(error)) {
        const data = error.response?.data as { message?: string };
        errorMessage = data?.message || error.message;
        this.logger.error(`[Termii] Failed to send to ${payload.to}`, {
          error: errorMessage,
          status: error.response?.status,
        });
      } else {
        this.logger.error(`[Termii] Failed to send to ${payload.to}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return { success: false, error: errorMessage };
    }
  }
}

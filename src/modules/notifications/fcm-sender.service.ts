import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import { initializeApp, cert, App, ServiceAccount } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

export interface FcmSendOptions {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: string;
  priority?: 'default' | 'normal' | 'high';
  channelId?: string;
}

export interface FcmSendResult {
  token: string;
  success: boolean;
  /** Set when the token is permanently invalid and should be removed from the user record */
  invalidToken?: boolean;
  error?: string;
}

/**
 * Sends Android push notifications directly via Firebase Cloud Messaging,
 * bypassing Expo's push relay (which ties credentials to a single EAS/Expo account).
 */
@Injectable()
export class FcmSenderService implements OnModuleInit {
  private readonly logger = new Logger(FcmSenderService.name);
  private app: App | null = null;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const serviceAccountPath =
      this.configService.get<string>('FIREBASE_SERVICE_ACCOUNT_PATH') ??
      'surespot-app-firebase.json';

    try {
      const raw = fs.readFileSync(serviceAccountPath, 'utf-8');
      const serviceAccount = JSON.parse(raw) as ServiceAccount;

      this.app = initializeApp(
        { credential: cert(serviceAccount) },
        'fcm-sender',
      );
      this.logger.log('FCM sender initialized');
    } catch (error) {
      this.logger.warn(
        `FCM sender not initialized — Android pushes will fail: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  isConfigured(): boolean {
    return this.app !== null;
  }

  async sendToTokens(
    tokens: string[],
    options: FcmSendOptions,
  ): Promise<FcmSendResult[]> {
    if (!this.app) {
      this.logger.warn('sendToTokens called but FCM is not configured');
      return tokens.map((token) => ({
        token,
        success: false,
        error: 'FCM not configured',
      }));
    }

    if (tokens.length === 0) return [];

    try {
      const response = await getMessaging(this.app).sendEachForMulticast({
        tokens,
        notification: {
          title: options.title,
          body: options.body,
        },
        data: this.stringifyData(options.data),
        android: {
          priority: options.priority === 'high' ? 'high' : 'normal',
          notification: {
            channelId: options.channelId ?? 'default',
            sound: options.sound ?? 'default',
          },
        },
      });

      return response.responses.map((res, index) => {
        const token = tokens[index];
        if (res.success) {
          return { token, success: true };
        }

        const errorCode = res.error?.code;
        const invalidToken =
          errorCode === 'messaging/registration-token-not-registered' ||
          errorCode === 'messaging/invalid-registration-token';

        return {
          token,
          success: false,
          invalidToken,
          error: res.error?.message,
        };
      });
    } catch (error) {
      this.logger.error(
        `FCM send failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return tokens.map((token) => ({
        token,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  private stringifyData(
    data?: Record<string, unknown>,
  ): Record<string, string> {
    if (!data) return {};
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(data)) {
      result[key] = typeof value === 'string' ? value : JSON.stringify(value);
    }
    return result;
  }
}

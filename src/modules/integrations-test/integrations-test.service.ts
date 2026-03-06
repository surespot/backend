import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { v2 as cloudinary } from 'cloudinary';
import { S3Client, ListBucketsCommand } from '@aws-sdk/client-s3';
import * as nodemailer from 'nodemailer';
import axios from 'axios';

export interface IntegrationCheckResult {
  name: string;
  configured: boolean;
  ok: boolean;
  message?: string;
  details?: Record<string, unknown>;
}

@Injectable()
export class IntegrationsTestService {
  private readonly logger = new Logger(IntegrationsTestService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectQueue('notifications') private readonly notificationsQueue: Queue,
  ) {}

  /**
   * Run all integration checks in parallel.
   */
  async checkAll(): Promise<IntegrationCheckResult[]> {
    const results = await Promise.allSettled([
      this.checkPaystack(),
      this.checkSms(),
      this.checkStorage(),
      this.checkRedis(),
      this.checkMail(),
    ]);

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      }
      const names = ['Paystack', 'SMS', 'Storage', 'Redis', 'Mail'];
      return {
        name: names[index] ?? 'Unknown',
        configured: false,
        ok: false,
        message: result.reason?.message ?? String(result.reason),
      };
    });
  }

  /**
   * Check Paystack API connectivity (GET /bank - read-only, no charge).
   */
  async checkPaystack(): Promise<IntegrationCheckResult> {
    const secretKey = this.configService.get<string>('PAYSTACK_SECRET_KEY');
    if (!secretKey) {
      return {
        name: 'Paystack',
        configured: false,
        ok: false,
        message: 'PAYSTACK_SECRET_KEY not configured',
      };
    }

    try {
      const response = await fetch(
        'https://api.paystack.co/bank?perPage=1&country=nigeria',
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${secretKey}`,
          },
        },
      );

      const data = (await response.json()) as {
        status?: boolean;
        message?: string;
      };

      if (!response.ok) {
        return {
          name: 'Paystack',
          configured: true,
          ok: false,
          message: data.message ?? `HTTP ${response.status}`,
        };
      }

      return {
        name: 'Paystack',
        configured: true,
        ok: data.status === true,
        message: data.status
          ? 'Connected'
          : (data.message ?? 'Unexpected response'),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Paystack check failed: ${message}`);
      return {
        name: 'Paystack',
        configured: true,
        ok: false,
        message,
      };
    }
  }

  /**
   * Check SMS provider connectivity.
   * Termii: GET /api/get-balance (returns balance, no SMS sent).
   * BulkSMS: Verify config only (no public balance/health endpoint).
   */
  async checkSms(): Promise<IntegrationCheckResult> {
    const provider =
      this.configService.get<'bulksms' | 'termii'>('SMS_PROVIDER') ?? 'bulksms';

    if (provider === 'termii') {
      const apiKey = this.configService.get<string>('TERMII_API_KEY');
      const baseUrl =
        this.configService.get<string>('TERMII_BASE_URL') ??
        'https://api.ng.termii.com';

      if (!apiKey) {
        return {
          name: 'SMS (Termii)',
          configured: false,
          ok: false,
          message: 'TERMII_API_KEY not configured',
        };
      }

      try {
        const url = `${baseUrl.replace(/\/$/, '')}/api/get-balance`;
        const response = await axios.get<{
          balance?: number;
          currency?: string;
        }>(url, {
          params: { api_key: apiKey },
          timeout: 10000,
        });

        const balance = response.data?.balance;
        return {
          name: 'SMS (Termii)',
          configured: true,
          ok: true,
          message: 'Connected',
          details: {
            balance,
            currency: response.data?.currency ?? 'NGN',
          },
        };
      } catch (error) {
        const message = axios.isAxiosError(error)
          ? (error.response?.data?.message ?? error.message)
          : error instanceof Error
            ? error.message
            : String(error);
        return {
          name: 'SMS (Termii)',
          configured: true,
          ok: false,
          message,
        };
      }
    }

    // BulkSMS - verify config only (no public health endpoint)
    const apiKey = this.configService.get<string>('SMS_API_KEY');
    const apiUrl = this.configService.get<string>('SMS_API_URL');

    if (!apiKey || !apiUrl) {
      return {
        name: 'SMS (BulkSMS)',
        configured: false,
        ok: false,
        message: 'SMS_API_KEY or SMS_API_URL not configured',
      };
    }

    return {
      name: 'SMS (BulkSMS)',
      configured: true,
      ok: true,
      message: 'Configuration valid (no connectivity endpoint available)',
    };
  }

  /**
   * Check storage provider (Cloudinary or S3).
   */
  async checkStorage(): Promise<IntegrationCheckResult> {
    const provider =
      this.configService.get<'cloudinary' | 's3'>('STORAGE_PROVIDER') ??
      'cloudinary';

    if (provider === 'cloudinary') {
      const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
      const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
      const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');

      if (!cloudName || !apiKey || !apiSecret) {
        return {
          name: 'Storage (Cloudinary)',
          configured: false,
          ok: false,
          message: 'Cloudinary credentials not configured',
        };
      }

      try {
        cloudinary.config({
          cloud_name: cloudName,
          api_key: apiKey,
          api_secret: apiSecret,
        });

        const result = await new Promise<{ status?: string }>(
          (resolve, reject) => {
            cloudinary.api.ping(
              (err: Error | undefined, res: { status?: string }) => {
                if (err) reject(err);
                else resolve(res ?? {});
              },
            );
          },
        );

        return {
          name: 'Storage (Cloudinary)',
          configured: true,
          ok: result?.status === 'ok',
          message:
            result?.status === 'ok'
              ? 'Connected'
              : (result?.status ?? 'Unknown'),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          name: 'Storage (Cloudinary)',
          configured: true,
          ok: false,
          message,
        };
      }
    }

    // S3
    const accessKey = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');
    const region = this.configService.get<string>('AWS_REGION') ?? 'us-east-1';

    if (!accessKey || !secretKey) {
      return {
        name: 'Storage (S3)',
        configured: false,
        ok: false,
        message: 'AWS credentials not configured',
      };
    }

    try {
      const client = new S3Client({
        region,
        credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
      });

      await client.send(new ListBucketsCommand({}));

      return {
        name: 'Storage (S3)',
        configured: true,
        ok: true,
        message: 'Connected',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        name: 'Storage (S3)',
        configured: true,
        ok: false,
        message,
      };
    }
  }

  /**
   * Check Redis connectivity (used by BullMQ).
   */
  async checkRedis(): Promise<IntegrationCheckResult> {
    try {
      const client = await this.notificationsQueue.client;
      const pong = await client.ping();

      return {
        name: 'Redis',
        configured: true,
        ok: pong === 'PONG',
        message: pong === 'PONG' ? 'Connected' : pong,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        name: 'Redis',
        configured: true,
        ok: false,
        message,
      };
    }
  }

  /**
   * Check SMTP/Mail connectivity (verify only, no email sent).
   */
  async checkMail(): Promise<IntegrationCheckResult> {
    const host =
      this.configService.get<string>('SMTP_HOST') ?? 'smtp.gmail.com';
    const port = Number(this.configService.get<string>('SMTP_PORT')) || 587;
    const user =
      this.configService.get<string>('SMTP_USER') ??
      this.configService.get<string>('GMAIL_USER');
    const pass =
      this.configService.get<string>('SMTP_PASSWORD') ??
      this.configService.get<string>('GMAIL_APP_PASSWORD');

    if (!user || !pass) {
      return {
        name: 'Mail (SMTP)',
        configured: false,
        ok: false,
        message: 'SMTP credentials not configured',
      };
    }

    try {
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });

      await transporter.verify();

      return {
        name: 'Mail (SMTP)',
        configured: true,
        ok: true,
        message: 'Connected',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        name: 'Mail (SMTP)',
        configured: true,
        ok: false,
        message,
      };
    }
  }
}

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as http2 from 'http2';
import * as jwt from 'jsonwebtoken';

export interface ApnsSendOptions {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: string;
  badge?: number;
  /** Which app's bundle id (apns-topic) to target — the two apps share one Apple team/key. */
  isRider: boolean;
}

export interface ApnsSendResult {
  token: string;
  success: boolean;
  invalidToken?: boolean;
  error?: string;
}

const { HTTP2_HEADER_STATUS, HTTP2_HEADER_METHOD, HTTP2_HEADER_PATH } =
  http2.constants;

// Apple recommends reusing provider (JWT) tokens rather than minting one per request.
const TOKEN_TTL_MS = 50 * 60 * 1000; // 50 minutes (Apple invalidates tokens older than 1h)

/**
 * Sends iOS push notifications directly via APNS (HTTP/2 provider API), bypassing
 * Expo's push relay. Uses a single shared Apple Developer team + .p8 auth key across
 * both apps, distinguished by apns-topic (bundle id) per send.
 *
 * Configure via: APNS_KEY_PATH, APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID_CUSTOMER,
 * APNS_BUNDLE_ID_RIDER, APNS_ENVIRONMENT (sandbox|production, default production).
 * Until those are set, isConfigured() is false and sendToTokens() no-ops safely.
 */
@Injectable()
export class ApnsSenderService implements OnModuleDestroy {
  private readonly logger = new Logger(ApnsSenderService.name);

  private privateKey: string | null = null;
  private keyId: string | null = null;
  private teamId: string | null = null;
  private customerBundleId: string | null = null;
  private riderBundleId: string | null = null;
  private host = 'api.push.apple.com';

  private cachedToken: string | null = null;
  private cachedTokenIssuedAt = 0;

  private session: http2.ClientHttp2Session | null = null;
  private warnedOnce = false;

  constructor(private readonly configService: ConfigService) {
    const keyPath = this.configService.get<string>('APNS_KEY_PATH');
    this.keyId = this.configService.get<string>('APNS_KEY_ID') ?? null;
    this.teamId = this.configService.get<string>('APNS_TEAM_ID') ?? null;
    this.customerBundleId =
      this.configService.get<string>('APNS_BUNDLE_ID_CUSTOMER') ?? null;
    this.riderBundleId =
      this.configService.get<string>('APNS_BUNDLE_ID_RIDER') ?? null;
    this.host =
      this.configService.get<string>('APNS_ENVIRONMENT') === 'sandbox'
        ? 'api.sandbox.push.apple.com'
        : 'api.push.apple.com';

    if (keyPath) {
      try {
        this.privateKey = fs.readFileSync(keyPath, 'utf-8');
      } catch (error) {
        this.logger.warn(
          `Failed to read APNS_KEY_PATH (${keyPath}): ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  isConfigured(): boolean {
    return Boolean(
      this.privateKey &&
        this.keyId &&
        this.teamId &&
        (this.customerBundleId || this.riderBundleId),
    );
  }

  private getProviderToken(): string {
    const now = Date.now();
    if (this.cachedToken && now - this.cachedTokenIssuedAt < TOKEN_TTL_MS) {
      return this.cachedToken;
    }

    this.cachedToken = jwt.sign(
      { iss: this.teamId, iat: Math.floor(now / 1000) },
      this.privateKey!,
      { algorithm: 'ES256', header: { alg: 'ES256', kid: this.keyId! } },
    );
    this.cachedTokenIssuedAt = now;
    return this.cachedToken;
  }

  private getSession(): http2.ClientHttp2Session {
    if (this.session && !this.session.closed && !this.session.destroyed) {
      return this.session;
    }

    const session = http2.connect(`https://${this.host}`);
    session.on('error', (err) => {
      this.logger.warn(`APNS session error: ${err.message}`);
    });
    session.on('close', () => {
      if (this.session === session) this.session = null;
    });
    this.session = session;
    return session;
  }

  private bundleIdFor(isRider: boolean): string | null {
    return isRider ? this.riderBundleId : this.customerBundleId;
  }

  async sendToTokens(
    tokens: string[],
    options: ApnsSendOptions,
  ): Promise<ApnsSendResult[]> {
    if (!this.isConfigured()) {
      if (!this.warnedOnce) {
        this.logger.warn(
          'ApnsSenderService not configured — APNS credentials missing. iOS pushes will not be delivered.',
        );
        this.warnedOnce = true;
      }
      return tokens.map((token) => ({
        token,
        success: false,
        error: 'APNS not configured',
      }));
    }

    const bundleId = this.bundleIdFor(options.isRider);
    if (!bundleId) {
      const which = options.isRider ? 'rider' : 'customer';
      this.logger.warn(`No APNS bundle id configured for ${which} app`);
      return tokens.map((token) => ({
        token,
        success: false,
        error: `APNS bundle id not configured for ${which} app`,
      }));
    }

    return Promise.all(
      tokens.map((token) => this.sendOne(token, bundleId, options)),
    );
  }

  private sendOne(
    token: string,
    bundleId: string,
    options: ApnsSendOptions,
  ): Promise<ApnsSendResult> {
    return new Promise((resolve) => {
      let session: http2.ClientHttp2Session;
      try {
        session = this.getSession();
      } catch (error) {
        resolve({
          token,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
        return;
      }

      const payload = JSON.stringify({
        aps: {
          alert: { title: options.title, body: options.body },
          sound: options.sound ?? 'default',
          ...(options.badge != null && { badge: options.badge }),
        },
        ...(options.data ?? {}),
      });

      const req = session.request({
        [HTTP2_HEADER_METHOD]: 'POST',
        [HTTP2_HEADER_PATH]: `/3/device/${token}`,
        authorization: `bearer ${this.getProviderToken()}`,
        'apns-topic': bundleId,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'apns-expiration': '0',
      });

      let status = 0;
      let body = '';

      req.on('response', (headers) => {
        status = Number(headers[HTTP2_HEADER_STATUS]);
      });
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        if (status === 200) {
          resolve({ token, success: true });
          return;
        }

        let reason = `HTTP ${status}`;
        try {
          reason = JSON.parse(body).reason || reason;
        } catch {
          // ignore malformed body
        }

        const invalidToken =
          status === 410 ||
          reason === 'Unregistered' ||
          reason === 'BadDeviceToken';

        resolve({ token, success: false, invalidToken, error: reason });
      });
      req.on('error', (err) => {
        resolve({ token, success: false, error: err.message });
      });

      req.write(payload);
      req.end();
    });
  }

  onModuleDestroy() {
    this.session?.close();
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

export interface SendOtpEmailOptions {
  to: string;
  otp: string;
  purpose: 'registration' | 'password-reset' | 'email-verification' | 'admin-login';
  expiresInMinutes?: number;
}

export interface SendOrderDeliveredEmailOptions {
  to: string;
  orderNumber: string;
  orderId: string;
  deliveredAt: string;
}

export interface SendPaymentSuccessEmailOptions {
  to: string;
  orderNumber: string;
  orderId: string;
  amount: number;
  currency?: string;
}

export interface SendPaymentFailedEmailOptions {
  to: string;
  orderNumber: string;
  orderId: string;
  amount: number;
  reason?: string;
  currency?: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly mailerService: MailerService) {}

  /**
   * Send OTP email
   */
  async sendOtpEmail(options: SendOtpEmailOptions): Promise<void> {
    try {
      const purposeMessages = {
        registration: 'Complete your registration',
        'password-reset': 'Reset your password',
        'email-verification': 'Verify your email address',
        'admin-login': 'Log in to your admin dashboard',
      };

      const purposeMessage =
        purposeMessages[options.purpose] || 'Verify your account';

      await this.mailerService.sendMail({
        to: options.to,
        subject: `Your Verification Code - ${options.otp}`,
        template: 'otp',
        context: {
          otp: options.otp,
          purpose: purposeMessage,
          expiresInMinutes: options.expiresInMinutes || 5,
          currentYear: new Date().getFullYear(),
        },
      });

      this.logger.log(`OTP email sent to ${this.maskEmail(options.to)}`);
    } catch (error) {
      this.logger.error(
        `Failed to send OTP email to ${this.maskEmail(options.to)}`,
        {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
      );
      throw error;
    }
  }

  /**
   * Send order delivered notification email
   */
  async sendOrderDeliveredEmail(
    options: SendOrderDeliveredEmailOptions,
  ): Promise<void> {
    try {
      await this.mailerService.sendMail({
        to: options.to,
        subject: `Order Delivered - ${options.orderNumber}`,
        template: 'order-delivered',
        context: {
          orderNumber: options.orderNumber,
          orderId: options.orderId,
          deliveredAt: this.formatDate(options.deliveredAt),
          currentYear: new Date().getFullYear(),
        },
      });

      this.logger.log(
        `Order delivered email sent to ${this.maskEmail(options.to)} for order ${options.orderNumber}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send order delivered email to ${this.maskEmail(options.to)}`,
        {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
      );
      throw error;
    }
  }

  /**
   * Send payment success notification email
   */
  async sendPaymentSuccessEmail(
    options: SendPaymentSuccessEmailOptions,
  ): Promise<void> {
    try {
      const formattedAmount = this.formatPrice(
        options.amount,
        options.currency || 'NGN',
      );

      await this.mailerService.sendMail({
        to: options.to,
        subject: `Payment Successful - Order ${options.orderNumber}`,
        template: 'payment-success',
        context: {
          orderNumber: options.orderNumber,
          orderId: options.orderId,
          amount: formattedAmount,
          currentYear: new Date().getFullYear(),
        },
      });

      this.logger.log(
        `Payment success email sent to ${this.maskEmail(options.to)} for order ${options.orderNumber}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send payment success email to ${this.maskEmail(options.to)}`,
        {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
      );
      throw error;
    }
  }

  /**
   * Send payment failed notification email
   */
  async sendPaymentFailedEmail(
    options: SendPaymentFailedEmailOptions,
  ): Promise<void> {
    try {
      const formattedAmount = this.formatPrice(
        options.amount,
        options.currency || 'NGN',
      );

      await this.mailerService.sendMail({
        to: options.to,
        subject: `Payment Failed - Order ${options.orderNumber}`,
        template: 'payment-failed',
        context: {
          orderNumber: options.orderNumber,
          orderId: options.orderId,
          amount: formattedAmount,
          reason: options.reason,
          currentYear: new Date().getFullYear(),
        },
      });

      this.logger.log(
        `Payment failed email sent to ${this.maskEmail(options.to)} for order ${options.orderNumber}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send payment failed email to ${this.maskEmail(options.to)}`,
        {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
      );
      throw error;
    }
  }

  private formatDate(dateInput: string | Date): string {
    if (!dateInput) return '';

    const date =
      typeof dateInput === 'string' ? new Date(dateInput) : dateInput;

    if (isNaN(date.getTime())) {
      return String(dateInput);
    }

    return date.toLocaleString('en-NG', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  private formatPrice(price: number, currency: string = 'NGN'): string {
    if (price === 0) return 'Free';
    const amount = price / 100;
    return `₦${amount.toLocaleString('en-NG')}`;
  }

  private maskEmail(email: string): string {
    if (!email || !email.includes('@')) return 'u***@example.com';
    const [local, domain] = email.split('@');
    if (local.length <= 1) return `u***@${domain}`;
    const maskedLocal = local[0] + '***';
    return `${maskedLocal}@${domain}`;
  }
}

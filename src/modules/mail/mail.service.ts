import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

export interface SendOtpEmailOptions {
  to: string;
  otp: string;
  purpose:
    | 'registration'
    | 'password-reset'
    | 'email-verification'
    | 'admin-login';
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

export interface SendRefundNeedsAttentionEmailOptions {
  to: string;
  reference: string;
  domain: string;
  status: string;
  amount: string;
}

export interface SendNewsletterEmailOptions {
  to: string;
  firstName: string;
  subject: string;
  body: string; // HTML content
}

export interface SendPickupLocationAssignedEmailOptions {
  to: string;
  firstName: string;
  locationName: string;
  locationAddress: string;
  dashboardUrl: string;
}

export interface SendPickupLocationNearbyEmailOptions {
  to: string;
  firstName: string;
  locationName: string;
  locationAddress: string;
}

export interface SendBugReportEmailOptions {
  to: string[];
  reportId: string;
  submitterName: string;
  submitterRole: string;
  submitterEmail: string;
  submitterPhone: string;
  submittedAt: string;
  title?: string;
  description: string;
  issueType?: string;
  areaAffected?: string;
  stepsToReproduce?: string;
  attachmentUrls: string[];
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
          expiresInMinutes: options.expiresInMinutes ?? null,
          currentYear: new Date().getFullYear(),
        },
      });

      this.logger.log(`OTP email sent to ${this.maskEmail(options.to)}`);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to send OTP email to ${this.maskEmail(options.to)}: ${errMsg}`,
        {
          error: errMsg,
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

  /**
   * Send refund needs attention notification to admin
   */
  async sendRefundNeedsAttentionEmail(
    options: SendRefundNeedsAttentionEmailOptions,
  ): Promise<void> {
    try {
      await this.mailerService.sendMail({
        to: options.to,
        subject: `[Action Required] Refund Needs Attention - ${options.reference}`,
        template: 'refund-needs-attention',
        context: {
          reference: options.reference,
          domain: options.domain,
          status: options.status,
          amount: options.amount,
          currentYear: new Date().getFullYear(),
        },
      });

      this.logger.log(
        `Refund needs attention email sent to ${this.maskEmail(options.to)} for reference ${options.reference}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send refund needs attention email to ${this.maskEmail(options.to)}`,
        {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
      );
      throw error;
    }
  }

  /**
   * Send newsletter email to a recipient
   */
  async sendNewsletterEmail(
    options: SendNewsletterEmailOptions,
  ): Promise<void> {
    try {
      await this.mailerService.sendMail({
        to: options.to,
        subject: options.subject,
        template: 'newsletter',
        context: {
          firstName: options.firstName,
          subject: options.subject,
          body: options.body,
          currentYear: new Date().getFullYear(),
        },
      });

      this.logger.log(`Newsletter email sent to ${this.maskEmail(options.to)}`);
    } catch (error) {
      this.logger.error(
        `Failed to send newsletter email to ${this.maskEmail(options.to)}`,
        {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
      );
      throw error;
    }
  }

  async sendPickupLocationAssignedEmail(
    options: SendPickupLocationAssignedEmailOptions,
  ): Promise<void> {
    try {
      await this.mailerService.sendMail({
        to: options.to,
        subject: `You've been assigned as admin — ${options.locationName}`,
        template: 'pickup-location-assigned',
        context: {
          firstName: options.firstName,
          locationName: options.locationName,
          locationAddress: options.locationAddress,
          dashboardUrl: options.dashboardUrl,
          currentYear: new Date().getFullYear(),
        },
      });

      this.logger.log(
        `Pickup location assigned email sent to ${this.maskEmail(options.to)}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send pickup location assigned email to ${this.maskEmail(options.to)}`,
        {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
      );
      throw error;
    }
  }

  async sendPickupLocationNearbyEmail(
    options: SendPickupLocationNearbyEmailOptions,
  ): Promise<void> {
    try {
      await this.mailerService.sendMail({
        to: options.to,
        subject: `A Surespot pickup point just opened near you! 🎉`,
        template: 'pickup-location-nearby',
        context: {
          firstName: options.firstName,
          locationName: options.locationName,
          locationAddress: options.locationAddress,
          currentYear: new Date().getFullYear(),
        },
      });
      this.logger.log(
        `Pickup location nearby email sent to ${this.maskEmail(options.to)}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send pickup location nearby email to ${this.maskEmail(options.to)}`,
        {
          error: error instanceof Error ? error.message : String(error),
        },
      );
      throw error;
    }
  }

  /**
   * Send bug report to developers (admin-forwarded)
   */
  async sendBugReportEmail(options: SendBugReportEmailOptions): Promise<void> {
    if (!options.to || options.to.length === 0) {
      this.logger.warn(
        'No developer emails configured for bug report forwarding',
      );
      return;
    }

    try {
      const toAddresses = options.to
        .map((e) => e.trim())
        .filter(Boolean)
        .join(', ');
      await this.mailerService.sendMail({
        to: toAddresses,
        subject: 'Surespot Bug Report',
        template: 'bug-report',
        context: {
          reportId: options.reportId,
          submitterName: options.submitterName,
          submitterRole: options.submitterRole,
          submitterEmail: options.submitterEmail,
          submitterPhone: options.submitterPhone,
          submittedAt: options.submittedAt,
          title: options.title,
          description: options.description,
          issueType: options.issueType ?? options.title ?? 'N/A',
          areaAffected: options.areaAffected,
          stepsToReproduce: options.stepsToReproduce,
          attachmentUrls: options.attachmentUrls ?? [],
          hasAttachments: options.attachmentUrls?.length > 0,
          currentYear: new Date().getFullYear(),
        },
      });

      this.logger.log(
        `Bug report email sent to ${options.to.length} developer(s)`,
      );
    } catch (error) {
      this.logger.error('Failed to send bug report email to developers', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
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

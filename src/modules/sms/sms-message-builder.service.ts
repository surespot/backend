import { Injectable } from '@nestjs/common';

export interface OtpMessageOptions {
  otpCode: string;
  purpose?: string; // e.g., 'phone verification', 'password reset'
  expiresInMinutes?: number;
}

@Injectable()
export class SmsMessageBuilderService {
  /**
   * Build OTP SMS message
   */
  buildOtpMessage(options: OtpMessageOptions): string {
    const { otpCode, purpose, expiresInMinutes = 5 } = options;

    let purposeText = '';
    if (purpose) {
      purposeText = `for ${this.formatPurpose(purpose)}`;
    }

    return `Your SureSpot verification code ${purposeText} is ${otpCode}. It expires in ${expiresInMinutes} minutes. Do not share this code with anyone.`;
  }

  /**
   * Build order ready notification
   */
  buildOrderReadyMessage(orderNumber: string): string {
    return `Your order is ready, and a rider is on their way to the restaurant to pick up your meal.\n\nOrder #${orderNumber}\n\nThank you for choosing SureSpot!`;
  }

  /**
   * Build order picked up notification
   */
  buildOrderPickedUpMessage(orderNumber: string, riderName?: string): string {
    const rider = riderName || 'NAME OF RIDER';
    return `Your meal has been picked up, ${rider} is bringing it to you.\n\nOrder #${orderNumber}\n\nThank you for choosing SureSpot!`;
  }

  /**
   * Build order delivered notification
   */
  buildOrderDeliveredMessage(orderNumber: string): string {
    return `Your order has been delivered.\n\nOrder #${orderNumber}\n\nThank you for choosing SureSpot!`;
  }

  /**
   * Format purpose text for OTP messages
   */
  private formatPurpose(purpose: string): string {
    const purposeMap: Record<string, string> = {
      REGISTRATION: 'registration',
      PASSWORD_RESET: 'password reset',
      PHONE_VERIFICATION: 'phone verification',
      EMAIL_VERIFICATION: 'email verification',
    };

    return purposeMap[purpose.toUpperCase()] || purpose.toLowerCase();
  }
}

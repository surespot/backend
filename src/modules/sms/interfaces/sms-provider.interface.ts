export interface SmsResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface SendSmsPayload {
  from: string;
  to: string;
  body: string;
}

export interface DeliveryStatusResult {
  success: boolean;
  status?: string;
  error?: string;
}

export interface ISmsProvider {
  sendSms(payload: SendSmsPayload): Promise<SmsResponse>;
  checkDeliveryStatus?(messageId: string): Promise<DeliveryStatusResult>;
}

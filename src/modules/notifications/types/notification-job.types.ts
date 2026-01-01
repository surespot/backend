import {
  NotificationType,
  NotificationChannel,
} from '../schemas/notification.schema';

/**
 * Job names for the notification queue
 */
export enum NotificationJobName {
  SEND_NOTIFICATION = 'send-notification',
}

/**
 * Data payload for notification jobs
 */
export interface NotificationJobData {
  /** The notification ID (stored in DB) */
  notificationId: string;

  /** The user ID to send the notification to */
  userId: string;

  /** The type of notification */
  type: NotificationType;

  /** Title of the notification */
  title: string;

  /** Message body of the notification */
  message: string;

  /** Additional context data (orderId, orderNumber, amount, etc.) */
  data?: Record<string, unknown>;

  /** Channels to deliver the notification through */
  channels: NotificationChannel[];
}

/**
 * Context data fetched by the worker for user
 */
export interface UserContext {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  isEmailVerified: boolean;
  expoPushTokens: string[];
}

/**
 * Context data fetched by the worker for order
 */
export interface OrderContext {
  orderId: string;
  orderNumber: string;
  total: number;
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  deliveryType: string;
  status: string;
  deliveryAddress?: {
    address: string;
    city?: string;
    state?: string;
  };
  items: Array<{
    name: string;
    quantity: number;
    price: number;
  }>;
  createdAt: Date;
  deliveredAt?: Date;
}

/**
 * Combined context for notification processing
 */
export interface NotificationContext {
  user: UserContext | null;
  order: OrderContext | null;
}

/**
 * Result of channel delivery attempt
 */
export interface ChannelDeliveryResult {
  channel: NotificationChannel;
  success: boolean;
  error?: string;
}

/**
 * Result of notification job processing
 */
export interface NotificationJobResult {
  notificationId: string;
  userId: string;
  type: NotificationType;
  channelResults: ChannelDeliveryResult[];
  processedAt: Date;
}


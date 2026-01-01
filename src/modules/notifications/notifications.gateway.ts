import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  WebSocketConnection,
  WebSocketConnectionDocument,
} from './schemas/websocket-connection.schema';
import { AuthRepository } from '../auth/auth.repository';
import { NotificationType, NotificationChannel } from './schemas/notification.schema';

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/notifications',
})
export class NotificationsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly authRepository: AuthRepository,
    @InjectModel(WebSocketConnection.name)
    private connectionModel: Model<WebSocketConnectionDocument>,
  ) {}

  afterInit(server: Server) {
    this.logger.log('Notifications WebSocket Gateway initialized');
  }

  async handleConnection(@ConnectedSocket() client: AuthenticatedSocket) {
    try {
      // Extract token from socket.auth (Socket.IO authentication)
      const token = client.handshake.auth?.token;

      if (!token) {
        this.logger.warn(
          `Connection rejected: No token provided for socket ${client.id}`,
        );
        client.disconnect();
        return;
      }

      // Verify JWT token
      const jwtSecret =
        this.configService.get<string>('JWT_SECRET') ?? 'default-secret-key';
      let payload: { sub: string; role?: string; iat?: number; exp?: number };

      try {
        payload = this.jwtService.verify(token, { secret: jwtSecret });
      } catch (error) {
        this.logger.warn(
          `Connection rejected: Invalid token for socket ${client.id}`,
          {
            error: error instanceof Error ? error.message : String(error),
          },
        );
        client.disconnect();
        return;
      }

      const userId = payload.sub;

      if (!userId) {
        this.logger.warn(
          `Connection rejected: No userId in token for socket ${client.id}`,
        );
        client.disconnect();
        return;
      }

      // Verify user exists and is active
      const user = await this.authRepository.findUserById(userId);
      if (!user) {
        this.logger.warn(
          `Connection rejected: User not found for socket ${client.id}`,
        );
        client.disconnect();
        return;
      }

      if (!user.isActive) {
        this.logger.warn(
          `Connection rejected: User suspended for socket ${client.id}`,
        );
        client.disconnect();
        return;
      }

      // Attach userId to socket
      client.userId = userId;

      // Deactivate any existing connections for this user (handle reconnection)
      await this.connectionModel.updateMany(
        { userId: new Types.ObjectId(userId), isActive: true },
        {
          $set: {
            isActive: false,
            disconnectedAt: new Date(),
          },
        },
      );

      // Store new connection
      await this.connectionModel.create({
        userId: new Types.ObjectId(userId),
        socketId: client.id,
        isActive: true,
        connectedAt: new Date(),
        lastActivityAt: new Date(),
      });

      // Join user to their room (room name = userId)
      await client.join(userId);

      this.logger.log(
        `User ${userId} connected with socket ${client.id} and joined room ${userId}`,
      );

      // Emit connection confirmation
      client.emit('connected', {
        success: true,
        message: 'Connected to notifications',
        userId,
      });
    } catch (error) {
      this.logger.error(
        `Error handling connection for socket ${client.id}`,
        {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
      );
      client.disconnect();
    }
  }

  async handleDisconnect(@ConnectedSocket() client: AuthenticatedSocket) {
    try {
      if (!client.userId) {
        this.logger.warn(
          `Disconnect: No userId found for socket ${client.id}`,
        );
        return;
      }

      // Mark connection as inactive
      await this.connectionModel.updateOne(
        { socketId: client.id },
        {
          $set: {
            isActive: false,
            disconnectedAt: new Date(),
          },
        },
      );

      this.logger.log(
        `User ${client.userId} disconnected (socket ${client.id})`,
      );
    } catch (error) {
      this.logger.error(
        `Error handling disconnect for socket ${client.id}`,
        {
          error: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }

  /**
   * Send notification to a specific user
   */
  async sendToUser(
    userId: string,
    event: string,
    data: Record<string, unknown>,
  ): Promise<boolean> {
    try {
      // Check if user has active connections
      const activeConnections = await this.connectionModel.countDocuments({
        userId: new Types.ObjectId(userId),
        isActive: true,
      });

      if (activeConnections === 0) {
        this.logger.debug(
          `No active connections for user ${userId}, notification not sent`,
        );
        return false;
      }

      // Emit to user's room
      this.server.to(userId).emit(event, data);

      this.logger.log(
        `Notification sent to user ${userId} via ${activeConnections} connection(s)`,
      );

      return true;
    } catch (error) {
      this.logger.error(
        `Error sending notification to user ${userId}`,
        {
          error: error instanceof Error ? error.message : String(error),
        },
      );
      return false;
    }
  }

  /**
   * Send notification to multiple users
   */
  async sendToUsers(
    userIds: string[],
    event: string,
    data: Record<string, unknown>,
  ): Promise<number> {
    let sentCount = 0;

    for (const userId of userIds) {
      const sent = await this.sendToUser(userId, event, data);
      if (sent) {
        sentCount++;
      }
    }

    return sentCount;
  }

  /**
   * Update last activity for a connection
   */
  async updateActivity(socketId: string): Promise<void> {
    try {
      await this.connectionModel.updateOne(
        { socketId },
        {
          $set: {
            lastActivityAt: new Date(),
          },
        },
      );
    } catch (error) {
      this.logger.error(
        `Error updating activity for socket ${socketId}`,
        {
          error: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }

  /**
   * Emit payment received notification
   */
  async emitPaymentReceived(
    userId: string,
    notificationId: string,
    orderNumber: string,
    orderId: string,
    amount: number,
  ): Promise<boolean> {
    return this.sendToUser(userId, 'notification', {
      id: notificationId,
      userId,
      type: NotificationType.PAYMENT_SUCCESS,
      title: 'Payment Successful',
      message: `Payment of ₦${(amount / 100).toLocaleString('en-NG')} for order ${orderNumber} was successful.`,
      data: { orderId, orderNumber, amount },
      channels: [NotificationChannel.IN_APP],
      isRead: false,
      createdAt: new Date().toISOString(),
    });
  }

  /**
   * Emit order placed notification
   */
  async emitOrderPlaced(
    userId: string,
    notificationId: string,
    orderNumber: string,
    orderId: string,
    total: number,
  ): Promise<boolean> {
    return this.sendToUser(userId, 'notification', {
      id: notificationId,
      userId,
      type: NotificationType.ORDER_PLACED,
      title: 'Order Placed',
      message: `Your order ${orderNumber} has been placed successfully. Total: ₦${(total / 100).toLocaleString('en-NG')}`,
      data: { orderId, orderNumber, total },
      channels: [NotificationChannel.IN_APP],
      isRead: false,
      createdAt: new Date().toISOString(),
    });
  }

  /**
   * Emit order ready notification
   */
  async emitOrderReady(
    userId: string,
    notificationId: string,
    orderNumber: string,
    orderId: string,
    isPickup: boolean,
  ): Promise<boolean> {
    const message = isPickup
      ? `Your order ${orderNumber} is ready for pickup.`
      : `Your order ${orderNumber} is ready and waiting for a rider.`;

    return this.sendToUser(userId, 'notification', {
      id: notificationId,
      userId,
      type: NotificationType.ORDER_READY,
      title: 'Order Ready',
      message,
      data: { orderId, orderNumber },
      channels: [NotificationChannel.IN_APP],
      isRead: false,
      createdAt: new Date().toISOString(),
    });
  }

  /**
   * Emit order picked up notification
   */
  async emitOrderPickedUp(
    userId: string,
    notificationId: string,
    orderNumber: string,
    orderId: string,
  ): Promise<boolean> {
    return this.sendToUser(userId, 'notification', {
      id: notificationId,
      userId,
      type: NotificationType.ORDER_OUT_FOR_DELIVERY,
      title: 'Order Picked Up',
      message: `Your order ${orderNumber} has been picked up and is on its way to you.`,
      data: { orderId, orderNumber },
      channels: [NotificationChannel.IN_APP],
      isRead: false,
      createdAt: new Date().toISOString(),
    });
  }

  /**
   * Emit order delivered notification
   */
  async emitOrderDelivered(
    userId: string,
    notificationId: string,
    orderNumber: string,
    orderId: string,
  ): Promise<boolean> {
    return this.sendToUser(userId, 'notification', {
      id: notificationId,
      userId,
      type: NotificationType.ORDER_DELIVERED,
      title: 'Order Delivered',
      message: `Your order ${orderNumber} has been delivered. Enjoy your meal!`,
      data: { orderId, orderNumber },
      channels: [NotificationChannel.IN_APP],
      isRead: false,
      createdAt: new Date().toISOString(),
    });
  }

  /**
   * Emit reminder to rate recently delivered items
   */
  async emitRateReminder(
    userId: string,
    notificationId: string,
    orderNumber: string,
    orderId: string,
  ): Promise<boolean> {
    return this.sendToUser(userId, 'notification', {
      id: notificationId,
      userId,
      type: NotificationType.GENERAL,
      title: 'Rate Your Order',
      message: `How was your order ${orderNumber}? We'd love to hear your feedback!`,
      data: { orderId, orderNumber },
      channels: [NotificationChannel.IN_APP],
      isRead: false,
      createdAt: new Date().toISOString(),
    });
  }

  /**
   * Emit payment failed notification
   */
  async emitPaymentFailed(
    userId: string,
    notificationId: string,
    orderNumber: string,
    orderId: string,
    reason?: string,
  ): Promise<boolean> {
    const message = reason
      ? `Payment for order ${orderNumber} failed. Reason: ${reason}`
      : `Payment for order ${orderNumber} failed. Please try again.`;

    return this.sendToUser(userId, 'notification', {
      id: notificationId,
      userId,
      type: NotificationType.PAYMENT_FAILED,
      title: 'Payment Failed',
      message,
      data: { orderId, orderNumber, reason },
      channels: [NotificationChannel.IN_APP],
      isRead: false,
      createdAt: new Date().toISOString(),
    });
  }

  /**
   * Emit welcome notification when user signs up
   */
  async emitWelcome(
    userId: string,
    notificationId: string,
  ): Promise<boolean> {
    return this.sendToUser(userId, 'notification', {
      id: notificationId,
      userId,
      type: NotificationType.GENERAL,
      title: 'Welcome to SureSpot!',
      message: 'Thank you for joining SureSpot! We\'re excited to serve you delicious meals.',
      data: {},
      channels: [NotificationChannel.IN_APP],
      isRead: false,
      createdAt: new Date().toISOString(),
    });
  }
}


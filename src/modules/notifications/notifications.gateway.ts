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
import { PickupLocationsRepository } from '../pickup-locations/pickup-locations.repository';
import {
  NotificationType,
  NotificationChannel,
} from './schemas/notification.schema';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  pickupLocationId?: string;
  connectionType?: 'user' | 'pickup_location';
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
    private readonly pickupLocationsRepository: PickupLocationsRepository,
    @InjectModel(WebSocketConnection.name)
    private connectionModel: Model<WebSocketConnectionDocument>,
  ) {}

  afterInit(server: Server) {
    this.logger.log('Notifications WebSocket Gateway initialized');
  }

  async handleConnection(@ConnectedSocket() client: AuthenticatedSocket) {
    try {
      const auth = client.handshake.auth;
      const pickupLocationId = auth?.pickupLocationId;

      // Check if this is a pickup location connection
      if (pickupLocationId) {
        return this.handlePickupLocationConnection(client, pickupLocationId);
      }

      // Otherwise, handle as user connection
      return this.handleUserConnection(client);
    } catch (error) {
      this.logger.error(`Error handling connection for socket ${client.id}`, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      client.disconnect();
    }
  }

  /**
   * Handle user connection
   */
  private async handleUserConnection(
    client: AuthenticatedSocket,
  ): Promise<void> {
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
    client.connectionType = 'user';

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
      connectionType: 'user',
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
      connectionType: 'user',
    });
  }

  /**
   * Handle pickup location connection
   */
  private async handlePickupLocationConnection(
    client: AuthenticatedSocket,
    pickupLocationId: string,
  ): Promise<void> {
    // Validate pickup location ID format
    if (!Types.ObjectId.isValid(pickupLocationId)) {
      this.logger.warn(
        `Connection rejected: Invalid pickupLocationId format for socket ${client.id}`,
      );
      client.disconnect();
      return;
    }

    // Verify pickup location exists and is active
    const pickupLocation =
      await this.pickupLocationsRepository.findById(pickupLocationId);
    if (!pickupLocation) {
      this.logger.warn(
        `Connection rejected: Pickup location not found for socket ${client.id}`,
      );
      client.disconnect();
      return;
    }

    if (!pickupLocation.isActive) {
      this.logger.warn(
        `Connection rejected: Pickup location inactive for socket ${client.id}`,
      );
      client.disconnect();
      return;
    }

    // Attach pickupLocationId to socket
    client.pickupLocationId = pickupLocationId;
    client.connectionType = 'pickup_location';

    // Deactivate any existing connections for this pickup location (handle reconnection)
    await this.connectionModel.updateMany(
      {
        pickupLocationId: new Types.ObjectId(pickupLocationId),
        isActive: true,
      },
      {
        $set: {
          isActive: false,
          disconnectedAt: new Date(),
        },
      },
    );

    // Store new connection
    await this.connectionModel.create({
      pickupLocationId: new Types.ObjectId(pickupLocationId),
      connectionType: 'pickup_location',
      socketId: client.id,
      isActive: true,
      connectedAt: new Date(),
      lastActivityAt: new Date(),
    });

    // Join pickup location to their room (room name = pickup-location-{id})
    const roomName = `pickup-location-${pickupLocationId}`;
    await client.join(roomName);

    this.logger.log(
      `Pickup location ${pickupLocationId} connected with socket ${client.id} and joined room ${roomName}`,
    );

    // Emit connection confirmation
    client.emit('connected', {
      success: true,
      message: 'Connected to notifications',
      pickupLocationId,
      connectionType: 'pickup_location',
    });
  }

  async handleDisconnect(@ConnectedSocket() client: AuthenticatedSocket) {
    try {
      if (!client.userId && !client.pickupLocationId) {
        this.logger.warn(
          `Disconnect: No userId or pickupLocationId found for socket ${client.id}`,
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

      if (client.userId) {
        this.logger.log(
          `User ${client.userId} disconnected (socket ${client.id})`,
        );
      } else if (client.pickupLocationId) {
        this.logger.log(
          `Pickup location ${client.pickupLocationId} disconnected (socket ${client.id})`,
        );
      }
    } catch (error) {
      this.logger.error(`Error handling disconnect for socket ${client.id}`, {
        error: error instanceof Error ? error.message : String(error),
      });
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
      this.logger.error(`Error sending notification to user ${userId}`, {
        error: error instanceof Error ? error.message : String(error),
      });
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
   * Send notification to a specific pickup location
   */
  async sendToPickupLocation(
    pickupLocationId: string,
    event: string,
    data: Record<string, unknown>,
  ): Promise<boolean> {
    try {
      // Validate pickupLocationId format before using it
      if (!Types.ObjectId.isValid(pickupLocationId)) {
        this.logger.warn(
          `Invalid pickupLocationId format when sending notification: ${pickupLocationId}`,
        );
        return false;
      }

      // Check if pickup location has active connections
      const activeConnections = await this.connectionModel.countDocuments({
        pickupLocationId: new Types.ObjectId(pickupLocationId),
        isActive: true,
      });

      if (activeConnections === 0) {
        this.logger.debug(
          `No active connections for pickup location ${pickupLocationId}, notification not sent`,
        );
        return false;
      }

      // Emit to pickup location's room
      const roomName = `pickup-location-${pickupLocationId}`;
      this.server.to(roomName).emit(event, data);

      this.logger.log(
        `Notification sent to pickup location ${pickupLocationId} via ${activeConnections} connection(s)`,
      );

      return true;
    } catch (error) {
      this.logger.error(
        `Error sending notification to pickup location ${pickupLocationId}`,
        {
          error: error instanceof Error ? error.message : String(error),
        },
      );
      return false;
    }
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
      this.logger.error(`Error updating activity for socket ${socketId}`, {
        error: error instanceof Error ? error.message : String(error),
      });
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
  async emitWelcome(userId: string, notificationId: string): Promise<boolean> {
    return this.sendToUser(userId, 'notification', {
      id: notificationId,
      userId,
      type: NotificationType.GENERAL,
      title: 'Welcome to SureSpot!',
      message:
        "Thank you for joining SureSpot! We're excited to serve you delicious meals.",
      data: {},
      channels: [NotificationChannel.IN_APP],
      isRead: false,
      createdAt: new Date().toISOString(),
    });
  }

  /**
   * Emit order placed notification to pickup location
   */
  async emitOrderPlacedToPickupLocation(
    pickupLocationId: string,
    orderNumber: string,
    orderId: string,
    total: number,
    itemCount: number,
  ): Promise<boolean> {
    return this.sendToPickupLocation(pickupLocationId, 'order_placed', {
      orderId,
      orderNumber,
      total,
      itemCount,
      formattedTotal: `₦${(total / 100).toLocaleString('en-NG')}`,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit rider assigned notification to customer
   */
  async emitRiderAssigned(
    userId: string,
    orderNumber: string,
    orderId: string,
    data: { riderName: string; orderNumber: string },
  ): Promise<boolean> {
    return this.sendToUser(userId, 'notification', {
      userId,
      type: NotificationType.ORDER_OUT_FOR_DELIVERY,
      title: 'Rider Assigned',
      message: `${data.riderName} is on the way to pick up your order ${orderNumber}.`,
      data: { orderId, orderNumber, riderName: data.riderName },
      channels: [NotificationChannel.IN_APP],
      isRead: false,
      createdAt: new Date().toISOString(),
    });
  }

  /**
   * Emit rider assigned notification to pickup location
   */
  async emitRiderAssignedToPickupLocation(
    pickupLocationId: string,
    orderNumber: string,
    orderId: string,
    data: { riderName: string; orderNumber: string },
  ): Promise<boolean> {
    return this.sendToPickupLocation(pickupLocationId, 'rider_assigned', {
      orderId,
      orderNumber,
      riderName: data.riderName,
      message: `${data.riderName} is on the way to pick up order ${orderNumber}.`,
      timestamp: new Date().toISOString(),
    });
  }
}

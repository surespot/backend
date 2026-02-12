import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuthRepository } from '../auth/auth.repository';
import { UserRole } from '../auth/schemas/user.schema';
import {
  WebSocketConnection,
  WebSocketConnectionDocument,
} from '../notifications/schemas/websocket-connection.schema';

interface AuthenticatedAdminSocket extends Socket {
  userId?: string;
  pickupLocationId?: string;
  role?: string;
}

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/admin',
})
export class AdminGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(AdminGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly authRepository: AuthRepository,
    @InjectModel(WebSocketConnection.name)
    private connectionModel: Model<WebSocketConnectionDocument>,
  ) {}

  afterInit() {
    this.logger.log('Admin WebSocket Gateway initialized');
  }

  async handleConnection(@ConnectedSocket() client: AuthenticatedAdminSocket) {
    try {
      // Extract token from socket.auth
      const token = client.handshake.auth?.token as string | undefined;

      if (!token) {
        this.logger.warn(
          `Admin connection rejected: No token provided for socket ${client.id}`,
        );
        client.disconnect();
        return;
      }

      // Verify JWT token
      const jwtSecret =
        this.configService.get<string>('JWT_SECRET') ?? 'default-secret-key';
      let payload: {
        sub: string;
        role?: string;
        pickupLocationId?: string;
        iat?: number;
        exp?: number;
      };

      try {
        payload = this.jwtService.verify<{
          sub: string;
          role?: string;
          pickupLocationId?: string;
          iat?: number;
          exp?: number;
        }>(token, {
          secret: jwtSecret,
        });
      } catch (error) {
        this.logger.warn(
          `Admin connection rejected: Invalid token for socket ${client.id}`,
          {
            error: error instanceof Error ? error.message : String(error),
          },
        );
        client.disconnect();
        return;
      }

      const userId = payload.sub;

      // Fetch user from database
      const user = await this.authRepository.findUserById(userId);

      if (!user) {
        this.logger.warn(
          `Admin connection rejected: User not found for socket ${client.id}`,
        );
        client.disconnect();
        return;
      }

      // Verify user is admin or pickup admin
      if (
        user.role !== UserRole.ADMIN &&
        user.role !== UserRole.PICKUP_ADMIN
      ) {
        this.logger.warn(
          `Admin connection rejected: User ${userId} is not an admin (role: ${user.role})`,
        );
        client.disconnect();
        return;
      }

      // Verify user has a pickup location
      if (!user.pickupLocationId) {
        this.logger.warn(
          `Admin connection rejected: User ${userId} has no pickup location`,
        );
        client.disconnect();
        return;
      }

      // Store user info on socket
      client.userId = userId;
      client.pickupLocationId = user.pickupLocationId.toString();
      client.role = user.role;

      // Join pickup location room
      const roomName = `admin-${client.pickupLocationId}`;
      await client.join(roomName);

      // Store connection in database
      await this.connectionModel.create({
        socketId: client.id,
        userId: new Types.ObjectId(userId),
        pickupLocationId: user.pickupLocationId,
        connectionType: 'admin',
        connectedAt: new Date(),
        isActive: true,
      });

      this.logger.log(
        `Admin ${userId} (${user.role}) connected for pickup location ${client.pickupLocationId} (socket ${client.id})`,
      );

      // Send connection acknowledgment
      client.emit('connected', {
        userId,
        pickupLocationId: client.pickupLocationId,
        role: user.role,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error(
        `Error handling admin connection for socket ${client.id}`,
        {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
      );
      client.disconnect();
    }
  }

  async handleDisconnect(@ConnectedSocket() client: AuthenticatedAdminSocket) {
    try {
      if (client.userId) {
        this.logger.log(
          `Admin ${client.userId} disconnected (socket ${client.id})`,
        );

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
      } else {
        this.logger.warn(
          `Admin disconnect: No userId found for socket ${client.id}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Error handling admin disconnect for socket ${client.id}`,
        {
          error: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }

  /**
   * Send event to all admins for a specific pickup location
   */
  async emitToPickupLocation(
    pickupLocationId: string,
    event: string,
    data: Record<string, unknown>,
  ): Promise<boolean> {
    try {
      // Validate pickupLocationId format
      if (!Types.ObjectId.isValid(pickupLocationId)) {
        this.logger.warn(
          `Invalid pickupLocationId format when emitting to admins: ${pickupLocationId}`,
        );
        return false;
      }

      // Check if there are active admin connections for this pickup location
      const activeConnections = await this.connectionModel.countDocuments({
        pickupLocationId: new Types.ObjectId(pickupLocationId),
        connectionType: 'admin',
        isActive: true,
      });

      if (activeConnections === 0) {
        this.logger.debug(
          `No active admin connections for pickup location ${pickupLocationId}, event not sent`,
        );
        return false;
      }

      // Emit to pickup location's admin room
      const roomName = `admin-${pickupLocationId}`;
      this.server.to(roomName).emit(event, data);

      this.logger.debug(
        `Emitted ${event} to ${activeConnections} admin(s) in pickup location ${pickupLocationId}`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Error emitting ${event} to pickup location ${pickupLocationId}`,
        {
          error: error instanceof Error ? error.message : String(error),
        },
      );
      return false;
    }
  }

  /**
   * Emit order stats update
   */
  async emitOrderStatsUpdate(
    pickupLocationId: string,
    stats: {
      totalOrders: number;
      pendingOrders: number;
      confirmedOrders: number;
      preparingOrders: number;
      readyOrders: number;
      outForDeliveryOrders: number;
      deliveredOrders: number;
      cancelledOrders: number;
      todayRevenue: number;
    },
  ): Promise<boolean> {
    return this.emitToPickupLocation(pickupLocationId, 'order_stats_update', {
      stats,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit order created event
   */
  async emitOrderCreated(
    pickupLocationId: string,
    orderData: {
      orderId: string;
      orderNumber: string;
      total: number;
      itemCount: number;
      order?: any; // Optional full order details
    },
  ): Promise<boolean> {
    return this.emitToPickupLocation(pickupLocationId, 'order_created', {
      orderId: orderData.orderId,
      orderNumber: orderData.orderNumber,
      total: orderData.total,
      itemCount: orderData.itemCount,
      formattedTotal: `₦${(orderData.total / 100).toLocaleString('en-NG')}`,
      order: orderData.order, // Include full order details if provided
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit order status changed event
   */
  async emitOrderStatusChanged(
    pickupLocationId: string,
    orderData: {
      orderId: string;
      orderNumber: string;
      oldStatus: string;
      newStatus: string;
    },
  ): Promise<boolean> {
    return this.emitToPickupLocation(
      pickupLocationId,
      'order_status_changed',
      {
        ...orderData,
        timestamp: new Date().toISOString(),
      },
    );
  }

  /**
   * Emit order picked up event
   */
  async emitOrderPickedUp(
    pickupLocationId: string,
    orderData: {
      orderId: string;
      orderNumber: string;
      riderName?: string;
    },
  ): Promise<boolean> {
    const message = orderData.riderName
      ? `${orderData.riderName} has picked up order ${orderData.orderNumber}.`
      : `Order ${orderData.orderNumber} has been picked up.`;

    return this.emitToPickupLocation(pickupLocationId, 'order_picked_up', {
      orderId: orderData.orderId,
      orderNumber: orderData.orderNumber,
      riderName: orderData.riderName,
      message,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit rider assigned event
   */
  async emitRiderAssigned(
    pickupLocationId: string,
    orderData: {
      orderId: string;
      orderNumber: string;
      riderName: string;
    },
  ): Promise<boolean> {
    return this.emitToPickupLocation(pickupLocationId, 'rider_assigned', {
      orderId: orderData.orderId,
      orderNumber: orderData.orderNumber,
      riderName: orderData.riderName,
      message: `${orderData.riderName} is on the way to pick up order ${orderData.orderNumber}.`,
      timestamp: new Date().toISOString(),
    });
  }
}

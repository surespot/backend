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
import { AuthRepository } from '../auth/auth.repository';
import { RidersRepository } from '../riders/riders.repository';
import { UserRole } from '../auth/schemas/user.schema';

interface AuthenticatedRiderSocket extends Socket {
  userId?: string;
  riderProfileId?: string;
  regionId?: string;
}

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/orders',
})
export class OrdersGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(OrdersGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly authRepository: AuthRepository,
    private readonly ridersRepository: RidersRepository,
  ) {}

  afterInit() {
    this.logger.log('Orders WebSocket Gateway initialized');
  }

  async handleConnection(@ConnectedSocket() client: AuthenticatedRiderSocket) {
    try {
      // Extract token from socket.auth (Socket.IO authentication)
      const token = client.handshake.auth?.token as string | undefined;

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
        payload = this.jwtService.verify<{
          sub: string;
          role?: string;
          iat?: number;
          exp?: number;
        }>(token, {
          secret: jwtSecret,
        });
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

      // Only riders can connect to orders namespace
      if (user.role !== UserRole.RIDER || !user.isRider) {
        this.logger.warn(
          `Connection rejected: User is not a rider for socket ${client.id}`,
        );
        client.disconnect();
        return;
      }

      // Get rider profile to get regionId
      const riderProfile = await this.ridersRepository.findByUserId(userId);
      if (!riderProfile) {
        this.logger.warn(
          `Connection rejected: Rider profile not found for socket ${client.id}`,
        );
        client.disconnect();
        return;
      }

      // Attach rider info to socket
      client.userId = userId;
      client.riderProfileId = riderProfile._id.toString();
      client.regionId = riderProfile.regionId.toString();

      // Join rider to general riders room
      await client.join('riders');

      // Join rider to region-specific room
      const regionRoom = `riders-region-${client.regionId}`;
      await client.join(regionRoom);

      // Join rider to their personal room
      const personalRoom = `rider-${client.riderProfileId}`;
      await client.join(personalRoom);

      this.logger.log(
        `Rider ${userId} connected with socket ${client.id} and joined rooms: riders, ${regionRoom}, ${personalRoom}`,
      );

      client.emit('connected', {
        success: true,
        message: 'Connected to orders',
        riderProfileId: client.riderProfileId,
        regionId: client.regionId,
        rooms: ['riders', regionRoom, personalRoom],
      });
    } catch (error) {
      this.logger.error(`Error handling connection for socket ${client.id}`, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      client.disconnect();
    }
  }

  handleDisconnect(@ConnectedSocket() client: AuthenticatedRiderSocket) {
    try {
      if (client.userId) {
        this.logger.log(
          `Rider ${client.userId} disconnected (socket ${client.id})`,
        );
      } else {
        this.logger.warn(`Disconnect: No userId found for socket ${client.id}`);
      }
    } catch (error) {
      this.logger.error(`Error handling disconnect for socket ${client.id}`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Emit order:ready notification to a specific rider (via their personal room)
   */
  async emitOrderReadyToRider(
    riderProfileId: string,
    orderId: string,
    orderNumber: string,
    pickupLocation: {
      id: string;
      name: string;
      address: string;
      latitude: number;
      longitude: number;
    },
    deliveryAddress: {
      address: string;
      coordinates: { latitude: number; longitude: number };
    },
    total: number,
    itemCount: number,
  ): Promise<boolean> {
    try {
      const roomName = `rider-${riderProfileId}`;
      const activeConnections = await this.server.in(roomName).fetchSockets();

      if (activeConnections.length === 0) {
        this.logger.debug(
          `No active connection for rider ${riderProfileId}, notification not sent`,
        );
        return false;
      }

      this.server.to(roomName).emit('order:ready', {
        orderId,
        orderNumber,
        pickupLocation,
        deliveryAddress,
        total,
        formattedTotal: `₦${(total / 100).toLocaleString('en-NG')}`,
        itemCount,
        timestamp: new Date().toISOString(),
      });

      this.logger.log(
        `Order ready notification sent to rider ${riderProfileId} for order ${orderNumber}`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Error sending order ready notification to rider ${riderProfileId}`,
        {
          error: error instanceof Error ? error.message : String(error),
        },
      );
      return false;
    }
  }

  /**
   * Emit order:ready notification to all riders in a region (deprecated - use emitOrderReadyToRider for nearby riders)
   * Kept for backward compatibility if needed
   */
  async emitOrderReadyToRiders(
    regionId: string,
    orderId: string,
    orderNumber: string,
    pickupLocation: {
      id: string;
      name: string;
      address: string;
      latitude: number;
      longitude: number;
    },
    deliveryAddress: {
      address: string;
      coordinates: { latitude: number; longitude: number };
    },
    total: number,
    itemCount: number,
  ): Promise<boolean> {
    try {
      const roomName = `riders-region-${regionId}`;
      const activeConnections = await this.server.in(roomName).fetchSockets();

      if (activeConnections.length === 0) {
        this.logger.debug(
          `No active rider connections in region ${regionId}, notification not sent`,
        );
        return false;
      }

      this.server.to(roomName).emit('order:ready', {
        orderId,
        orderNumber,
        pickupLocation,
        deliveryAddress,
        total,
        formattedTotal: `₦${(total / 100).toLocaleString('en-NG')}`,
        itemCount,
        timestamp: new Date().toISOString(),
      });

      this.logger.log(
        `Order ready notification sent to ${activeConnections.length} rider(s) in region ${regionId} for order ${orderNumber}`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Error sending order ready notification to riders in region ${regionId}`,
        {
          error: error instanceof Error ? error.message : String(error),
        },
      );
      return false;
    }
  }

  /**
   * Emit order:ready notification to all riders (general room)
   */
  async emitOrderReadyToAllRiders(
    orderId: string,
    orderNumber: string,
    regionId: string,
    pickupLocation: {
      id: string;
      name: string;
      address: string;
      latitude: number;
      longitude: number;
    },
    deliveryAddress: {
      address: string;
      coordinates: { latitude: number; longitude: number };
    },
    total: number,
    itemCount: number,
  ): Promise<boolean> {
    try {
      const activeConnections = await this.server.in('riders').fetchSockets();

      if (activeConnections.length === 0) {
        this.logger.debug(`No active rider connections, notification not sent`);
        return false;
      }

      this.server.to('riders').emit('order:ready', {
        orderId,
        orderNumber,
        regionId,
        pickupLocation,
        deliveryAddress,
        total,
        formattedTotal: `₦${(total / 100).toLocaleString('en-NG')}`,
        itemCount,
        timestamp: new Date().toISOString(),
      });

      this.logger.log(
        `Order ready notification sent to ${activeConnections.length} rider(s) for order ${orderNumber}`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Error sending order ready notification to all riders`,
        {
          error: error instanceof Error ? error.message : String(error),
        },
      );
      return false;
    }
  }

  /**
   * Emit order:picked_up notification to a specific rider (when pickup location marks as picked up)
   */
  async emitOrderPickedUpToRider(
    riderProfileId: string,
    orderId: string,
    orderNumber: string,
  ): Promise<boolean> {
    try {
      const roomName = `rider-${riderProfileId}`;
      const activeConnections = await this.server.in(roomName).fetchSockets();

      if (activeConnections.length === 0) {
        this.logger.debug(
          `No active connection for rider ${riderProfileId}, picked up notification not sent`,
        );
        return false;
      }

      this.server.to(roomName).emit('order:picked_up', {
        orderId,
        orderNumber,
        message: `Order ${orderNumber} has been picked up from the pickup location.`,
        timestamp: new Date().toISOString(),
      });

      this.logger.log(
        `Order picked up notification sent to rider ${riderProfileId} for order ${orderNumber}`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Error sending order picked up notification to rider ${riderProfileId}`,
        {
          error: error instanceof Error ? error.message : String(error),
        },
      );
      return false;
    }
  }
}

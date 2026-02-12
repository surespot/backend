import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  ConnectedSocket,
  SubscribeMessage,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UnauthorizedException, Inject, forwardRef } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  WebSocketConnection,
  WebSocketConnectionDocument,
} from '../notifications/schemas/websocket-connection.schema';
import { AuthRepository } from '../auth/auth.repository';
import { ChatService } from './chat.service';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  connectionType?: 'user';
}

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/chat',
})
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);
  private readonly connectedUsers = new Map<string, Set<string>>(); // userId -> Set of socketIds

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly authRepository: AuthRepository,
    @Inject(forwardRef(() => ChatService))
    private readonly chatService: ChatService,
    @InjectModel(WebSocketConnection.name)
    private connectionModel: Model<WebSocketConnectionDocument>,
  ) {}

  afterInit(server: Server) {
    this.logger.log('Chat WebSocket Gateway initialized');
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
      client.connectionType = 'user';

      // Track connection
      if (!this.connectedUsers.has(userId)) {
        this.connectedUsers.set(userId, new Set());
      }
      this.connectedUsers.get(userId)!.add(client.id);

      // Store connection in database (for chat namespace, we track in memory only)
      // The WebSocketConnection schema is shared with notifications namespace

      // Join user to their room
      await client.join(`user:${userId}`);

      this.logger.log(
        `User ${userId} connected to chat with socket ${client.id}`,
      );

      // Emit connection confirmation
      client.emit('connected', {
        success: true,
        message: 'Connected to chat',
        userId,
      });
    } catch (error) {
      this.logger.error(`Error handling connection for socket ${client.id}`, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      client.disconnect();
    }
  }

  async handleDisconnect(@ConnectedSocket() client: AuthenticatedSocket) {
    try {
      if (!client.userId) {
        return;
      }

      // Remove from tracking
      const userSockets = this.connectedUsers.get(client.userId);
      if (userSockets) {
        userSockets.delete(client.id);
        if (userSockets.size === 0) {
          this.connectedUsers.delete(client.userId);
        }
      }

      // Connection tracking is in-memory only for chat namespace

      this.logger.log(
        `User ${client.userId} disconnected from chat (socket ${client.id})`,
      );
    } catch (error) {
      this.logger.error(`Error handling disconnect for socket ${client.id}`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Check if user is connected to chat namespace
   */
  async isUserConnected(userId: string): Promise<boolean> {
    const userSockets = this.connectedUsers.get(userId);
    return userSockets ? userSockets.size > 0 : false;
  }

  /**
   * Join a conversation room
   */
  @SubscribeMessage('join-conversation')
  async handleJoinConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    if (!client.userId) {
      return { success: false, error: 'Not authenticated' };
    }

    const roomName = `conversation:${data.conversationId}`;
    await client.join(roomName);

    this.logger.debug(
      `User ${client.userId} joined conversation room ${roomName}`,
    );

    return { success: true, conversationId: data.conversationId };
  }

  /**
   * Leave a conversation room
   */
  @SubscribeMessage('leave-conversation')
  async handleLeaveConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    if (!client.userId) {
      return { success: false, error: 'Not authenticated' };
    }

    const roomName = `conversation:${data.conversationId}`;
    await client.leave(roomName);

    this.logger.debug(
      `User ${client.userId} left conversation room ${roomName}`,
    );

    return { success: true, conversationId: data.conversationId };
  }

  /**
   * Handle send-message event from client
   */
  @SubscribeMessage('send-message')
  async handleSendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody()
    data: {
      conversationId: string;
      orderId: string;
      content: string;
      attachments?: Array<{ url: string; type: string; filename?: string }>;
    },
  ) {
    if (!client.userId) {
      return { success: false, error: 'Not authenticated' };
    }

    try {
      // Use service to send message (handles validation and persistence)
      const result = await this.chatService.sendMessage(
        client.userId,
        data.orderId,
        data.content,
      );

      return result;
    } catch (error) {
      this.logger.error('Error handling send-message', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send message',
      };
    }
  }

  /**
   * Handle typing indicator
   */
  @SubscribeMessage('typing')
  async handleTyping(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    if (!client.userId) {
      return;
    }

    const roomName = `conversation:${data.conversationId}`;
    // Emit to all in conversation room except sender
    client.to(roomName).emit('user-typing', {
      conversationId: data.conversationId,
      userId: client.userId,
      isTyping: true,
    });
  }

  /**
   * Handle stop typing indicator
   */
  @SubscribeMessage('stop-typing')
  async handleStopTyping(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    if (!client.userId) {
      return;
    }

    const roomName = `conversation:${data.conversationId}`;
    // Emit to all in conversation room except sender
    client.to(roomName).emit('user-typing', {
      conversationId: data.conversationId,
      userId: client.userId,
      isTyping: false,
    });
  }

  /**
   * Handle read conversation
   */
  @SubscribeMessage('read-conversation')
  async handleReadConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    if (!client.userId) {
      return { success: false, error: 'Not authenticated' };
    }

    try {
      await this.chatService.markRead(data.conversationId, client.userId);
      return { success: true };
    } catch (error) {
      this.logger.error('Error handling read-conversation', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to mark as read',
      };
    }
  }

  /**
   * Emit new message to conversation room
   */
  emitNewMessage(conversationId: string, message: any) {
    const roomName = `conversation:${conversationId}`;
    this.server.to(roomName).emit('new-message', message);
    this.logger.debug(`Emitted new-message to room ${roomName}`);
  }

  /**
   * Emit messages read event
   */
  emitMessagesRead(conversationId: string, userId: string) {
    const roomName = `conversation:${conversationId}`;
    this.server.to(roomName).emit('messages-read', {
      conversationId,
      readBy: userId,
      readAt: new Date().toISOString(),
    });
    this.logger.debug(`Emitted messages-read to room ${roomName}`);
  }

  /**
   * Emit conversation read-only event
   */
  emitConversationReadOnly(conversationId: string) {
    const roomName = `conversation:${conversationId}`;
    this.server.to(roomName).emit('conversation-read-only', {
      conversationId,
      message: 'This conversation is now read-only',
    });
    this.logger.debug(`Emitted conversation-read-only to room ${roomName}`);
  }
}

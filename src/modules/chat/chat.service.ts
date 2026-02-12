import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ChatRepository } from './chat.repository';
import { OrdersRepository } from '../orders/orders.repository';
import { RidersRepository } from '../riders/riders.repository';
import { NotificationsService } from '../notifications/notifications.service';
import { CloudinaryService } from '../../common/cloudinary/cloudinary.service';
import { OrderStatus } from '../orders/schemas/order.schema';
import { NotificationType, NotificationChannel } from '../notifications/schemas/notification.schema';
import { ChatGateway } from './chat.gateway';
import {  UserDocument } from '../auth/schemas/user.schema';
import { Types } from 'mongoose';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  /**
   * Helper to extract userId from participant
   * Handles both populated (object with _id) and unpopulated (ObjectId) cases
   */
  private getUserIdFromParticipant(userId: Types.ObjectId | UserDocument): string {
    // Handle populated (object with _id) or unpopulated (ObjectId) cases
    if (userId && typeof userId === 'object' && userId._id) {
      return userId._id.toString();
    }
    return userId.toString();
  }

  constructor(
    private readonly chatRepository: ChatRepository,
    private readonly ordersRepository: OrdersRepository,
    private readonly ridersRepository: RidersRepository,
    private readonly notificationsService: NotificationsService,
    private readonly cloudinaryService: CloudinaryService,
    @Inject(forwardRef(() => ChatGateway))
    private readonly chatGateway: ChatGateway,
  ) {}

  /**
   * Find or create order conversation
   * Validates order access and status before creating
   */
  async findOrCreateOrderConversation(
    orderId: string,
    userId: string,
  ) {
    // Get order
    const order = await this.ordersRepository.findById(orderId);
    if (!order) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'ORDER_NOT_FOUND',
          message: 'Order not found',
        },
      });
    }

    // Check if order has assigned rider
    if (!order.assignedRiderId) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'NO_RIDER_ASSIGNED',
          message: 'Order does not have an assigned rider yet',
        },
      });
    }

    // Verify user is either customer or assigned rider
    const isCustomer = order.userId.toString() === userId;
    const riderProfile = await this.ridersRepository.findByUserId(userId);
    const isAssignedRider =
      riderProfile &&
      order.assignedRiderId.toString() === riderProfile._id.toString();

    if (!isCustomer && !isAssignedRider) {
      throw new ForbiddenException({
        success: false,
        error: {
          code: 'ACCESS_DENIED',
          message: 'You do not have access to this order conversation',
        },
      });
    }

    // Get customer and rider IDs
    const customerId = order.userId.toString();
    const riderId = order.assignedRiderId.toString();
    const riderUser = await this.ridersRepository.findById(riderId);
    if (!riderUser || !riderUser.userId) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'RIDER_USER_NOT_FOUND',
          message: 'Rider user account not found',
        },
      });
    }
    const riderUserId = riderUser.userId.toString();

    // Find or create conversation
    const conversation = await this.chatRepository.findOrCreateOrderConversation(
      orderId,
      customerId,
      riderUserId,
    );

    // Populate participants
    const populated = await this.chatRepository.findById(
      conversation._id.toString(),
    );

    return {
      success: true,
      message: 'Conversation retrieved successfully',
      data: {
        id: populated!._id.toString(),
        type: populated!.type,
        orderId: populated!.orderId.toString(),
        participants: populated!.participants.map((p) => ({
          userId: this.getUserIdFromParticipant(p.userId),
          role: p.role,
          user: p.userId,
        })),
        lastMessageAt: populated!.lastMessageAt?.toISOString(),
        isActive: populated!.isActive,
        createdAt: populated!.createdAt?.toISOString(),
        updatedAt: populated!.updatedAt?.toISOString(),
      },
    };
  }

  /**
   * Send a message
   * Validates order status and conversation access
   */
  async sendMessage(
    userId: string,
    orderId: string,
    content: string,
    attachments?: Express.Multer.File[],
  ) {
    // Get order
    const order = await this.ordersRepository.findById(orderId);
    if (!order) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'ORDER_NOT_FOUND',
          message: 'Order not found',
        },
      });
    }

    // Verify user is either customer or assigned rider
    const isCustomer = order.userId.toString() === userId;
    const riderProfile = await this.ridersRepository.findByUserId(userId);
    const isAssignedRider =
      riderProfile &&
      order.assignedRiderId &&
      order.assignedRiderId.toString() === riderProfile._id.toString();

    if (!isCustomer && !isAssignedRider) {
      throw new ForbiddenException({
        success: false,
        error: {
          code: 'ACCESS_DENIED',
          message: 'You do not have access to this order conversation',
        },
      });
    }

    // Enforce policy: chat only available when order is OUT_FOR_DELIVERY
    if (order.status !== OrderStatus.OUT_FOR_DELIVERY) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'CHAT_NOT_AVAILABLE',
          message: `Chat is only available when order is out for delivery. Current status: ${order.status}`,
        },
      });
    }

    // Get or create conversation
    const conversation = await this.chatRepository.findByOrderId(orderId);
    if (!conversation) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'CONVERSATION_NOT_FOUND',
          message: 'Conversation not found',
        },
      });
    }

    // Check if conversation is active (not read-only)
    if (!conversation.isActive) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'CONVERSATION_READ_ONLY',
          message: 'This conversation is read-only',
        },
      });
    }

    // Upload attachments to Cloudinary if provided
    const attachmentData: Array<{
      url: string;
      type: string;
      filename?: string;
    }> = [];

    if (attachments && attachments.length > 0) {
      for (const file of attachments) {
        try {
          // Validate file type
          const allowedTypes = [
            'image/jpeg',
            'image/jpg',
            'image/png',
            'image/webp',
            'application/pdf',
          ];
          if (!allowedTypes.includes(file.mimetype)) {
            this.logger.warn(
              `Invalid file type for attachment: ${file.mimetype}`,
            );
            continue; // Skip invalid files
          }

          const uploadResult = await this.cloudinaryService.uploadImage(file);
          attachmentData.push({
            url: (uploadResult as { secure_url: string }).secure_url,
            type: file.mimetype.startsWith('image/') ? 'image' : 'file',
            filename: file.originalname,
          });
        } catch (error) {
          this.logger.error('Failed to upload attachment', {
            error: error instanceof Error ? error.message : String(error),
          });
          // Continue with other attachments
        }
      }
    }

    // Get receiver ID (the other participant)
    const receiver = conversation.participants.find(
      (p) => this.getUserIdFromParticipant(p.userId) !== userId,
    );
    const receiverId = receiver
      ? this.getUserIdFromParticipant(receiver.userId)
      : undefined;

    // Create message
    const message = await this.chatRepository.addMessage(
      conversation._id.toString(),
      {
        senderId: userId,
        receiverId,
        content,
        attachments: attachmentData.length > 0 ? attachmentData : undefined,
      },
    );

    // Populate sender
    const populatedMessage = await this.chatRepository.findMessageById(
      message._id.toString(),
    );

    // Emit WebSocket event to conversation room
    this.chatGateway.emitNewMessage(conversation._id.toString(), {
      id: populatedMessage!._id.toString(),
      conversationId: conversation._id.toString(),
      senderId: userId,
      receiverId,
      content,
      attachments: attachmentData.length > 0 ? attachmentData : undefined,
      isRead: false,
      createdAt: populatedMessage!.createdAt?.toISOString(),
      sender: populatedMessage!.senderId,
    });

    // Check if receiver is online and queue notification if offline
    const isReceiverOnline = await this.chatGateway.isUserConnected(
      receiverId!,
    );

    if (!isReceiverOnline && receiverId) {
      // Queue notification for offline user
      await this.notificationsService.queueNotification(
        receiverId,
        NotificationType.CHAT_MESSAGE,
        'New Message',
        content.length > 100 ? `${content.substring(0, 100)}...` : content,
        {
          orderId,
          conversationId: conversation._id.toString(),
          senderId: userId,
          messageId: message._id.toString(),
        },
        [NotificationChannel.IN_APP, NotificationChannel.PUSH],
      );
    }

    return {
      success: true,
      message: 'Message sent successfully',
      data: {
        id: populatedMessage!._id.toString(),
        conversationId: conversation._id.toString(),
        senderId: userId,
        receiverId,
        content,
        attachments: attachmentData.length > 0 ? attachmentData : undefined,
        isRead: false,
        createdAt: populatedMessage!.createdAt?.toISOString(),
        updatedAt: populatedMessage!.updatedAt?.toISOString(),
        sender: populatedMessage!.senderId,
      },
    };
  }

  /**
   * Get conversations for a user
   */
  async getConversationsForUser(
    userId: string,
    filters?: {
      page?: number;
      limit?: number;
      type?: string;
    },
  ) {
    const result = await this.chatRepository.findByParticipant(userId, {
      page: filters?.page,
      limit: filters?.limit,
      type: filters?.type as any,
    });

    // Get last message for each conversation
    const conversationsWithLastMessage = await Promise.all(
      result.items.map(async (conv) => {
        const messages = await this.chatRepository.getMessages(
          conv._id.toString(),
          undefined,
          1,
        );
        const lastMessage = messages.items[0];

        return {
          id: conv._id.toString(),
          type: conv.type,
          orderId: conv.orderId.toString(),
          participants: conv.participants.map((p) => ({
            userId: this.getUserIdFromParticipant(p.userId),
            role: p.role,
            user: p.userId,
          })),
          lastMessage: lastMessage
            ? {
                id: lastMessage._id.toString(),
                content: lastMessage.content,
                senderId: lastMessage.senderId.toString(),
                createdAt: lastMessage.createdAt?.toISOString(),
              }
            : null,
          lastMessageAt: conv.lastMessageAt?.toISOString(),
          isActive: conv.isActive,
          createdAt: conv.createdAt?.toISOString(),
          updatedAt: conv.updatedAt?.toISOString(),
        };
      }),
    );

    return {
      success: true,
      message: 'Conversations retrieved successfully',
      data: {
        conversations: conversationsWithLastMessage,
        pagination: result.pagination,
      },
    };
  }

  /**
   * Get messages for a conversation with cursor-based pagination
   */
  async getMessages(
    conversationId: string,
    userId: string,
    cursor?: string,
    limit: number = 50,
  ) {
    // Verify user is participant
    const conversation = await this.chatRepository.findById(conversationId);
    if (!conversation) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'CONVERSATION_NOT_FOUND',
          message: 'Conversation not found',
        },
      });
    }

    const isParticipant = conversation.participants.some(
      (p) => this.getUserIdFromParticipant(p.userId) === userId,
    );

    if (!isParticipant) {
      throw new ForbiddenException({
        success: false,
        error: {
          code: 'ACCESS_DENIED',
          message: 'You do not have access to this conversation',
        },
      });
    }

    // Get messages
    const result = await this.chatRepository.getMessages(
      conversationId,
      cursor,
      limit,
    );

    return {
      success: true,
      message: 'Messages retrieved successfully',
      data: {
        messages: result.items.map((msg) => ({
          id: msg._id.toString(),
          conversationId: msg.conversationId.toString(),
          senderId: msg.senderId.toString(),
          receiverId: msg.receiverId?.toString(),
          content: msg.content,
          attachments: msg.attachments,
          isRead: msg.isRead,
          readAt: msg.readAt?.toISOString(),
          createdAt: msg.createdAt?.toISOString(),
          updatedAt: msg.updatedAt?.toISOString(),
          sender: msg.senderId,
        })),
        cursor: result.cursor,
        hasMore: result.hasMore,
      },
    };
  }

  /**
   * Mark conversation as read
   */
  async markRead(conversationId: string, userId: string) {
    // Verify user is participant
    const conversation = await this.chatRepository.findById(conversationId);
    if (!conversation) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'CONVERSATION_NOT_FOUND',
          message: 'Conversation not found',
        },
      });
    }

    const isParticipant = conversation.participants.some(
      (p) => p.userId._id.toString() === userId,
    );

    // console.log(isParticipant);
    // console.log(conversation.participants[0].userId._id.toString());
    // console.log(userId.toString());

    if (!isParticipant) {
      throw new ForbiddenException({
        success: false,
        error: {
          code: 'ACCESS_DENIED',
          message: 'You do not have access to this conversation',
        },
      });
    }

    // Mark messages as read
    const count = await this.chatRepository.markMessagesAsRead(
      conversationId,
      userId,
    );

    // Emit WebSocket event for read receipts
    this.chatGateway.emitMessagesRead(conversationId, userId);

    return {
      success: true,
      message: 'Conversation marked as read',
      data: {
        conversationId,
        readBy: userId,
        readAt: new Date().toISOString(),
        markedCount: count,
      },
    };
  }

  /**
   * Set conversation as read-only (called when order is delivered)
   */
  async setConversationReadOnly(orderId: string) {
    const conversation = await this.chatRepository.findByOrderId(orderId);
    if (conversation) {
      await this.chatRepository.updateConversationStatus(
        conversation._id.toString(),
        false,
      );

      // Emit WebSocket event to notify participants
      this.chatGateway.emitConversationReadOnly(conversation._id.toString());
    }
  }
}

import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Conversation,
  ConversationDocument,
  ConversationType,
} from './schemas/conversation.schema';
import { Message, MessageDocument } from './schemas/message.schema';
import { UserRole } from '../auth/schemas/user.schema';

export interface PaginationResult<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface CursorPaginationResult<T> {
  items: T[];
  cursor?: string; // ISO date string of last message createdAt
  hasMore: boolean;
}

@Injectable()
export class ChatRepository {
  private readonly logger = new Logger(ChatRepository.name);

  constructor(
    @InjectModel(Conversation.name)
    private conversationModel: Model<ConversationDocument>,
    @InjectModel(Message.name)
    private messageModel: Model<MessageDocument>,
  ) {}

  private validateObjectId(id: string, fieldName: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'INVALID_ID',
          message: `Invalid ${fieldName} format`,
        },
      });
    }
  }

  /**
   * Find or create an order conversation
   */
  async findOrCreateOrderConversation(
    orderId: string,
    customerId: string,
    riderId: string,
  ): Promise<ConversationDocument> {
    this.validateObjectId(orderId, 'orderId');
    this.validateObjectId(customerId, 'customerId');
    this.validateObjectId(riderId, 'riderId');

    // Try to find existing conversation
    const existing = await this.conversationModel
      .findOne({
        orderId: new Types.ObjectId(orderId),
        type: ConversationType.ORDER,
      })
      .exec();

    if (existing) {
      return existing;
    }

    // Create new conversation
    const conversation = new this.conversationModel({
      type: ConversationType.ORDER,
      orderId: new Types.ObjectId(orderId),
      participants: [
        { userId: new Types.ObjectId(customerId), role: UserRole.USER },
        { userId: new Types.ObjectId(riderId), role: UserRole.RIDER },
      ],
      isActive: true,
    });

    return conversation.save();
  }

  /**
   * Find conversation by ID
   */
  async findById(conversationId: string): Promise<ConversationDocument | null> {
    this.validateObjectId(conversationId, 'conversationId');
    return this.conversationModel
      .findById(conversationId)
      .populate('participants.userId', 'firstName lastName avatar')
      .exec();
  }

  /**
   * Find conversation by order ID
   */
  async findByOrderId(
    orderId: string,
  ): Promise<ConversationDocument | null> {
    this.validateObjectId(orderId, 'orderId');
    return this.conversationModel
      .findOne({
        orderId: new Types.ObjectId(orderId),
        type: ConversationType.ORDER,
      })
      .populate('participants.userId', 'firstName lastName avatar')
      .exec();
  }

  /**
   * Find conversations for a participant
   */
  async findByParticipant(
    userId: string,
    filter: {
      page?: number;
      limit?: number;
      type?: ConversationType;
    } = {},
  ): Promise<PaginationResult<ConversationDocument>> {
    this.validateObjectId(userId, 'userId');

    const page = filter.page || 1;
    const limit = filter.limit || 20;
    const skip = (page - 1) * limit;

    const query: Record<string, unknown> = {
      'participants.userId': new Types.ObjectId(userId),
    };

    if (filter.type) {
      query.type = filter.type;
    }

    const [conversations, total] = await Promise.all([
      this.conversationModel
        .find(query)
        .sort({ lastMessageAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('participants.userId', 'firstName lastName avatar')
        .populate('orderId', 'orderNumber status')
        .exec(),
      this.conversationModel.countDocuments(query).exec(),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      items: conversations,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Add a message and update conversation lastMessageAt
   */
  async addMessage(
    conversationId: string,
    messageData: {
      senderId: string;
      receiverId?: string;
      content: string;
      attachments?: Array<{ url: string; type: string; filename?: string }>;
    },
  ): Promise<MessageDocument> {
    this.validateObjectId(conversationId, 'conversationId');
    this.validateObjectId(messageData.senderId, 'senderId');

    const message = new this.messageModel({
      conversationId: new Types.ObjectId(conversationId),
      senderId: new Types.ObjectId(messageData.senderId),
      receiverId: messageData.receiverId
        ? new Types.ObjectId(messageData.receiverId)
        : undefined,
      content: messageData.content,
      attachments: messageData.attachments || [],
      isRead: false,
    });

    const savedMessage = await message.save();

    // Update conversation lastMessageAt
    await this.conversationModel
      .findByIdAndUpdate(conversationId, {
        $set: { lastMessageAt: new Date() },
      })
      .exec();

    return savedMessage;
  }

  /**
   * Get messages with cursor-based pagination
   * Returns messages in reverse chronological order (newest first)
   */
  async getMessages(
    conversationId: string,
    cursor?: string, // ISO date string
    limit: number = 50,
  ): Promise<CursorPaginationResult<MessageDocument>> {
    this.validateObjectId(conversationId, 'conversationId');

    const query: Record<string, unknown> = {
      conversationId: new Types.ObjectId(conversationId),
    };

    // If cursor provided, get messages before that date
    if (cursor) {
      const cursorDate = new Date(cursor);
      if (isNaN(cursorDate.getTime())) {
        throw new BadRequestException({
          success: false,
          error: {
            code: 'INVALID_CURSOR',
            message: 'Invalid cursor format. Expected ISO date string.',
          },
        });
      }
      query.createdAt = { $lt: cursorDate };
    }

    // Fetch limit + 1 to check if there are more messages
    const messages = await this.messageModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit + 1)
      .populate('senderId', 'firstName lastName avatar')
      .exec();

    const hasMore = messages.length > limit;
    const items = hasMore ? messages.slice(0, limit) : messages;

    // Get cursor from last message
    const newCursor =
      items.length > 0 ? items[items.length - 1].createdAt?.toISOString() : undefined;

    return {
      items,
      cursor: newCursor,
      hasMore,
    };
  }

  /**
   * Mark messages as read for a conversation
   */
  async markMessagesAsRead(
    conversationId: string,
    userId: string,
  ): Promise<number> {
    this.validateObjectId(conversationId, 'conversationId');
    this.validateObjectId(userId, 'userId');

    const result = await this.messageModel
      .updateMany(
        {
          conversationId: new Types.ObjectId(conversationId),
          senderId: { $ne: new Types.ObjectId(userId) }, // Not sent by this user
          isRead: false,
        },
        {
          $set: {
            isRead: true,
            readAt: new Date(),
          },
        },
      )
      .exec();

    return result.modifiedCount;
  }

  /**
   * Update conversation status (isActive)
   */
  async updateConversationStatus(
    conversationId: string,
    isActive: boolean,
  ): Promise<ConversationDocument | null> {
    this.validateObjectId(conversationId, 'conversationId');

    return this.conversationModel
      .findByIdAndUpdate(
        conversationId,
        { $set: { isActive } },
        { new: true },
      )
      .exec();
  }

  /**
   * Get unread message count for a conversation
   */
  async getUnreadCount(
    conversationId: string,
    userId: string,
  ): Promise<number> {
    this.validateObjectId(conversationId, 'conversationId');
    this.validateObjectId(userId, 'userId');

    return this.messageModel
      .countDocuments({
        conversationId: new Types.ObjectId(conversationId),
        senderId: { $ne: new Types.ObjectId(userId) },
        isRead: false,
      })
      .exec();
  }

  /**
   * Get message by ID with populated sender
   */
  async findMessageById(
    messageId: string,
  ): Promise<MessageDocument | null> {
    this.validateObjectId(messageId, 'messageId');
    return this.messageModel
      .findById(messageId)
      .populate('senderId', 'firstName lastName avatar')
      .exec();
  }
}

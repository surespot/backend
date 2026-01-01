import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Notification,
  NotificationDocument,
  NotificationType,
  NotificationChannel,
} from './schemas/notification.schema';

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

@Injectable()
export class NotificationsRepository {
  constructor(
    @InjectModel(Notification.name)
    private notificationModel: Model<NotificationDocument>,
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

  async create(data: {
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    data?: Record<string, unknown>;
    channels?: NotificationChannel[];
  }): Promise<NotificationDocument> {
    this.validateObjectId(data.userId, 'userId');

    const notification = new this.notificationModel({
      userId: new Types.ObjectId(data.userId),
      type: data.type,
      title: data.title,
      message: data.message,
      data: data.data,
      channels: data.channels || [NotificationChannel.IN_APP],
      isRead: false,
    });
    return notification.save();
  }

  async findById(id: string): Promise<NotificationDocument | null> {
    this.validateObjectId(id, 'notificationId');
    return this.notificationModel.findById(id).exec();
  }

  async findByUserId(
    userId: string,
    filter: {
      page?: number;
      limit?: number;
      isRead?: boolean;
      type?: NotificationType;
    },
  ): Promise<PaginationResult<NotificationDocument>> {
    this.validateObjectId(userId, 'userId');

    const page = filter.page || 1;
    const limit = filter.limit || 20;
    const skip = (page - 1) * limit;

    const query: Record<string, unknown> = {
      userId: new Types.ObjectId(userId),
    };

    if (filter.isRead !== undefined) {
      query.isRead = filter.isRead;
    }

    if (filter.type) {
      query.type = filter.type;
    }

    const [notifications, total] = await Promise.all([
      this.notificationModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.notificationModel.countDocuments(query).exec(),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      items: notifications,
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

  async countUnread(userId: string): Promise<number> {
    this.validateObjectId(userId, 'userId');
    return this.notificationModel
      .countDocuments({
        userId: new Types.ObjectId(userId),
        isRead: false,
      })
      .exec();
  }

  async markAsRead(id: string): Promise<NotificationDocument | null> {
    this.validateObjectId(id, 'notificationId');
    return this.notificationModel
      .findByIdAndUpdate(
        id,
        { $set: { isRead: true, readAt: new Date() } },
        { new: true },
      )
      .exec();
  }

  async markAllAsRead(userId: string): Promise<number> {
    this.validateObjectId(userId, 'userId');
    const result = await this.notificationModel
      .updateMany(
        { userId: new Types.ObjectId(userId), isRead: false },
        { $set: { isRead: true, readAt: new Date() } },
      )
      .exec();
    return result.modifiedCount;
  }

  async delete(id: string): Promise<boolean> {
    this.validateObjectId(id, 'notificationId');
    const result = await this.notificationModel
      .deleteOne({ _id: new Types.ObjectId(id) })
      .exec();
    return result.deletedCount > 0;
  }

  async deleteAllByUserId(userId: string): Promise<number> {
    this.validateObjectId(userId, 'userId');
    const result = await this.notificationModel
      .deleteMany({ userId: new Types.ObjectId(userId) })
      .exec();
    return result.deletedCount;
  }

  async updateSentStatus(
    id: string,
    channel: 'push' | 'sms' | 'email',
  ): Promise<NotificationDocument | null> {
    this.validateObjectId(id, 'notificationId');

    const updateField =
      channel === 'push'
        ? 'isPushSent'
        : channel === 'sms'
          ? 'isSmsSent'
          : 'isEmailSent';

    return this.notificationModel
      .findByIdAndUpdate(id, { $set: { [updateField]: true } }, { new: true })
      .exec();
  }

  async markEmailSent(id: string): Promise<NotificationDocument | null> {
    return this.updateSentStatus(id, 'email');
  }

  async findLatestByUserIdAndType(
    userId: string,
    type: NotificationType,
  ): Promise<NotificationDocument | null> {
    this.validateObjectId(userId, 'userId');
    return this.notificationModel
      .findOne({
        userId: new Types.ObjectId(userId),
        type,
      })
      .sort({ createdAt: -1 })
      .exec();
  }
}

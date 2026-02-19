import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  SupportRequest,
  SupportRequestDocument,
  SupportRequestStatus,
  SubmitterRole,
} from './schemas/support-request.schema';

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

export interface CreateSupportRequestData {
  submitterRole: SubmitterRole;
  userId: string;
  source: string;
  category: string;
  type: string;
  description: string;
  contactPhone: string;
  orderId?: string;
  title?: string;
  attachments?: string[];
  stepsToReproduce?: string;
  areaAffected?: string;
  issueType?: string;
}

@Injectable()
export class SupportRepository {
  constructor(
    @InjectModel(SupportRequest.name)
    private supportRequestModel: Model<SupportRequestDocument>,
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

  async create(data: CreateSupportRequestData): Promise<SupportRequestDocument> {
    this.validateObjectId(data.userId, 'userId');
    const doc: Record<string, unknown> = {
      submitterRole: data.submitterRole,
      userId: new Types.ObjectId(data.userId),
      source: data.source,
      category: data.category,
      type: data.type,
      description: data.description,
      contactPhone: data.contactPhone,
      status: SupportRequestStatus.PENDING,
      attachments: data.attachments ?? [],
    };
    if (data.orderId) {
      this.validateObjectId(data.orderId, 'orderId');
      doc.orderId = new Types.ObjectId(data.orderId);
    }
    if (data.title) doc.title = data.title;
    if (data.stepsToReproduce) doc.stepsToReproduce = data.stepsToReproduce;
    if (data.areaAffected) doc.areaAffected = data.areaAffected;
    if (data.issueType) doc.issueType = data.issueType;

    const request = new this.supportRequestModel(doc);
    return request.save();
  }

  async findByUserId(
    userId: string,
    filter: {
      page?: number;
      limit?: number;
      status?: SupportRequestStatus;
    },
  ): Promise<PaginationResult<SupportRequestDocument>> {
    this.validateObjectId(userId, 'userId');

    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const skip = (page - 1) * limit;

    const query: Record<string, unknown> = {
      userId: new Types.ObjectId(userId),
    };
    if (filter.status) {
      query.status = filter.status;
    }

    const [items, total] = await Promise.all([
      this.supportRequestModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.supportRequestModel.countDocuments(query).exec(),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      items,
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

  async findById(id: string): Promise<SupportRequestDocument | null> {
    this.validateObjectId(id, 'id');
    return this.supportRequestModel.findById(id).exec();
  }

  async findByIdForUser(
    id: string,
    userId: string,
  ): Promise<SupportRequestDocument | null> {
    this.validateObjectId(id, 'id');
    this.validateObjectId(userId, 'userId');
    return this.supportRequestModel
      .findOne({
        _id: new Types.ObjectId(id),
        userId: new Types.ObjectId(userId),
      })
      .exec();
  }

  async findAll(
    filter: {
      page?: number;
      limit?: number;
      submitterRole?: SubmitterRole;
      status?: SupportRequestStatus | SupportRequestStatus[];
    },
  ): Promise<PaginationResult<SupportRequestDocument>> {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const skip = (page - 1) * limit;

    const query: Record<string, unknown> = {};
    if (filter.submitterRole) query.submitterRole = filter.submitterRole;
    if (filter.status) {
      query.status = Array.isArray(filter.status)
        ? { $in: filter.status }
        : filter.status;
    }

    const [items, total] = await Promise.all([
      this.supportRequestModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'firstName lastName email phone')
        .exec(),
      this.supportRequestModel.countDocuments(query).exec(),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      items,
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

  async updateStatus(
    id: string,
    status: SupportRequestStatus,
  ): Promise<SupportRequestDocument | null> {
    this.validateObjectId(id, 'id');
    return this.supportRequestModel
      .findByIdAndUpdate(
        id,
        { $set: { status } },
        { new: true },
      )
      .populate('userId', 'firstName lastName email phone')
      .exec();
  }

  async findByIdWithPopulatedUser(id: string): Promise<SupportRequestDocument | null> {
    this.validateObjectId(id, 'id');
    return this.supportRequestModel
      .findById(id)
      .populate('userId', 'firstName lastName email phone')
      .populate('orderId')
      .exec();
  }
}

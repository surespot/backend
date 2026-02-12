import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Transaction,
  TransactionDocument,
  TransactionStatus,
  PaymentProvider,
  TransactionType,
} from './schemas/transaction.schema';

@Injectable()
export class TransactionsRepository {
  constructor(
    @InjectModel(Transaction.name)
    private transactionModel: Model<TransactionDocument>,
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
    orderId?: string;
    userId?: string;
    riderProfileId?: string;
    type?: TransactionType;
    amount: number;
    currency?: string;
    paymentMethod?: string;
    provider?: PaymentProvider;
    reference?: string;
    authorizationUrl?: string;
    accessCode?: string;
    status?: TransactionStatus;
    providerResponse?: Record<string, unknown>;
  }): Promise<TransactionDocument> {
    if (data.userId) {
      this.validateObjectId(data.userId, 'userId');
    }
    if (data.riderProfileId) {
      this.validateObjectId(data.riderProfileId, 'riderProfileId');
    }

    const transactionData: Record<string, unknown> = {
      amount: data.amount,
      currency: data.currency || 'NGN',
      paymentMethod: data.paymentMethod || 'wallet',
      provider: data.provider || PaymentProvider.PAYSTACK,
      type: data.type || TransactionType.PAYMENT,
      status: data.status ?? TransactionStatus.PENDING,
      reference: data.reference,
      authorizationUrl: data.authorizationUrl,
      accessCode: data.accessCode,
    };

    if (data.userId) {
      transactionData.userId = new Types.ObjectId(data.userId);
    }

    if (data.riderProfileId) {
      transactionData.riderProfileId = new Types.ObjectId(data.riderProfileId);
    }

    if (data.orderId) {
      this.validateObjectId(data.orderId, 'orderId');
      transactionData.orderId = new Types.ObjectId(data.orderId);
    }

    if (data.providerResponse) {
      transactionData.providerResponse = data.providerResponse;
    }

    const transaction = new this.transactionModel(transactionData);
    return transaction.save();
  }

  async findById(id: string): Promise<TransactionDocument | null> {
    this.validateObjectId(id, 'transactionId');
    return this.transactionModel.findById(id).exec();
  }

  async findByReference(
    reference: string,
  ): Promise<TransactionDocument | null> {
    return this.transactionModel.findOne({ reference }).exec();
  }

  async findByOrderId(orderId: string): Promise<TransactionDocument | null> {
    this.validateObjectId(orderId, 'orderId');
    return this.transactionModel
      .findOne({ orderId: new Types.ObjectId(orderId) })
      .exec();
  }

  async findByUserId(
    userId: string,
    limit: number = 20,
  ): Promise<TransactionDocument[]> {
    this.validateObjectId(userId, 'userId');
    return this.transactionModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
  }

  async findByRiderProfileId(
    riderProfileId: string,
    limit: number = 20,
  ): Promise<TransactionDocument[]> {
    this.validateObjectId(riderProfileId, 'riderProfileId');
    return this.transactionModel
      .find({ riderProfileId: new Types.ObjectId(riderProfileId) })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
  }

  async findByRiderProfileIdWithFilters(
    riderProfileId: string,
    options: {
      page?: number;
      limit?: number;
      type?: TransactionType;
      status?: TransactionStatus;
      startDate?: Date;
      endDate?: Date;
    } = {},
  ): Promise<{
    transactions: TransactionDocument[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    this.validateObjectId(riderProfileId, 'riderProfileId');

    const page = options.page || 1;
    const limit = options.limit || 20;
    const skip = (page - 1) * limit;

    // Build query
    const query: Record<string, any> = {
      riderProfileId: new Types.ObjectId(riderProfileId),
    };

    if (options.type) {
      query.type = options.type;
    }

    if (options.status) {
      query.status = options.status;
    }

    if (options.startDate || options.endDate) {
      query.createdAt = {};
      if (options.startDate) {
        query.createdAt.$gte = options.startDate;
      }
      if (options.endDate) {
        query.createdAt.$lte = options.endDate;
      }
    }

    // Get total count
    const total = await this.transactionModel.countDocuments(query).exec();

    // Get transactions
    const transactions = await this.transactionModel
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec();

    return {
      transactions,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getRiderTransactionStats(
    riderProfileId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<{
    totalEarnings: number;
    totalWithdrawals: number;
  }> {
    this.validateObjectId(riderProfileId, 'riderProfileId');

    const query: Record<string, any> = {
      riderProfileId: new Types.ObjectId(riderProfileId),
    };

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = startDate;
      }
      if (endDate) {
        query.createdAt.$lte = endDate;
      }
    }

    // Get total earnings (successful rider_earning transactions)
    const earningsResult = await this.transactionModel
      .aggregate([
        {
          $match: {
            ...query,
            type: TransactionType.RIDER_EARNING,
            status: TransactionStatus.SUCCESS,
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$amount' },
          },
        },
      ])
      .exec();

    // Get total withdrawals (all rider_withdrawal transactions, regardless of status)
    const withdrawalsResult = await this.transactionModel
      .aggregate([
        {
          $match: {
            ...query,
            type: TransactionType.RIDER_WITHDRAWAL,
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$amount' },
          },
        },
      ])
      .exec();

    return {
      totalEarnings: earningsResult[0]?.total || 0,
      totalWithdrawals: withdrawalsResult[0]?.total || 0,
    };
  }

  async updateStatus(
    id: string,
    status: TransactionStatus,
    data?: {
      providerResponse?: Record<string, unknown>;
      failureReason?: string;
      paidAt?: Date;
      refundedAt?: Date;
    },
  ): Promise<TransactionDocument | null> {
    this.validateObjectId(id, 'transactionId');

    const updateData: Record<string, unknown> = { status };

    if (data?.providerResponse)
      updateData.providerResponse = data.providerResponse;
    if (data?.failureReason) updateData.failureReason = data.failureReason;
    if (data?.paidAt) updateData.paidAt = data.paidAt;
    if (data?.refundedAt) updateData.refundedAt = data.refundedAt;

    return this.transactionModel
      .findByIdAndUpdate(id, { $set: updateData }, { new: true })
      .exec();
  }

  async updateByReference(
    reference: string,
    status: TransactionStatus,
    data?: {
      providerResponse?: Record<string, unknown>;
      failureReason?: string;
      paidAt?: Date;
      refundedAt?: Date;
    },
  ): Promise<TransactionDocument | null> {
    const updateData: Record<string, unknown> = { status };

    if (data?.providerResponse)
      updateData.providerResponse = data.providerResponse;
    if (data?.failureReason) updateData.failureReason = data.failureReason;
    if (data?.paidAt) updateData.paidAt = data.paidAt;
    if (data?.refundedAt) updateData.refundedAt = data.refundedAt;

    return this.transactionModel
      .findOneAndUpdate({ reference }, { $set: updateData }, { new: true })
      .exec();
  }
}

import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Transaction,
  TransactionDocument,
  TransactionStatus,
  PaymentProvider,
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
    userId: string;
    amount: number;
    currency?: string;
    paymentMethod: string;
    provider?: PaymentProvider;
    reference?: string;
    authorizationUrl?: string;
    accessCode?: string;
  }): Promise<TransactionDocument> {
    this.validateObjectId(data.userId, 'userId');

    const transactionData: Record<string, unknown> = {
      userId: new Types.ObjectId(data.userId),
      amount: data.amount,
      currency: data.currency || 'NGN',
      paymentMethod: data.paymentMethod,
      provider: data.provider || PaymentProvider.PAYSTACK,
      status: TransactionStatus.PENDING,
      reference: data.reference,
      authorizationUrl: data.authorizationUrl,
      accessCode: data.accessCode,
    };

    if (data.orderId) {
      this.validateObjectId(data.orderId, 'orderId');
      transactionData.orderId = new Types.ObjectId(data.orderId);
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

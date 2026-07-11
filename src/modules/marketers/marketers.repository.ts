import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Marketer, MarketerDocument } from './schemas/marketer.schema';
import { MarketerCodeUsage, MarketerCodeUsageDocument } from './schemas/marketer-code-usage.schema';

@Injectable()
export class MarketersRepository {
  constructor(
    @InjectModel(Marketer.name)
    private readonly marketerModel: Model<MarketerDocument>,
    @InjectModel(MarketerCodeUsage.name)
    private readonly usageModel: Model<MarketerCodeUsageDocument>,
  ) {}

  private validateObjectId(id: string, field: string): void {
    if (!id || !Types.ObjectId.isValid(id)) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'INVALID_ID_FORMAT',
          message: `Invalid ${field} format. Must be a valid MongoDB ObjectId.`,
        },
      });
    }
  }

  async create(data: Partial<Marketer>): Promise<MarketerDocument> {
    const marketer = new this.marketerModel(data);
    return marketer.save();
  }

  async findById(id: string): Promise<MarketerDocument | null> {
    this.validateObjectId(id, 'marketerId');
    return this.marketerModel.findById(id).exec();
  }

  async findAll(): Promise<MarketerDocument[]> {
    return this.marketerModel
      .find()
      .sort({ totalUses: -1, createdAt: -1 })
      .exec();
  }

  async findByCode(code: string): Promise<MarketerDocument | null> {
    return this.marketerModel
      .findOne({ code: { $regex: new RegExp(`^${code}$`, 'i') } })
      .exec();
  }

  async codeExists(code: string): Promise<boolean> {
    const count = await this.marketerModel
      .countDocuments({ code: { $regex: new RegExp(`^${code}$`, 'i') } })
      .exec();
    return count > 0;
  }

  async update(id: string, data: Partial<Marketer>): Promise<MarketerDocument | null> {
    this.validateObjectId(id, 'marketerId');
    return this.marketerModel
      .findByIdAndUpdate(id, data, { new: true })
      .exec();
  }

  async delete(id: string): Promise<boolean> {
    this.validateObjectId(id, 'marketerId');
    const result = await this.marketerModel.deleteOne({ _id: new Types.ObjectId(id) });
    return result.deletedCount > 0;
  }

  async incrementStats(marketerId: string, orderAmount: number): Promise<void> {
    this.validateObjectId(marketerId, 'marketerId');
    await this.marketerModel
      .findByIdAndUpdate(marketerId, {
        $inc: { totalUses: 1, totalOrderValue: orderAmount },
      })
      .exec();
  }

  async findUsage(marketerId: string, userId: string): Promise<MarketerCodeUsageDocument | null> {
    return this.usageModel
      .findOne({
        marketerId: new Types.ObjectId(marketerId),
        userId: new Types.ObjectId(userId),
      })
      .exec();
  }

  async createUsage(data: {
    marketerId: string;
    userId: string;
    orderId: string;
    orderAmount: number;
    discountAmount: number;
  }): Promise<MarketerCodeUsageDocument> {
    const usage = new this.usageModel({
      marketerId: new Types.ObjectId(data.marketerId),
      userId: new Types.ObjectId(data.userId),
      orderId: new Types.ObjectId(data.orderId),
      orderAmount: data.orderAmount,
      discountAmount: data.discountAmount,
      usedAt: new Date(),
    });
    return usage.save();
  }
}

import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Promotion, PromotionDocument } from './schemas/promotion.schema';
import { PromotionStatus } from './types';

@Injectable()
export class PromotionsRepository {
  constructor(
    @InjectModel(Promotion.name)
    private readonly promotionModel: Model<PromotionDocument>,
  ) {}

  private validateObjectId(id: string, fieldName: string): void {
    if (!id || !Types.ObjectId.isValid(id)) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'INVALID_ID_FORMAT',
          message: `Invalid ${fieldName} format. Must be a valid MongoDB ObjectId.`,
        },
      });
    }
  }

  async create(data: {
    imageUrl: string;
    name: string;
    activeFrom: Date;
    activeTo: Date;
    status: PromotionStatus;
    linkTo: string;
    discountCode?: string;
  }): Promise<PromotionDocument> {
    const promotion = new this.promotionModel(data);
    return promotion.save();
  }

  async findById(id: string): Promise<PromotionDocument | null> {
    this.validateObjectId(id, 'promotionId');
    return this.promotionModel.findById(id).exec();
  }

  async findAll(filter: {
    from?: Date;
    to?: Date;
  }): Promise<PromotionDocument[]> {
    const query: { activeFrom?: { $gte?: Date; $lte?: Date } } = {};

    if (filter.from || filter.to) {
      query.activeFrom = {};
      if (filter.from) {
        query.activeFrom.$gte = filter.from;
      }
      if (filter.to) {
        query.activeFrom.$lte = filter.to;
      }
    }

    return this.promotionModel
      .find(query)
      .sort({ activeFrom: -1, createdAt: -1 })
      .exec();
  }

  async findActive(now: Date): Promise<PromotionDocument[]> {
    return this.promotionModel
      .find({
        status: 'active',
        activeFrom: { $lte: now },
        activeTo: { $gte: now },
      })
      .sort({ activeFrom: 1 })
      .exec();
  }

  async update(
    id: string,
    data: Partial<{
      imageUrl: string;
      name: string;
      activeFrom: Date;
      activeTo: Date;
      status: PromotionStatus;
      linkTo: string;
      discountCode?: string;
    }>,
  ): Promise<PromotionDocument | null> {
    this.validateObjectId(id, 'promotionId');
    return this.promotionModel
      .findByIdAndUpdate(id, data, { new: true })
      .exec();
  }

  async delete(id: string): Promise<boolean> {
    this.validateObjectId(id, 'promotionId');
    const result = await this.promotionModel.deleteOne({
      _id: new Types.ObjectId(id),
    });
    return result.deletedCount > 0;
  }

  async autoActivate(now: Date): Promise<number> {
    const result = await this.promotionModel.updateMany(
      {
        status: 'inactive',
        activeFrom: { $lte: now },
        activeTo: { $gt: now },
      },
      { status: 'active' },
    );
    return result.modifiedCount ?? 0;
  }

  async autoEnd(now: Date): Promise<number> {
    const result = await this.promotionModel.updateMany(
      {
        status: 'active',
        activeTo: { $lte: now },
      },
      { status: 'ended' },
    );
    return result.modifiedCount ?? 0;
  }
}

import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Region, RegionDocument } from './schemas/region.schema';

@Injectable()
export class RegionsRepository {
  constructor(
    @InjectModel(Region.name)
    private regionModel: Model<RegionDocument>,
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
    name: string;
    description?: string;
    isActive?: boolean;
  }): Promise<RegionDocument> {
    const region = new this.regionModel({
      name: data.name,
      description: data.description,
      isActive: data.isActive ?? true,
    });
    return region.save();
  }

  async findAll(): Promise<RegionDocument[]> {
    return this.regionModel.find().sort({ name: 1 }).exec();
  }

  async findById(id: string): Promise<RegionDocument | null> {
    this.validateObjectId(id, 'regionId');
    return this.regionModel.findById(id).exec();
  }

  async findByName(name: string): Promise<RegionDocument | null> {
    return this.regionModel.findOne({ name }).exec();
  }

  async update(
    id: string,
    data: {
      name?: string;
      description?: string;
      isActive?: boolean;
    },
  ): Promise<RegionDocument | null> {
    this.validateObjectId(id, 'regionId');
    return this.regionModel
      .findByIdAndUpdate(id, { $set: data }, { new: true })
      .exec();
  }

  async delete(id: string): Promise<boolean> {
    this.validateObjectId(id, 'regionId');
    const result = await this.regionModel.findByIdAndDelete(id).exec();
    return !!result;
  }
}

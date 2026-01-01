import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  PickupLocation,
  PickupLocationDocument,
} from './schemas/pickup-location.schema';

@Injectable()
export class PickupLocationsRepository {
  constructor(
    @InjectModel(PickupLocation.name)
    private pickupLocationModel: Model<PickupLocationDocument>,
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
    address: string;
    latitude: number;
    longitude: number;
    regionId: string;
    isActive?: boolean;
  }): Promise<PickupLocationDocument> {
    this.validateObjectId(data.regionId, 'regionId');
    const pickupLocation = new this.pickupLocationModel({
      name: data.name,
      address: data.address,
      location: {
        type: 'Point',
        coordinates: [data.longitude, data.latitude], // GeoJSON: [lng, lat]
      },
      regionId: new Types.ObjectId(data.regionId),
      isActive: data.isActive ?? true,
    });
    return pickupLocation.save();
  }

  async findAll(): Promise<PickupLocationDocument[]> {
    return this.pickupLocationModel
      .find()
      .populate('regionId', 'name')
      .sort({ name: 1 })
      .exec();
  }

  async findById(id: string): Promise<PickupLocationDocument | null> {
    this.validateObjectId(id, 'pickupLocationId');
    return this.pickupLocationModel
      .findById(id)
      .populate('regionId', 'name')
      .exec();
  }

  async findNearest(
    latitude: number,
    longitude: number,
    maxDistance?: number,
  ): Promise<PickupLocationDocument | null> {
    const location = {
      type: 'Point' as const,
      coordinates: [longitude, latitude], // GeoJSON: [lng, lat]
    };

    const query = this.pickupLocationModel
      .findOne({
        location: {
          $near: {
            $geometry: location,
            $maxDistance: maxDistance ?? 50000, // Default 50km in meters
          },
        },
        isActive: true,
      })
      .populate('regionId', 'name');

    return query.exec();
  }

  async update(
    id: string,
    data: {
      name?: string;
      address?: string;
      latitude?: number;
      longitude?: number;
      regionId?: string;
      isActive?: boolean;
    },
  ): Promise<PickupLocationDocument | null> {
    this.validateObjectId(id, 'pickupLocationId');

    const updateData: any = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.address !== undefined) updateData.address = data.address;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.regionId !== undefined) {
      this.validateObjectId(data.regionId, 'regionId');
      updateData.regionId = new Types.ObjectId(data.regionId);
    }

    // Update location if coordinates provided
    if (data.latitude !== undefined && data.longitude !== undefined) {
      updateData.location = {
        type: 'Point',
        coordinates: [data.longitude, data.latitude], // GeoJSON: [lng, lat]
      };
    }

    return this.pickupLocationModel
      .findByIdAndUpdate(id, { $set: updateData }, { new: true })
      .populate('regionId', 'name')
      .exec();
  }

  async delete(id: string): Promise<boolean> {
    this.validateObjectId(id, 'pickupLocationId');
    const result = await this.pickupLocationModel.findByIdAndDelete(id).exec();
    return !!result;
  }
}

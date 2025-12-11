import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  SavedLocation,
  SavedLocationDocument,
} from './schemas/saved-location.schema';

@Injectable()
export class SavedLocationsRepository {
  constructor(
    @InjectModel(SavedLocation.name)
    private savedLocationModel: Model<SavedLocationDocument>,
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

  async create(
    userId: string,
    data: {
      label: string;
      streetAddress: string;
      latitude: number;
      longitude: number;
      state?: string;
      country: string;
      regionId?: string;
    },
  ): Promise<SavedLocationDocument> {
    this.validateObjectId(userId, 'userId');
    const savedLocation = new this.savedLocationModel({
      userId: new Types.ObjectId(userId),
      label: data.label,
      streetAddress: data.streetAddress,
      location: {
        type: 'Point',
        coordinates: [data.longitude, data.latitude], // GeoJSON: [lng, lat]
      },
      state: data.state,
      country: data.country,
      regionId: data.regionId,
    });
    return savedLocation.save();
  }

  async findAllByUserId(userId: string): Promise<SavedLocationDocument[]> {
    this.validateObjectId(userId, 'userId');
    return this.savedLocationModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findById(
    locationId: string,
    userId: string,
  ): Promise<SavedLocationDocument | null> {
    this.validateObjectId(locationId, 'locationId');
    this.validateObjectId(userId, 'userId');
    return this.savedLocationModel
      .findOne({
        _id: new Types.ObjectId(locationId),
        userId: new Types.ObjectId(userId),
      })
      .exec();
  }

  async update(
    locationId: string,
    userId: string,
    data: {
      label?: string;
      streetAddress?: string;
      latitude?: number;
      longitude?: number;
      state?: string;
      country?: string;
      regionId?: string;
    },
  ): Promise<SavedLocationDocument | null> {
    this.validateObjectId(locationId, 'locationId');
    this.validateObjectId(userId, 'userId');

    const updateData: {
      label?: string;
      streetAddress?: string;
      state?: string;
      country?: string;
      regionId?: string;
      location?: {
        type: 'Point';
        coordinates: [number, number];
      };
    } = {
      ...(data.label !== undefined && { label: data.label }),
      ...(data.streetAddress !== undefined && {
        streetAddress: data.streetAddress,
      }),
      ...(data.state !== undefined && { state: data.state }),
      ...(data.country !== undefined && { country: data.country }),
      ...(data.regionId !== undefined && { regionId: data.regionId }),
    };

    // If coordinates are being updated, update the location GeoJSON
    if (data.latitude !== undefined || data.longitude !== undefined) {
      const existing = await this.findById(locationId, userId);
      if (!existing) return null;

      const latitude = data.latitude ?? existing.location.coordinates[1];
      const longitude = data.longitude ?? existing.location.coordinates[0];

      updateData.location = {
        type: 'Point',
        coordinates: [longitude, latitude], // GeoJSON: [lng, lat]
      };
    }

    return this.savedLocationModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(locationId),
          userId: new Types.ObjectId(userId),
        },
        updateData,
        { new: true },
      )
      .exec();
  }

  async delete(locationId: string, userId: string): Promise<boolean> {
    this.validateObjectId(locationId, 'locationId');
    this.validateObjectId(userId, 'userId');
    const result = await this.savedLocationModel
      .deleteOne({
        _id: new Types.ObjectId(locationId),
        userId: new Types.ObjectId(userId),
      })
      .exec();
    return result.deletedCount > 0;
  }

  async findByLabel(
    userId: string,
    label: string,
  ): Promise<SavedLocationDocument | null> {
    this.validateObjectId(userId, 'userId');
    return this.savedLocationModel
      .findOne({
        userId: new Types.ObjectId(userId),
        label,
      })
      .exec();
  }
}

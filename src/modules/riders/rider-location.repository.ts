import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  RiderLocation,
  RiderLocationDocument,
} from './schemas/rider-location.schema';

@Injectable()
export class RiderLocationRepository {
  constructor(
    @InjectModel(RiderLocation.name)
    private riderLocationModel: Model<RiderLocationDocument>,
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

  async createOrUpdate(
    riderProfileId: string,
    data: {
      streetAddress: string;
      latitude: number;
      longitude: number;
      state?: string;
      country: string;
      regionId?: string;
    },
  ): Promise<RiderLocationDocument> {
    this.validateObjectId(riderProfileId, 'riderProfileId');

    const location = {
      type: 'Point' as const,
      coordinates: [data.longitude, data.latitude], // GeoJSON: [lng, lat]
    };

    return this.riderLocationModel
      .findOneAndUpdate(
        { riderProfileId: new Types.ObjectId(riderProfileId) },
        {
          riderProfileId: new Types.ObjectId(riderProfileId),
          streetAddress: data.streetAddress,
          location,
          state: data.state,
          country: data.country,
          regionId: data.regionId,
          lastUpdated: new Date(),
        },
        { upsert: true, new: true },
      )
      .exec();
  }

  async findByRiderProfileId(
    riderProfileId: string,
  ): Promise<RiderLocationDocument | null> {
    this.validateObjectId(riderProfileId, 'riderProfileId');
    return this.riderLocationModel
      .findOne({ riderProfileId: new Types.ObjectId(riderProfileId) })
      .exec();
  }

  /**
   * Find riders within maxDistance (in meters) of a given point
   * Uses $geoWithin with $centerSphere for radius-based queries
   */
  async findNearby(
    latitude: number,
    longitude: number,
    maxDistance: number, // in meters
    riderProfileIds?: Types.ObjectId[], // Optional filter by specific riders
  ): Promise<RiderLocationDocument[]> {
    // Convert meters to radians for $centerSphere
    // Earth's radius in meters: 6378100
    const radiusInRadians = maxDistance / 6378100;

    const query: any = {
      location: {
        $geoWithin: {
          $centerSphere: [[longitude, latitude], radiusInRadians],
        },
      },
    };

    // Filter by specific rider profiles if provided
    if (riderProfileIds && riderProfileIds.length > 0) {
      query.riderProfileId = { $in: riderProfileIds };
    }

    return this.riderLocationModel.find(query).exec();
  }

  /**
   * Find riders within maxDistance of multiple points (intersection)
   * Returns riders that are within maxDistance of ALL specified points
   */
  async findNearbyMultiplePoints(
    points: Array<{ latitude: number; longitude: number }>,
    maxDistance: number, // in meters
    riderProfileIds?: Types.ObjectId[], // Optional filter by specific riders
  ): Promise<RiderLocationDocument[]> {
    if (points.length === 0) {
      return [];
    }

    // For each point, find riders within maxDistance
    const promises = points.map((point) =>
      this.findNearby(
        point.latitude,
        point.longitude,
        maxDistance,
        riderProfileIds,
      ),
    );

    const results = await Promise.all(promises);

    // Find intersection: riders that appear in all results
    if (results.length === 0) {
      return [];
    }

    // Start with the first result
    let intersection = new Map<string, RiderLocationDocument>();
    results[0].forEach((doc) => {
      intersection.set(doc.riderProfileId.toString(), doc);
    });

    // Intersect with remaining results
    for (let i = 1; i < results.length; i++) {
      const currentSet = new Set(
        results[i].map((doc) => doc.riderProfileId.toString()),
      );
      const newIntersection = new Map<string, RiderLocationDocument>();

      intersection.forEach((doc, riderId) => {
        if (currentSet.has(riderId)) {
          newIntersection.set(riderId, doc);
        }
      });

      intersection = newIntersection;
    }

    return Array.from(intersection.values());
  }

  async delete(riderProfileId: string): Promise<boolean> {
    this.validateObjectId(riderProfileId, 'riderProfileId');
    const result = await this.riderLocationModel
      .deleteOne({ riderProfileId: new Types.ObjectId(riderProfileId) })
      .exec();
    return result.deletedCount > 0;
  }
}

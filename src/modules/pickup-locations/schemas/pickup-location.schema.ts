import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PickupLocationDocument = HydratedDocument<PickupLocation>;

/** `regionId` after `.populate('regionId', ...)` (see repository queries). */
export type PopulatedRegionRef = {
  _id: Types.ObjectId;
  name?: string;
};

export type RegionIdField = Types.ObjectId | PopulatedRegionRef;

export function isPopulatedRegionId(
  ref: RegionIdField,
): ref is PopulatedRegionRef {
  if (ref === null || typeof ref !== 'object') {
    return false;
  }
  if (!('_id' in ref)) {
    return false;
  }
  return (ref as { _id: unknown })._id instanceof Types.ObjectId;
}

@Schema({ timestamps: true })
export class PickupLocation {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  address: string;

  @Prop({
    type: {
      type: String,
      enum: ['Point'],
      required: true,
    },
    coordinates: {
      type: [Number], // [longitude, latitude] - GeoJSON format
      required: true,
    },
  })
  location: {
    type: 'Point';
    coordinates: [number, number]; // [lng, lat]
  };

  @Prop({ type: Types.ObjectId, ref: 'Region', required: true, index: true })
  regionId: Types.ObjectId;

  @Prop({ required: true, default: true, index: true })
  isActive: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export const PickupLocationSchema =
  SchemaFactory.createForClass(PickupLocation);

// Create 2dsphere index for geospatial queries
PickupLocationSchema.index({ location: '2dsphere' });
PickupLocationSchema.index({ regionId: 1, isActive: 1 });

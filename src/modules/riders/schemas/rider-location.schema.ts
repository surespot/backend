import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type RiderLocationDocument = HydratedDocument<RiderLocation>;

@Schema({ timestamps: true })
export class RiderLocation {
  @Prop({
    type: Types.ObjectId,
    ref: 'RiderProfile',
    required: true,
    unique: true,
    index: true,
  })
  riderProfileId: Types.ObjectId;

  @Prop({ required: true })
  streetAddress: string;

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

  @Prop({ required: false })
  state?: string;

  @Prop({ required: true })
  country: string;

  @Prop({ required: false, type: String })
  regionId?: string;

  @Prop({ type: Date, default: Date.now, index: true })
  lastUpdated: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const RiderLocationSchema = SchemaFactory.createForClass(RiderLocation);

// Create 2dsphere index for geospatial queries
RiderLocationSchema.index({ location: '2dsphere' });
RiderLocationSchema.index({ riderProfileId: 1 }, { unique: true });
RiderLocationSchema.index({ lastUpdated: 1 }); // For finding recently updated locations

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type SavedLocationDocument = HydratedDocument<SavedLocation>;

@Schema({ timestamps: true })
export class SavedLocation {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  label: string; // e.g., "Home", "Work"

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

  @Prop({ default: false, index: true })
  isActive: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export const SavedLocationSchema = SchemaFactory.createForClass(SavedLocation);

// Create 2dsphere index for geospatial queries
SavedLocationSchema.index({ location: '2dsphere' });
SavedLocationSchema.index({ userId: 1, label: 1 }, { unique: true });
// Index for finding active location efficiently
SavedLocationSchema.index({ userId: 1, isActive: 1 });
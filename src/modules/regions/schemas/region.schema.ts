import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type RegionDocument = HydratedDocument<Region>;

@Schema({ timestamps: true })
export class Region {
  @Prop({ required: true, unique: true, index: true })
  name: string;

  @Prop()
  description?: string;

  @Prop({ required: true, default: true, index: true })
  isActive: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export const RegionSchema = SchemaFactory.createForClass(Region);

// Indexes
RegionSchema.index({ name: 1 }, { unique: true });
RegionSchema.index({ isActive: 1 });

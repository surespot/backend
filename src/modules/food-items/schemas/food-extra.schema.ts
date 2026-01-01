import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type FoodExtraDocument = HydratedDocument<FoodExtra>;

@Schema({ timestamps: true })
export class FoodExtra {
  @Prop({ required: true })
  name: string;

  @Prop()
  description?: string;

  @Prop({ required: true })
  price: number; // Price in kobo (smallest currency unit)

  @Prop({ required: true, default: 'NGN' })
  currency: string;

  @Prop({ required: true, default: true, index: true })
  isAvailable: boolean;

  @Prop({ index: true })
  category?: string; // e.g., "Protein", "Sauce", "Drinks"

  @Prop({ default: 0 })
  sortOrder?: number;

  @Prop({ default: true })
  isActive: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export const FoodExtraSchema = SchemaFactory.createForClass(FoodExtra);

// Indexes
FoodExtraSchema.index({ isAvailable: 1, isActive: 1 });
FoodExtraSchema.index({ category: 1, isAvailable: 1 });

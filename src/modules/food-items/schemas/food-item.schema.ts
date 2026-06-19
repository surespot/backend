import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type FoodItemDocument = HydratedDocument<FoodItem>;

export enum FoodCategory {
  FOOD = 'Food',
  PROTEIN = 'Protein',
  SIDE_MEAL = 'Side Meal',
  DRINKS = 'Drinks',
  ECONOMY = 'Economy',
}

@Schema({ timestamps: true })
export class FoodItem {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  description: string;

  @Prop({ required: true, unique: true })
  slug: string;

  @Prop({ required: true })
  price: number; // Price in kobo (smallest currency unit)

  @Prop({ required: true, default: 'NGN' })
  currency: string;

  @Prop({ required: true })
  imageUrl: string;

  @Prop({ type: [String], default: [] })
  imageUrls: string[];

  @Prop({
    required: true,
    type: String,
    enum: Object.values(FoodCategory),
    index: true,
  })
  category: FoodCategory;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ default: 0, min: 0, max: 5 })
  averageRating: number;

  @Prop({ default: 0, min: 0 })
  ratingCount: number;

  @Prop({
    type: {
      min: { type: Number, required: true },
      max: { type: Number, required: true },
    },
    required: true,
  })
  estimatedTime: {
    min: number;
    max: number;
  };

  @Prop({ required: true, default: true, index: true })
  isAvailable: boolean;

  @Prop({ required: true, default: true })
  isActive: boolean;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'FoodExtra' }], default: [] })
  extras: Types.ObjectId[];

  @Prop({ default: 0 })
  viewCount: number;

  @Prop({ default: 0 })
  orderCount: number;

  @Prop({ default: false, index: true })
  isPopular: boolean;

  @Prop({ default: 0 })
  sortOrder: number;

  createdAt?: Date;
  updatedAt?: Date;
}

export const FoodItemSchema = SchemaFactory.createForClass(FoodItem);

// Indexes for performance
FoodItemSchema.index({ category: 1, isActive: 1, isAvailable: 1 });
FoodItemSchema.index({ isPopular: 1, orderCount: -1 });
FoodItemSchema.index({ slug: 1 }, { unique: true });
FoodItemSchema.index({ name: 'text', description: 'text' });
FoodItemSchema.index({ tags: 1 });

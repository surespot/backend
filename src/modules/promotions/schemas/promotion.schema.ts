import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type { PromotionStatus, DiscountType } from '../types';

export type PromotionDocument = HydratedDocument<Promotion>;

@Schema({ timestamps: true })
export class Promotion {
  @Prop({ required: true })
  imageUrl: string;

  @Prop({ required: true, index: true })
  name: string;

  @Prop({ type: Date, required: true })
  activeFrom: Date;

  @Prop({ type: Date, required: true })
  activeTo: Date;

  @Prop({
    type: String,
    enum: ['inactive', 'active', 'ended'],
    default: 'inactive',
    index: true,
  })
  status: PromotionStatus;

  @Prop({ required: true })
  linkTo: string;

  @Prop()
  discountCode?: string;

  @Prop({
    type: String,
    enum: ['percentage', 'fixed_amount'],
  })
  discountType?: DiscountType;

  @Prop({ type: Number, min: 0 })
  discountValue?: number; // Percentage (0-100) or fixed amount in kobo

  @Prop({ type: Number, min: 0 })
  minOrderAmount?: number; // Minimum order amount in kobo to qualify

  @Prop({ type: Number, min: 0 })
  maxDiscountAmount?: number; // Maximum discount amount in kobo (for percentage discounts)

  @Prop({ type: Number, min: 0, default: 0 })
  usageCount: number; // Number of times this promo code has been used

  createdAt?: Date;
  updatedAt?: Date;
}

export const PromotionSchema = SchemaFactory.createForClass(Promotion);

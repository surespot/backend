import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import type { DiscountType } from '../../promotions/types';
import { FoodCategory } from '../../food-items/schemas/food-item.schema';

export type MarketerDocument = HydratedDocument<Marketer>;

@Schema({ timestamps: true })
export class Marketer {
  _id: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  email: string;

  @Prop({ required: true })
  profilePictureUrl: string;

  @Prop({ default: true, index: true })
  isActive: boolean;

  @Prop({ required: true, unique: true, index: true })
  code: string;

  @Prop({
    type: String,
    enum: ['percentage', 'fixed_amount', 'free_delivery', 'free_category', 'bogo'],
    required: true,
  })
  discountType: DiscountType;

  @Prop({ type: Number, min: 0 })
  discountValue?: number;

  @Prop({ type: Number, min: 0 })
  minOrderAmount?: number;

  @Prop({ type: Number, min: 0 })
  maxDiscountAmount?: number;

  @Prop({ type: String, enum: Object.values(FoodCategory) })
  targetCategory?: string;

  @Prop({ type: [Types.ObjectId], ref: 'FoodItem' })
  targetFoodItemIds?: Types.ObjectId[];

  @Prop({ type: Number, min: 0 })
  maxFreeQuantity?: number;

  @Prop({ type: Number, min: 1 })
  buyQuantity?: number;

  @Prop({ type: Number, min: 1 })
  getFreeQuantity?: number;

  @Prop({ type: Number, min: 0 })
  maxRedeemablePerOrder?: number;

  @Prop()
  accountNumber?: string;

  @Prop()
  bankCode?: string;

  @Prop()
  bankName?: string;

  @Prop()
  accountName?: string;

  @Prop({ type: Number, default: 0, min: 0 })
  totalUses: number;

  @Prop({ type: Number, default: 0, min: 0 })
  totalOrderValue: number;

  createdAt?: Date;
  updatedAt?: Date;
}

export const MarketerSchema = SchemaFactory.createForClass(Marketer);

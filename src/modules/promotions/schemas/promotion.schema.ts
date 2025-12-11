import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type { PromotionStatus } from '../types';

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

  createdAt?: Date;
  updatedAt?: Date;
}

export const PromotionSchema = SchemaFactory.createForClass(Promotion);

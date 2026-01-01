import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type OrderExtraDocument = HydratedDocument<OrderExtra>;

@Schema({ timestamps: true })
export class OrderExtra {
  @Prop({ type: Types.ObjectId, ref: 'OrderItem', required: true })
  orderItemId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'FoodExtra', required: true })
  foodExtraId: Types.ObjectId;

  // Snapshot of extra details at time of order
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, min: 0 })
  price: number; // Price in kobo at time of order

  @Prop({ required: true, default: 'NGN' })
  currency: string;

  @Prop({ required: true, min: 1, default: 1 })
  quantity: number;

  createdAt?: Date;
  updatedAt?: Date;
}

export const OrderExtraSchema = SchemaFactory.createForClass(OrderExtra);

// Indexes
OrderExtraSchema.index({ orderItemId: 1 });

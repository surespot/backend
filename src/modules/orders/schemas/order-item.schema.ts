import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type OrderItemDocument = HydratedDocument<OrderItem>;

@Schema({ timestamps: true })
export class OrderItem {
  @Prop({ type: Types.ObjectId, ref: 'Order', required: true })
  orderId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'FoodItem', required: true })
  foodItemId: Types.ObjectId;

  // Snapshot of food item details at time of order
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  description: string;

  @Prop({ required: true })
  slug: string;

  @Prop({ required: true, min: 0 })
  price: number; // Price in kobo at time of order

  @Prop({ required: true, default: 'NGN' })
  currency: string;

  @Prop({ required: true })
  imageUrl: string;

  @Prop({ required: true, min: 1 })
  quantity: number;

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

  @Prop({ type: Number, default: 0, min: 0 })
  lineTotal: number; // (price * quantity) + extras total (in kobo)

  createdAt?: Date;
  updatedAt?: Date;
}

export const OrderItemSchema = SchemaFactory.createForClass(OrderItem);

// Indexes
OrderItemSchema.index({ orderId: 1 });

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ReviewDocument = HydratedDocument<Review>;

@Schema({ timestamps: true })
export class Review {
  @Prop({ type: Types.ObjectId, ref: 'FoodItem', required: true, index: true })
  foodItemId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, min: 1, max: 5 })
  rating: number;

  @Prop({ maxlength: 500 })
  comment?: string;

  @Prop({ type: Types.ObjectId, ref: 'Order' })
  orderId?: Types.ObjectId;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ReviewSchema = SchemaFactory.createForClass(Review);

// Compound unique index: one review per user per food item
ReviewSchema.index({ foodItemId: 1, userId: 1 }, { unique: true });

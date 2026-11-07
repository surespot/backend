import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type ReviewPromptDocument = HydratedDocument<ReviewPrompt>;

export enum ReviewPromptStatus {
  /** The customer submitted reviews for this order. */
  COMPLETED = 'completed',
  /** The customer chose to skip it. */
  DISMISSED = 'dismissed',
}

/**
 * Marks an order as dealt with so it leaves the customer's review queue. The
 * unique index on `orderId` is also what stops two concurrent submissions for
 * the same order.
 */
@Schema({ timestamps: true })
export class ReviewPrompt {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  userId: Types.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Order',
    required: true,
    unique: true,
  })
  orderId: Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(ReviewPromptStatus),
    required: true,
  })
  status: ReviewPromptStatus;

  /** What the customer submitted, if they did. */
  @Prop({ type: String, enum: ['items', 'order'] })
  kind?: 'items' | 'order';

  createdAt?: Date;
  updatedAt?: Date;
}

export const ReviewPromptSchema = SchemaFactory.createForClass(ReviewPrompt);

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { ReviewModerationStatus } from '../../food-items/schemas/review.schema';

export type OrderReviewDocument = HydratedDocument<OrderReview>;

/**
 * A review of a whole order. The rating and comment are copied onto each item
 * of the order the customer had not already reviewed (as Review documents with
 * `orderReviewId` pointing here), so they count toward those items' ratings.
 * Moderation happens here and cascades to the copies.
 */
@Schema({ timestamps: true })
export class OrderReview {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  userId: Types.ObjectId;

  /** One review per order. */
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Order',
    required: true,
    unique: true,
  })
  orderId: Types.ObjectId;

  @Prop({ required: true, min: 1, max: 5 })
  rating: number;

  @Prop({ maxlength: 500 })
  comment?: string;

  /** The food items this rating was applied to. */
  @Prop({ type: [MongooseSchema.Types.ObjectId], ref: 'FoodItem', default: [] })
  foodItemIds: Types.ObjectId[];

  @Prop({
    type: String,
    enum: Object.values(ReviewModerationStatus),
    default: ReviewModerationStatus.PENDING,
  })
  moderationStatus: ReviewModerationStatus;

  /** Reward campaign that was running when this was submitted, if any. */
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'RewardCampaign' })
  rewardCampaignId?: Types.ObjectId;

  @Prop({ type: Date })
  approvedAt?: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  approvedBy?: Types.ObjectId;

  @Prop({ type: Date })
  hiddenAt?: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  hiddenBy?: Types.ObjectId;

  @Prop({ maxlength: 500 })
  hiddenReason?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const OrderReviewSchema = SchemaFactory.createForClass(OrderReview);

OrderReviewSchema.index({ moderationStatus: 1, createdAt: -1 });

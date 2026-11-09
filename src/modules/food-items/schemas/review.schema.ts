import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type ReviewDocument = HydratedDocument<Review>;

export enum ReviewModerationStatus {
  /** Live and counted in ratings, awaiting admin review. */
  PENDING = 'pending',
  /** Live and counted in ratings; admin approved (may carry a reward). */
  APPROVED = 'approved',
  /** Removed by an admin: not counted in ratings, not shown anywhere. */
  HIDDEN = 'hidden',
}

export enum ReviewSource {
  /** The customer reviewed this item directly. */
  ITEM = 'item',
  /** Copied onto this item from a whole-order review. */
  ORDER = 'order',
}

/**
 * Filter that matches every review that is allowed to be shown / counted.
 * Reviews created before moderation existed have no `moderationStatus`, and
 * `$ne` matches missing fields, so they stay visible without a migration.
 */
export const VISIBLE_REVIEW_FILTER = {
  moderationStatus: { $ne: ReviewModerationStatus.HIDDEN },
} as const;

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

  @Prop({
    type: String,
    enum: Object.values(ReviewSource),
    default: ReviewSource.ITEM,
  })
  source: ReviewSource;

  /** Set when this review was created from a whole-order review. */
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'OrderReview' })
  orderReviewId?: Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(ReviewModerationStatus),
    default: ReviewModerationStatus.PENDING,
  })
  moderationStatus: ReviewModerationStatus;

  /**
   * The reward campaign that was running when this review was submitted, if
   * any. Approving the review grants that campaign's reward. Recorded at
   * submission time so a slow approval does not cost the customer their reward.
   */
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

export const ReviewSchema = SchemaFactory.createForClass(Review);

// Compound unique index: one review per user per food item
ReviewSchema.index({ foodItemId: 1, userId: 1 }, { unique: true });
ReviewSchema.index({ orderReviewId: 1 }, { sparse: true });
ReviewSchema.index({ source: 1, moderationStatus: 1, createdAt: -1 });

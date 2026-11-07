import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import type { DiscountType } from '../../promotions/types';
import { FoodCategory } from '../../food-items/schemas/food-item.schema';

export type RewardCampaignDocument = HydratedDocument<RewardCampaign>;

/**
 * What a customer has to do to earn a reward. Add a value here (and call
 * RewardsService.grant from the feature that detects it) to support a new kind
 * of special reward, e.g. LINK_SHARE.
 */
export enum RewardTrigger {
  REVIEW = 'review',
}

export enum RewardCampaignStatus {
  ACTIVE = 'active',
  /** Admin kill switch: no new rewards, and existing ones stop working. */
  DISABLED = 'disabled',
}

export class RewardAccumulation {
  /** When false a user can earn this reward once; when true, once per qualifying action. */
  @Prop({ default: false })
  enabled: boolean;

  /** Max rewards one user can hold from this campaign. Unset = unlimited (accumulation only). */
  @Prop({ type: Number, min: 1 })
  maxPerUser?: number;
}

/**
 * A special reward campaign: customers earn the right to use a fixed code by
 * doing something (the trigger). Unlike a banner promotion the code does
 * nothing for anyone who has not earned it. The benefit uses the same fields
 * as a promotion so a reward can be a percentage, fixed amount, free delivery,
 * free items from a category, or buy-X-get-Y.
 */
@Schema({ timestamps: true })
export class RewardCampaign {
  @Prop({ required: true })
  name: string;

  @Prop()
  description?: string;

  @Prop()
  imageUrl?: string;

  @Prop({
    type: String,
    enum: Object.values(RewardTrigger),
    required: true,
    index: true,
  })
  trigger: RewardTrigger;

  /** The code customers type at checkout. Stored uppercase, unique across campaigns. */
  @Prop({ required: true, unique: true, uppercase: true, trim: true })
  code: string;

  @Prop({
    type: String,
    enum: Object.values(RewardCampaignStatus),
    default: RewardCampaignStatus.ACTIVE,
    index: true,
  })
  status: RewardCampaignStatus;

  /** Rewards can only be earned between these dates. Using one is not limited by them. */
  @Prop({ type: Date, required: true })
  earnFrom: Date;

  @Prop({ type: Date, required: true })
  earnTo: Date;

  /** How long an earned reward stays usable, counted from when it is granted. */
  @Prop({ type: Number, default: 30, min: 1 })
  validityDays: number;

  /** When true an admin must approve the action before the reward is granted. */
  @Prop({ default: true })
  requiresApproval: boolean;

  @Prop({ type: RewardAccumulation, default: () => ({ enabled: false }) })
  accumulation: RewardAccumulation;

  // ---- Benefit: same fields and meaning as a Promotion ----
  @Prop({
    type: String,
    enum: [
      'percentage',
      'fixed_amount',
      'free_delivery',
      'free_category',
      'bogo',
    ],
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

  @Prop({ type: [MongooseSchema.Types.ObjectId], ref: 'FoodItem' })
  targetFoodItemIds?: Types.ObjectId[];

  @Prop({ type: Number, min: 0 })
  maxFreeQuantity?: number;

  @Prop({ type: Number, min: 1 })
  buyQuantity?: number;

  @Prop({ type: Number, min: 1 })
  getFreeQuantity?: number;

  @Prop({ type: Number, min: 0 })
  maxRedeemablePerOrder?: number;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  createdAt?: Date;
  updatedAt?: Date;
}

export const RewardCampaignSchema =
  SchemaFactory.createForClass(RewardCampaign);

RewardCampaignSchema.index({ trigger: 1, status: 1, earnFrom: 1, earnTo: 1 });

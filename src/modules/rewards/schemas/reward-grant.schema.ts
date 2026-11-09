import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { RewardTrigger } from './reward-campaign.schema';

export type RewardGrantDocument = HydratedDocument<RewardGrant>;

export enum RewardGrantStatus {
  /** Earned and not used yet (may still be past its expiry; see RewardGrant.expiresAt). */
  EARNED = 'earned',
  REDEEMED = 'redeemed',
  REVOKED = 'revoked',
}

/** Why a grant was revoked. Matters because it decides whether it still counts toward a user's limit. */
export enum RewardRevokeKind {
  /** The thing that earned it was undone (e.g. the review was hidden). The user may earn again. */
  SOURCE = 'source',
  /** An admin took it back directly. Still counts toward the user's limit so they cannot just re-earn it. */
  ADMIN = 'admin',
}

/**
 * One earned reward: the right for one user to use one campaign's code once.
 * "Who has earned it" in the admin view is this collection.
 */
@Schema({ timestamps: true })
export class RewardGrant {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'RewardCampaign',
    required: true,
    index: true,
  })
  campaignId: Types.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  userId: Types.ObjectId;

  @Prop({ type: String, enum: Object.values(RewardTrigger), required: true })
  trigger: RewardTrigger;

  /** What earned it, e.g. 'review' / 'order_review' and that document's id. */
  @Prop({ required: true })
  sourceType: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  sourceId: Types.ObjectId;

  /** The order the qualifying action was about, if any. */
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Order' })
  orderId?: Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(RewardGrantStatus),
    default: RewardGrantStatus.EARNED,
  })
  status: RewardGrantStatus;

  /** Admin who approved it; unset when granted automatically. */
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  grantedBy?: Types.ObjectId;

  @Prop({ type: Date, required: true })
  expiresAt: Date;

  @Prop({ type: Date })
  redeemedAt?: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Order' })
  redeemedOrderId?: Types.ObjectId;

  @Prop({ type: Date })
  revokedAt?: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  revokedBy?: Types.ObjectId;

  @Prop({ type: String, enum: Object.values(RewardRevokeKind) })
  revokeKind?: RewardRevokeKind;

  @Prop({ maxlength: 500 })
  revokedReason?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const RewardGrantSchema = SchemaFactory.createForClass(RewardGrant);

// The same action can only earn a campaign's reward once
RewardGrantSchema.index(
  { campaignId: 1, sourceType: 1, sourceId: 1 },
  { unique: true },
);
RewardGrantSchema.index({ campaignId: 1, status: 1, createdAt: -1 });
RewardGrantSchema.index({ userId: 1, status: 1, expiresAt: 1 });

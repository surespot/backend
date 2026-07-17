import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { NewsletterAudienceType } from '../../mail/schemas/newsletter.schema';

export type NotificationCampaignDocument = NotificationCampaign & Document;

export enum NotificationCampaignChannel {
  SMS = 'sms',
  PUSH = 'push',
  EMAIL = 'email',
}

export enum NotificationCampaignTargetMode {
  DEMOGRAPHIC = 'demographic',
  SPECIFIC_USERS = 'specific-users',
}

export enum NotificationCampaignStatus {
  DRAFT = 'draft',
  SENDING = 'sending',
  SENT = 'sent',
  FAILED = 'failed',
}

@Schema({ timestamps: true })
export class NotificationCampaign {
  @Prop({
    required: true,
    enum: Object.values(NotificationCampaignChannel),
    index: true,
  })
  channel: NotificationCampaignChannel;

  @Prop({
    required: true,
    enum: Object.values(NotificationCampaignTargetMode),
    index: true,
  })
  targetMode: NotificationCampaignTargetMode;

  @Prop({
    enum: Object.values(NewsletterAudienceType),
  })
  audience?: NewsletterAudienceType; // For demographic targetMode

  @Prop({ type: [{ type: Types.ObjectId }] })
  targetPickupLocationIds?: Types.ObjectId[]; // For pickup-locations audience

  @Prop({ type: [{ type: Types.ObjectId }] })
  targetRegionIds?: Types.ObjectId[]; // For regions audience

  @Prop({ type: [{ type: Types.ObjectId }] })
  targetUserIds?: Types.ObjectId[]; // For specific-users targetMode

  @Prop()
  subject?: string; // Email only

  @Prop()
  title?: string; // Push only

  @Prop({ required: true })
  body: string; // Message text (HTML for email, plain text for sms/push)

  @Prop({
    required: true,
    enum: Object.values(NotificationCampaignStatus),
    default: NotificationCampaignStatus.DRAFT,
    index: true,
  })
  status: NotificationCampaignStatus;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  @Prop()
  sentAt?: Date;

  @Prop({ default: 0 })
  totalRecipients: number;

  @Prop({ default: 0 })
  successCount: number;

  @Prop({ default: 0 })
  failureCount: number;

  @Prop({ default: 0 })
  skippedCount: number; // Matched target but ineligible for the channel (no phone/token/email)

  createdAt?: Date;
  updatedAt?: Date;
}

export const NotificationCampaignSchema =
  SchemaFactory.createForClass(NotificationCampaign);

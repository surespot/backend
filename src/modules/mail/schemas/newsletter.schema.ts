import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type NewsletterDocument = Newsletter & Document;

export enum NewsletterAudienceType {
  ALL_CUSTOMERS = 'customers',
  ALL_RIDERS = 'riders',
  PICKUP_LOCATIONS = 'pickup-locations',
  REGIONS = 'regions',
}

export enum NewsletterStatus {
  DRAFT = 'draft',
  SENDING = 'sending',
  SENT = 'sent',
  FAILED = 'failed',
}

@Schema({ timestamps: true })
export class Newsletter {
  @Prop({ required: true })
  subject: string;

  @Prop({ required: true })
  body: string; // HTML content for the email body

  @Prop({
    required: true,
    enum: Object.values(NewsletterAudienceType),
    index: true,
  })
  audience: NewsletterAudienceType;

  @Prop({ type: [{ type: Types.ObjectId }] })
  targetPickupLocationIds?: Types.ObjectId[]; // For pickup-locations audience

  @Prop({ type: [{ type: Types.ObjectId }] })
  targetRegionIds?: Types.ObjectId[]; // For regions audience

  @Prop({
    required: true,
    enum: Object.values(NewsletterStatus),
    default: NewsletterStatus.DRAFT,
    index: true,
  })
  status: NewsletterStatus;

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

  createdAt?: Date;
  updatedAt?: Date;
}

export const NewsletterSchema = SchemaFactory.createForClass(Newsletter);

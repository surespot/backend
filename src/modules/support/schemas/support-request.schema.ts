import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type SupportRequestDocument = HydratedDocument<SupportRequest>;

export enum SupportRequestStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
}

export enum SupportRequestSource {
  SERVICE_ISSUE = 'service_issue',
  BUG_REPORT = 'bug_report',
  CONTACT_SUPPORT = 'contact_support',
}

export enum SubmitterRole {
  CUSTOMER = 'customer',
  RIDER = 'rider',
}

@Schema({ timestamps: true })
export class SupportRequest {
  @Prop({
    type: String,
    enum: Object.values(SubmitterRole),
    required: true,
    index: true,
  })
  submitterRole: SubmitterRole;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(SupportRequestStatus),
    default: SupportRequestStatus.PENDING,
    index: true,
  })
  status: SupportRequestStatus;

  @Prop({
    type: String,
    enum: Object.values(SupportRequestSource),
    required: true,
    index: true,
  })
  source: SupportRequestSource;

  @Prop({ required: true })
  category: string;

  @Prop({ required: true })
  type: string;

  @Prop({ type: Types.ObjectId, ref: 'Order', index: true })
  orderId?: Types.ObjectId;

  @Prop()
  title?: string;

  @Prop({ required: true })
  description: string;

  @Prop({ required: true })
  contactPhone: string;

  @Prop({ type: [String], default: [] })
  attachments: string[];

  // Bug report specific
  @Prop()
  stepsToReproduce?: string;

  @Prop()
  areaAffected?: string;

  @Prop()
  issueType?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const SupportRequestSchema =
  SchemaFactory.createForClass(SupportRequest);

SupportRequestSchema.index({ userId: 1, createdAt: -1 });
SupportRequestSchema.index({ submitterRole: 1, status: 1 });
SupportRequestSchema.index({ createdAt: -1 });

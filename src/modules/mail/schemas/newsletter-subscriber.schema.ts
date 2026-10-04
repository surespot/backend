import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type NewsletterSubscriberDocument = NewsletterSubscriber & Document;

export enum SubscriberChannel {
  EMAIL = 'email',
  WHATSAPP = 'whatsapp',
}

@Schema({ timestamps: true })
export class NewsletterSubscriber {
  @Prop({ required: true, enum: Object.values(SubscriberChannel) })
  channel: SubscriberChannel;

  /** Lower-cased email address (email channel only). */
  @Prop({ lowercase: true, trim: true })
  email?: string;

  /** Phone number in E.164 form, e.g. +2348163395600 (whatsapp channel only). */
  @Prop({ trim: true })
  phone?: string;

  @Prop({ default: 'landing-page' })
  source: string;

  @Prop({ default: true, index: true })
  isActive: boolean;

  @Prop()
  unsubscribedAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const NewsletterSubscriberSchema =
  SchemaFactory.createForClass(NewsletterSubscriber);

NewsletterSubscriberSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: 'string' } } },
);
NewsletterSubscriberSchema.index(
  { phone: 1 },
  { unique: true, partialFilterExpression: { phone: { $type: 'string' } } },
);

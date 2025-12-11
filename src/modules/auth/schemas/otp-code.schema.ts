import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type OtpCodeDocument = HydratedDocument<OtpCode>;

export enum OtpPurpose {
  REGISTRATION = 'registration',
  PASSWORD_RESET = 'password_reset',
}

@Schema({ timestamps: true })
export class OtpCode {
  @Prop({ required: false, index: true })
  phone?: string;

  @Prop({ required: false, index: true })
  email?: string;

  @Prop({ required: true })
  code: string;

  @Prop({ type: String, enum: OtpPurpose, required: true })
  purpose: OtpPurpose;

  @Prop({ default: 0 })
  attempts: number;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ default: false })
  isVerified: boolean;

  @Prop()
  verifiedAt?: Date;

  createdAt?: Date;
}

export const OtpCodeSchema = SchemaFactory.createForClass(OtpCode);

// TTL index for automatic document expiration
OtpCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

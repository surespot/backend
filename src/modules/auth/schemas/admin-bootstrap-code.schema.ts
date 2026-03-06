import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AdminBootstrapCodeDocument = HydratedDocument<AdminBootstrapCode>;

@Schema({ timestamps: true })
export class AdminBootstrapCode {
  @Prop({ required: true, unique: true, index: true })
  code: string; // 4-digit random code

  @Prop({ default: false })
  used: boolean;

  @Prop()
  usedAt?: Date;

  @Prop({ required: true, index: true })
  expiresAt: Date; // Token expiry (15 min from creation)

  createdAt?: Date;
  updatedAt?: Date;
}

export const AdminBootstrapCodeSchema =
  SchemaFactory.createForClass(AdminBootstrapCode);

// TTL index for automatic cleanup after expiration
AdminBootstrapCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

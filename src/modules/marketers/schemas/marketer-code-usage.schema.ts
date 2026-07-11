import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type MarketerCodeUsageDocument = HydratedDocument<MarketerCodeUsage>;

@Schema({ timestamps: false })
export class MarketerCodeUsage {
  @Prop({ type: Types.ObjectId, ref: 'Marketer', required: true, index: true })
  marketerId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Order', required: true })
  orderId: Types.ObjectId;

  @Prop({ type: Number, required: true, min: 0 })
  orderAmount: number;

  @Prop({ type: Number, required: true, min: 0 })
  discountAmount: number;

  @Prop({ type: Date, default: () => new Date() })
  usedAt: Date;
}

export const MarketerCodeUsageSchema = SchemaFactory.createForClass(MarketerCodeUsage);
// Enforces one redemption per user per marketer code
MarketerCodeUsageSchema.index({ marketerId: 1, userId: 1 }, { unique: true });

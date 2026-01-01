import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CartDocument = HydratedDocument<Cart>;

@Schema({ timestamps: true })
export class Cart {
  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  })
  userId: Types.ObjectId;

  @Prop({ type: Number, default: 0, min: 0 })
  subtotal: number; // Sum of all item prices * quantities (in kobo)

  @Prop({ type: Number, default: 0, min: 0 })
  extrasTotal: number; // Sum of all extras (in kobo)

  @Prop({ type: Number, default: 0, min: 0 })
  discountAmount: number; // Discount from promo code (in kobo)

  @Prop({ type: Number, min: 0, max: 100 })
  discountPercent?: number; // Discount percentage (if promo applied)

  @Prop()
  promoCode?: string; // Applied promo code

  @Prop({ type: Types.ObjectId, ref: 'Promotion' })
  promotionId?: Types.ObjectId; // Reference to promotion for tracking

  @Prop({ type: Number, default: 0, min: 0 })
  total: number; // Final total (subtotal + extras - discount) (in kobo)

  @Prop({ type: Number, default: 0, min: 0 })
  itemCount: number; // Total number of items (sum of quantities)

  @Prop({ type: Number, default: 0, min: 0 })
  extrasCount: number; // Total number of extras

  @Prop({ type: Date, index: true })
  expiresAt: Date; // TTL for cart expiry (1 month)

  createdAt?: Date;
  updatedAt?: Date;
}

export const CartSchema = SchemaFactory.createForClass(Cart);

// Indexes
CartSchema.index({ userId: 1 }, { unique: true });
// TTL index for automatic cart expiry (1 month = 30 days)
CartSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

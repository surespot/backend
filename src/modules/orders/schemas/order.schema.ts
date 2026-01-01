import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type OrderDocument = HydratedDocument<Order>;

export enum OrderStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  PREPARING = 'preparing',
  READY = 'ready',
  OUT_FOR_DELIVERY = 'out-for-delivery',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
}

export enum DeliveryType {
  DOOR_DELIVERY = 'door-delivery',
  PICKUP = 'pickup',
}

export enum PaymentStatus {
  PENDING = 'pending',
  PAID = 'paid',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

// Embedded schema for delivery address
export class DeliveryAddress {
  @Prop()
  id?: string; // Saved location ID if from saved locations

  @Prop({ required: true })
  address: string;

  @Prop()
  street?: string;

  @Prop()
  city?: string;

  @Prop()
  state?: string;

  @Prop({ default: 'Nigeria' })
  country: string;

  @Prop()
  postalCode?: string;

  @Prop({
    type: {
      latitude: { type: Number },
      longitude: { type: Number },
    },
  })
  coordinates?: {
    latitude: number;
    longitude: number;
  };

  @Prop()
  instructions?: string;

  @Prop()
  contactPhone?: string;
}

@Schema({ timestamps: true })
export class Order {
  @Prop({ required: true, unique: true })
  orderNumber: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(OrderStatus),
    default: OrderStatus.PENDING,
  })
  status: OrderStatus;

  @Prop({
    type: String,
    enum: Object.values(DeliveryType),
    required: true,
  })
  deliveryType: DeliveryType;

  @Prop({ type: Number, default: 0, min: 0 })
  subtotal: number; // Sum of all item prices (in kobo)

  @Prop({ type: Number, default: 0, min: 0 })
  extrasTotal: number; // Sum of all extras (in kobo)

  @Prop({ type: Number, default: 0, min: 0 })
  deliveryFee: number; // Delivery fee (in kobo, 0 for pickup)

  @Prop({ type: Number, default: 0, min: 0 })
  discountAmount: number; // Discount from promo code (in kobo)

  @Prop({ type: Number, min: 0, max: 100 })
  discountPercent?: number; // Discount percentage (if promo applied)

  @Prop()
  promoCode?: string; // Applied promo code

  @Prop({ type: Types.ObjectId, ref: 'Promotion' })
  promotionId?: Types.ObjectId;

  @Prop({ type: Number, default: 0, min: 0 })
  total: number; // Final total (in kobo)

  @Prop({ type: Number, default: 0, min: 0 })
  itemCount: number; // Total number of items

  @Prop({ type: Number, default: 0, min: 0 })
  extrasCount: number; // Total number of extras

  @Prop({ type: DeliveryAddress })
  deliveryAddress?: DeliveryAddress;

  @Prop({ type: Types.ObjectId, ref: 'PickupLocation' })
  pickupLocationId?: Types.ObjectId;

  @Prop({ type: Date })
  estimatedDeliveryTime?: Date;

  @Prop({ type: Number, min: 0 })
  estimatedPreparationTime?: number; // Minutes

  @Prop({
    type: String,
    enum: Object.values(PaymentStatus),
    default: PaymentStatus.PENDING,
  })
  paymentStatus: PaymentStatus;

  @Prop()
  paymentMethod?: string; // e.g., "card", "cash", "wallet"

  @Prop()
  paymentIntentId?: string; // Paystack payment reference

  @Prop({ type: Types.ObjectId, ref: 'Transaction' })
  transactionId?: Types.ObjectId;

  @Prop()
  instructions?: string; // Special delivery/order instructions

  @Prop({ type: Date })
  deliveredAt?: Date;

  @Prop({ type: Date })
  cancelledAt?: Date;

  @Prop()
  cancellationReason?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const OrderSchema = SchemaFactory.createForClass(Order);

// Indexes
OrderSchema.index({ orderNumber: 1 }, { unique: true });
OrderSchema.index({ userId: 1, createdAt: -1 });
OrderSchema.index({ status: 1, createdAt: -1 });
OrderSchema.index({ paymentStatus: 1 });
OrderSchema.index({ createdAt: -1 });

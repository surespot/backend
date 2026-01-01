import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type OrderDeliveryStatusDocument = HydratedDocument<OrderDeliveryStatus>;

export enum DeliveryStatus {
  PENDING = 'pending',
  PREPARING = 'preparing',
  READY = 'ready',
  RIDER_REQUESTED = 'rider_requested',
  RIDER_PRESENT = 'rider_present',
  RIDER_PICKED_UP = 'rider_picked_up',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
}

@Schema({ timestamps: true })
export class OrderDeliveryStatus {
  @Prop({ type: Types.ObjectId, ref: 'Order', required: true })
  orderId: Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(DeliveryStatus),
    required: true,
  })
  status: DeliveryStatus;

  @Prop()
  message?: string; // Optional status message

  @Prop({ type: Types.ObjectId, ref: 'User' })
  updatedBy?: Types.ObjectId; // Admin or rider who updated the status

  @Prop({
    type: {
      type: String,
      enum: ['Point'],
    },
    coordinates: {
      type: [Number], // [longitude, latitude] - GeoJSON format
    },
  })
  location?: {
    type: 'Point';
    coordinates: [number, number]; // [lng, lat]
  };

  createdAt?: Date;
  updatedAt?: Date;
}

export const OrderDeliveryStatusSchema =
  SchemaFactory.createForClass(OrderDeliveryStatus);

// Indexes
OrderDeliveryStatusSchema.index({ orderId: 1, createdAt: -1 });
OrderDeliveryStatusSchema.index({ status: 1 });
OrderDeliveryStatusSchema.index({ location: '2dsphere' });

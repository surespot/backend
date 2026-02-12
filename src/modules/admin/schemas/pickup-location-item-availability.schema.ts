import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PickupLocationItemAvailabilityDocument =
  HydratedDocument<PickupLocationItemAvailability>;

@Schema({ timestamps: true })
export class PickupLocationItemAvailability {
  @Prop({
    type: Types.ObjectId,
    ref: 'PickupLocation',
    required: true,
    index: true,
  })
  pickupLocationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  itemId: Types.ObjectId;

  @Prop({ type: String, enum: ['food', 'extra'], required: true })
  itemType: 'food' | 'extra';

  @Prop({ type: Boolean, required: true, default: true })
  inStock: boolean;
}

export const PickupLocationItemAvailabilitySchema = SchemaFactory.createForClass(
  PickupLocationItemAvailability,
);

PickupLocationItemAvailabilitySchema.index(
  { pickupLocationId: 1, itemId: 1, itemType: 1 },
  { unique: true },
);

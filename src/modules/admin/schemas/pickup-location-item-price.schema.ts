import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PickupLocationItemPriceDocument =
  HydratedDocument<PickupLocationItemPrice>;

@Schema({ timestamps: true })
export class PickupLocationItemPrice {
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

  @Prop({ type: Number, required: true, min: 0 })
  price: number; // Price in kobo
}

export const PickupLocationItemPriceSchema =
  SchemaFactory.createForClass(PickupLocationItemPrice);

PickupLocationItemPriceSchema.index(
  { pickupLocationId: 1, itemId: 1, itemType: 1 },
  { unique: true },
);

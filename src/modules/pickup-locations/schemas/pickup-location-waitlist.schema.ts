import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PickupLocationWaitlistDocument =
  HydratedDocument<PickupLocationWaitlist>;

@Schema({ timestamps: true })
export class PickupLocationWaitlist {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  latitude: number;

  @Prop({ required: true })
  longitude: number;
}

export const PickupLocationWaitlistSchema = SchemaFactory.createForClass(
  PickupLocationWaitlist,
);

PickupLocationWaitlistSchema.index(
  { userId: 1, latitude: 1, longitude: 1 },
  { unique: true },
);

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type FoodInteractionDocument = HydratedDocument<FoodInteraction>;

export enum InteractionType {
  VIEW = 'VIEW',
  LIKE = 'LIKE',
}

@Schema({ timestamps: true })
export class FoodInteraction {
  @Prop({ type: Types.ObjectId, ref: 'FoodItem', required: true, index: true })
  foodItemId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(InteractionType),
    required: true,
    index: true,
  })
  interactionType: InteractionType;

  createdAt?: Date;
  updatedAt?: Date;
}

export const FoodInteractionSchema =
  SchemaFactory.createForClass(FoodInteraction);

// Compound index to ensure one interaction type per user per food item
FoodInteractionSchema.index(
  { foodItemId: 1, userId: 1, interactionType: 1 },
  { unique: true },
);

// Index for querying user interactions
FoodInteractionSchema.index({ userId: 1, interactionType: 1 });

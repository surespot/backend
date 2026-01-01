import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CartExtraDocument = HydratedDocument<CartExtra>;

@Schema({ timestamps: true })
export class CartExtra {
  @Prop({ type: Types.ObjectId, ref: 'CartItem', required: true })
  cartItemId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'FoodExtra', required: true })
  foodExtraId: Types.ObjectId;

  // Snapshot of extra details at time of adding to cart
  @Prop({ required: true })
  name: string;

  @Prop()
  description?: string;

  @Prop({ required: true, min: 0 })
  price: number; // Price in kobo at time of adding

  @Prop({ required: true, default: 'NGN' })
  currency: string;

  @Prop({ required: true, min: 1, default: 1 })
  quantity: number; // Usually 1, but can be more

  createdAt?: Date;
  updatedAt?: Date;
}

export const CartExtraSchema = SchemaFactory.createForClass(CartExtra);

// Indexes
CartExtraSchema.index({ cartItemId: 1 });
CartExtraSchema.index({ cartItemId: 1, foodExtraId: 1 });

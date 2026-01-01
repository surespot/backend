import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CartItemDocument = HydratedDocument<CartItem>;

@Schema({ timestamps: true })
export class CartItem {
  @Prop({ type: Types.ObjectId, ref: 'Cart', required: true })
  cartId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'FoodItem', required: true, index: true })
  foodItemId: Types.ObjectId;

  // Snapshot of food item details at time of adding to cart
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  description: string;

  @Prop({ required: true })
  slug: string;

  @Prop({ required: true, min: 0 })
  price: number; // Price in kobo at time of adding

  @Prop({ required: true, default: 'NGN' })
  currency: string;

  @Prop({ required: true })
  imageUrl: string;

  @Prop({ required: true, min: 1, max: 99, default: 1 })
  quantity: number;

  @Prop({
    type: {
      min: { type: Number, required: true },
      max: { type: Number, required: true },
    },
    required: true,
  })
  estimatedTime: {
    min: number;
    max: number;
  };

  @Prop({ type: Number, default: 0, min: 0 })
  subtotal: number; // price * quantity (in kobo)

  @Prop({ type: Number, default: 0, min: 0 })
  extrasTotal: number; // Total price of all extras (in kobo)

  @Prop({ type: Number, default: 0, min: 0 })
  lineTotal: number; // subtotal + extrasTotal (in kobo)

  createdAt?: Date;
  updatedAt?: Date;
}

export const CartItemSchema = SchemaFactory.createForClass(CartItem);

// Indexes
CartItemSchema.index({ cartId: 1, foodItemId: 1 });
CartItemSchema.index({ cartId: 1 });

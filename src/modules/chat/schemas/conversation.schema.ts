import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { UserRole } from '../../auth/schemas/user.schema';

export type ConversationDocument = HydratedDocument<Conversation>;

export enum ConversationType {
  ORDER = 'order',
  SUPPORT = 'support',
}

@Schema({ timestamps: true })
export class Conversation {
  @Prop({
    type: String,
    enum: Object.values(ConversationType),
    default: ConversationType.ORDER,
    index: true,
  })
  type: ConversationType;

  @Prop({
    type: Types.ObjectId,
    ref: 'Order',
    required: true,
    index: true,
    unique: true,
    sparse: true, // Allow multiple null values for non-order conversations
  })
  orderId: Types.ObjectId;

  @Prop({
    type: [
      {
        userId: { type: Types.ObjectId, ref: 'User', required: true },
        role: {
          type: String,
          enum: Object.values(UserRole),
          required: true,
        },
      },
    ],
    required: true,
  })
  participants: Array<{
    userId: Types.ObjectId;
    role: UserRole;
  }>;

  @Prop({ type: Date, index: -1 }) // Descending index for sorting
  lastMessageAt?: Date;

  @Prop({ default: true, index: true })
  isActive: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);

// Indexes
ConversationSchema.index({ orderId: 1 }, { unique: true, sparse: true });
ConversationSchema.index({ 'participants.userId': 1 });
ConversationSchema.index({ lastMessageAt: -1 });
ConversationSchema.index({ type: 1, isActive: 1 });

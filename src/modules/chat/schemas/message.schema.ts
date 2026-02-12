import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type MessageDocument = HydratedDocument<Message>;

@Schema({ timestamps: true })
export class Message {
  @Prop({
    type: Types.ObjectId,
    ref: 'Conversation',
    required: true,
    index: true,
  })
  conversationId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  senderId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: false,
  })
  receiverId?: Types.ObjectId;

  @Prop({ required: true, maxlength: 5000 })
  content: string;

  @Prop({
    type: [
      {
        url: { type: String, required: true },
        type: { type: String, required: true }, // e.g., 'image', 'file'
        filename: { type: String, required: false },
      },
    ],
    default: [],
  })
  attachments?: Array<{
    url: string;
    type: string;
    filename?: string;
  }>;

  @Prop({ default: false, index: true })
  isRead: boolean;

  @Prop({ type: Date })
  readAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const MessageSchema = SchemaFactory.createForClass(Message);

// Indexes
MessageSchema.index({ conversationId: 1, createdAt: -1 }); // Compound index for cursor pagination
MessageSchema.index({ senderId: 1 });
MessageSchema.index({ isRead: 1 });
MessageSchema.index({ conversationId: 1, isRead: 1 });

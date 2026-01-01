import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type WebSocketConnectionDocument =
  HydratedDocument<WebSocketConnection>;

@Schema({ timestamps: true })
export class WebSocketConnection {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, unique: true, index: true })
  socketId: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: Date })
  connectedAt: Date;

  @Prop({ type: Date })
  disconnectedAt?: Date;

  @Prop({ type: Date })
  lastActivityAt: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const WebSocketConnectionSchema =
  SchemaFactory.createForClass(WebSocketConnection);

// Indexes
WebSocketConnectionSchema.index({ userId: 1, isActive: 1 });
WebSocketConnectionSchema.index({ socketId: 1 });
WebSocketConnectionSchema.index({ lastActivityAt: 1 });


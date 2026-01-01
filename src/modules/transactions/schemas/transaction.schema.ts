import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type TransactionDocument = HydratedDocument<Transaction>;

export enum TransactionStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

export enum PaymentProvider {
  PAYSTACK = 'paystack',
}

@Schema({ timestamps: true })
export class Transaction {
  @Prop({ type: Types.ObjectId, ref: 'Order' })
  orderId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, min: 0 })
  amount: number; // Amount in kobo

  @Prop({ required: true, default: 'NGN' })
  currency: string;

  @Prop({ required: true })
  paymentMethod: string; // e.g., "card"

  @Prop({
    type: String,
    enum: Object.values(PaymentProvider),
    default: PaymentProvider.PAYSTACK,
  })
  provider: PaymentProvider;

  @Prop({
    type: String,
    enum: Object.values(TransactionStatus),
    default: TransactionStatus.PENDING,
  })
  status: TransactionStatus;

  @Prop({ unique: true, sparse: true })
  reference?: string; // Paystack reference

  @Prop()
  authorizationUrl?: string; // Paystack authorization URL for redirect

  @Prop()
  accessCode?: string; // Paystack access code

  @Prop({ type: Object })
  providerResponse?: Record<string, unknown>; // Full Paystack response

  @Prop()
  failureReason?: string;

  @Prop({ type: Date })
  paidAt?: Date;

  @Prop({ type: Date })
  refundedAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const TransactionSchema = SchemaFactory.createForClass(Transaction);

// Indexes
TransactionSchema.index({ orderId: 1 });
TransactionSchema.index({ userId: 1, createdAt: -1 });
TransactionSchema.index({ reference: 1 }, { unique: true, sparse: true });
TransactionSchema.index({ status: 1 });

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

export enum TransactionType {
  PAYMENT = 'payment', // Customer payment for order
  RIDER_EARNING = 'rider_earning', // Credit to rider wallet
  RIDER_WITHDRAWAL = 'rider_withdrawal', // Debit from rider wallet (transfer to bank)
}

@Schema({ timestamps: true })
export class Transaction {
  @Prop({ type: Types.ObjectId, ref: 'Order' })
  orderId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: false, index: true })
  userId?: Types.ObjectId; // For customer payments

  @Prop({ type: Types.ObjectId, ref: 'RiderProfile', required: false, index: true })
  riderProfileId?: Types.ObjectId; // For rider transactions

  @Prop({
    type: String,
    enum: Object.values(TransactionType),
    default: TransactionType.PAYMENT,
  })
  type: TransactionType;

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
TransactionSchema.index({ riderProfileId: 1, createdAt: -1 });
TransactionSchema.index({ type: 1 });
TransactionSchema.index({ reference: 1 }, { unique: true, sparse: true });
TransactionSchema.index({ status: 1 });

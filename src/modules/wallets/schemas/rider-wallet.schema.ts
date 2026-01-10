import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type RiderWalletDocument = HydratedDocument<RiderWallet>;

@Schema({ timestamps: true })
export class RiderWallet {
  _id: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'RiderProfile',
    required: true,
    unique: true,
    index: true,
  })
  riderProfileId: Types.ObjectId;

  @Prop({ type: Number, default: 0, min: 0 })
  walletBalance: number; // Balance in kobo

  // Paystack Transfer Recipient details
  @Prop({ type: String })
  paystackRecipientCode?: string; // Paystack transfer recipient code

  @Prop({ type: String })
  accountNumber?: string; // Bank account number

  @Prop({ type: String })
  bankCode?: string; // Paystack bank code

  @Prop({ type: String })
  bankName?: string; // Bank name

  @Prop({ type: String })
  accountName?: string; // Account holder name

  @Prop({ type: String })
  currency: string; // Default: 'NGN'

  @Prop({ type: Boolean, default: false })
  isVerified: boolean; // Whether payment details are verified

  createdAt?: Date;
  updatedAt?: Date;
}

export const RiderWalletSchema = SchemaFactory.createForClass(RiderWallet);

// Indexes
RiderWalletSchema.index({ riderProfileId: 1 }, { unique: true });

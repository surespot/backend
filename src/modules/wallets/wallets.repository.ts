import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  RiderWallet,
  RiderWalletDocument,
} from './schemas/rider-wallet.schema';

@Injectable()
export class WalletsRepository {
  constructor(
    @InjectModel(RiderWallet.name)
    private walletModel: Model<RiderWalletDocument>,
  ) {}

  private validateObjectId(id: string, fieldName: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'INVALID_ID',
          message: `Invalid ${fieldName} format`,
        },
      });
    }
  }

  /**
   * Create or get wallet for a rider
   */
  async findOrCreate(riderProfileId: string): Promise<RiderWalletDocument> {
    this.validateObjectId(riderProfileId, 'riderProfileId');

    let wallet = await this.walletModel
      .findOne({ riderProfileId: new Types.ObjectId(riderProfileId) })
      .exec();

    if (!wallet) {
      wallet = new this.walletModel({
        riderProfileId: new Types.ObjectId(riderProfileId),
        walletBalance: 0,
        currency: 'NGN',
        isVerified: false,
      });
      await wallet.save();
    }

    return wallet;
  }

  /**
   * Get wallet by rider profile ID
   */
  async findByRiderProfileId(
    riderProfileId: string,
  ): Promise<RiderWalletDocument | null> {
    this.validateObjectId(riderProfileId, 'riderProfileId');
    return this.walletModel
      .findOne({ riderProfileId: new Types.ObjectId(riderProfileId) })
      .exec();
  }

  /**
   * Get wallet by rider profile ID or throw error
   */
  async findByRiderProfileIdOrThrow(
    riderProfileId: string,
  ): Promise<RiderWalletDocument> {
    const wallet = await this.findByRiderProfileId(riderProfileId);
    if (!wallet) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'WALLET_NOT_FOUND',
          message: 'Wallet not found for this rider',
        },
      });
    }
    return wallet;
  }

  /**
   * Credit wallet (add amount)
   */
  async creditWallet(
    riderProfileId: string,
    amount: number,
  ): Promise<RiderWalletDocument> {
    this.validateObjectId(riderProfileId, 'riderProfileId');

    if (amount <= 0) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'INVALID_AMOUNT',
          message: 'Amount must be greater than 0',
        },
      });
    }

    const wallet = await this.findOrCreate(riderProfileId);
    wallet.walletBalance = (wallet.walletBalance || 0) + amount;
    return wallet.save();
  }

  /**
   * Debit wallet (subtract amount)
   */
  async debitWallet(
    riderProfileId: string,
    amount: number,
  ): Promise<RiderWalletDocument> {
    this.validateObjectId(riderProfileId, 'riderProfileId');

    if (amount <= 0) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'INVALID_AMOUNT',
          message: 'Amount must be greater than 0',
        },
      });
    }

    const wallet = await this.findByRiderProfileIdOrThrow(riderProfileId);

    if ((wallet.walletBalance || 0) < amount) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'INSUFFICIENT_BALANCE',
          message: 'Insufficient wallet balance',
        },
      });
    }

    wallet.walletBalance = (wallet.walletBalance || 0) - amount;
    return wallet.save();
  }

  /**
   * Update payment details
   */
  async updatePaymentDetails(
    riderProfileId: string,
    paymentDetails: {
      paystackRecipientCode?: string;
      accountNumber?: string;
      bankCode?: string;
      bankName?: string;
      accountName?: string;
      isVerified?: boolean;
    },
  ): Promise<RiderWalletDocument> {
    const wallet = await this.findByRiderProfileIdOrThrow(riderProfileId);

    if (paymentDetails.paystackRecipientCode !== undefined) {
      wallet.paystackRecipientCode = paymentDetails.paystackRecipientCode;
    }
    if (paymentDetails.accountNumber !== undefined) {
      wallet.accountNumber = paymentDetails.accountNumber;
    }
    if (paymentDetails.bankCode !== undefined) {
      wallet.bankCode = paymentDetails.bankCode;
    }
    if (paymentDetails.bankName !== undefined) {
      wallet.bankName = paymentDetails.bankName;
    }
    if (paymentDetails.accountName !== undefined) {
      wallet.accountName = paymentDetails.accountName;
    }
    if (paymentDetails.isVerified !== undefined) {
      wallet.isVerified = paymentDetails.isVerified;
    }

    return wallet.save();
  }

  /**
   * Get all wallets (for admin)
   */
  async findAll(limit: number = 100): Promise<RiderWalletDocument[]> {
    return this.walletModel.find().limit(limit).exec();
  }
}

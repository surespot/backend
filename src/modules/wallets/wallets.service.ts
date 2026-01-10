import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WalletsRepository } from './wallets.repository';
import { TransactionsRepository } from '../transactions/transactions.repository';
import { TransactionsService } from '../transactions/transactions.service';
import { OrdersRepository } from '../orders/orders.repository';
import { RidersRepository } from '../riders/riders.repository';
import {
  TransactionType,
  TransactionStatus,
  PaymentProvider,
} from '../transactions/schemas/transaction.schema';
import { OrderStatus } from '../orders/schemas/order.schema';

@Injectable()
export class WalletsService {
  private readonly logger = new Logger(WalletsService.name);
  private readonly paystackSecretKey: string;
  private readonly paystackBaseUrl = 'https://api.paystack.co';

  constructor(
    private readonly walletsRepository: WalletsRepository,
    private readonly transactionsRepository: TransactionsRepository,
    private readonly transactionsService: TransactionsService,
    private readonly ordersRepository: OrdersRepository,
    private readonly ridersRepository: RidersRepository,
    private readonly configService: ConfigService,
  ) {
    this.paystackSecretKey =
      this.configService.get<string>('PAYSTACK_SECRET_KEY') || '';
  }

  /**
   * Process daily earnings for all riders (runs at 10pm)
   * Credits wallets with earnings from completed deliveries today
   */
  async processDailyEarnings(): Promise<{
    processed: number;
    totalCredited: number;
    errors: string[];
  }> {
    this.logger.log('Starting daily earnings processing...');

    // Get all delivered orders from today, grouped by rider
    const ordersByRider = await this.ordersRepository.getTodayEarningsByRider();

    let processed = 0;
    let totalCredited = 0;
    const errors: string[] = [];

    for (const riderEarnings of ordersByRider) {
      const riderProfileId = riderEarnings.riderProfileId;
      const earnings = riderEarnings.totalEarnings;
      const orderCount = riderEarnings.orderCount;

      if (earnings <= 0) {
        continue;
      }

      try {
        // Credit wallet
        await this.walletsRepository.creditWallet(riderProfileId, earnings);

        // Create transaction record
        const reference = `EARN-${Date.now()}-${riderProfileId.substring(0, 8)}`;
        await this.transactionsRepository.create({
          riderProfileId,
          type: TransactionType.RIDER_EARNING,
          amount: earnings,
          paymentMethod: 'daily_earnings',
          provider: PaymentProvider.PAYSTACK,
          reference,
          status: TransactionStatus.SUCCESS,
        });

        processed++;
        totalCredited += earnings;

        this.logger.log(
          `Credited ₦${(earnings / 100).toFixed(2)} to rider ${riderProfileId} (${orderCount} orders)`,
        );
      } catch (error) {
        const errorMsg = `Failed to process earnings for rider ${riderProfileId}: ${error.message}`;
        errors.push(errorMsg);
        this.logger.error(errorMsg, error);
      }
    }

    this.logger.log(
      `Daily earnings processing completed: ${processed} riders processed, ₦${(totalCredited / 100).toFixed(2)} total credited`,
    );

    return {
      processed,
      totalCredited,
      errors,
    };
  }

  /**
   * Get wallet balance for a rider
   */
  async getWalletBalance(riderProfileId: string): Promise<{
    walletBalance: number;
    formattedBalance: string;
    currency: string;
    isVerified: boolean;
  }> {
    const wallet = await this.walletsRepository.findOrCreate(riderProfileId);

    return {
      walletBalance: wallet.walletBalance || 0,
      formattedBalance: `₦${((wallet.walletBalance || 0) / 100).toLocaleString('en-NG')}`,
      currency: wallet.currency || 'NGN',
      isVerified: wallet.isVerified || false,
    };
  }

  /**
   * Get wallet transaction history
   */
  async getWalletTransactions(
    riderProfileId: string,
    limit: number = 50,
  ): Promise<any[]> {
    const transactions =
      await this.transactionsRepository.findByRiderProfileId(
        riderProfileId,
        limit,
      );

    return transactions.map((t) => ({
      id: t._id.toString(),
      type: t.type,
      amount: t.amount,
      formattedAmount: `₦${(t.amount / 100).toLocaleString('en-NG')}`,
      status: t.status,
      reference: t.reference,
      createdAt: t.createdAt?.toISOString(),
      orderId: t.orderId?.toString(),
    }));
  }

  /**
   * Create Paystack transfer recipient
   */
  async createTransferRecipient(
    riderProfileId: string,
    accountNumber: string,
    bankCode: string,
    accountName: string,
  ): Promise<{
    recipientCode: string;
    accountNumber: string;
    bankCode: string;
    bankName: string;
    accountName: string;
  }> {
    // Ensure wallet exists
    await this.walletsRepository.findOrCreate(riderProfileId);

    try {
      // Call Paystack to create transfer recipient
      const response = await fetch(
        `${this.paystackBaseUrl}/transferrecipient`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.paystackSecretKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: 'nuban',
            name: accountName,
            account_number: accountNumber,
            bank_code: bankCode,
            currency: 'NGN',
          }),
        },
      );

      const data = await response.json();

      if (!data.status) {
        throw new BadRequestException({
          success: false,
          error: {
            code: 'PAYSTACK_RECIPIENT_CREATION_FAILED',
            message: data.message || 'Failed to create transfer recipient',
          },
        });
      }

      const recipient = data.data;

      // Update wallet with payment details
      await this.walletsRepository.updatePaymentDetails(riderProfileId, {
        paystackRecipientCode: recipient.recipient_code,
        accountNumber: recipient.details.account_number,
        bankCode: recipient.details.bank_code,
        bankName: recipient.details.bank_name,
        accountName: recipient.details.account_name,
        isVerified: true,
      });

      this.logger.log(
        `Transfer recipient created for rider ${riderProfileId}: ${recipient.recipient_code}`,
      );

      return {
        recipientCode: recipient.recipient_code,
        accountNumber: recipient.details.account_number,
        bankCode: recipient.details.bank_code,
        bankName: recipient.details.bank_name,
        accountName: recipient.details.account_name,
      };
    } catch (error) {
      this.logger.error(
        `Failed to create transfer recipient for rider ${riderProfileId}`,
        error,
      );

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException({
        success: false,
        error: {
          code: 'PAYSTACK_RECIPIENT_CREATION_FAILED',
          message: 'Failed to create transfer recipient',
        },
      });
    }
  }

  /**
   * Initiate transfer to rider's bank account
   */
  async initiateWithdrawal(
    riderProfileId: string,
    amount: number,
  ): Promise<{
    transferCode: string;
    reference: string;
    amount: number;
    status: string;
  }> {
    const wallet = await this.walletsRepository.findByRiderProfileIdOrThrow(
      riderProfileId,
    );

    if (!wallet.paystackRecipientCode) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'PAYMENT_DETAILS_NOT_SET',
          message: 'Payment details not set. Please add bank account details first.',
        },
      });
    }

    if (amount <= 0) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'INVALID_AMOUNT',
          message: 'Amount must be greater than 0',
        },
      });
    }

    // Check balance
    if ((wallet.walletBalance || 0) < amount) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'INSUFFICIENT_BALANCE',
          message: 'Insufficient wallet balance',
        },
      });
    }

    try {
      // Generate unique reference
      const reference = `WTH-${Date.now()}-${riderProfileId.substring(0, 8)}`;

      // Call Paystack to initiate transfer
      const response = await fetch(`${this.paystackBaseUrl}/transfer`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.paystackSecretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          source: 'balance',
          amount: amount, // Amount in kobo
          recipient: wallet.paystackRecipientCode,
          reference,
          reason: 'Rider withdrawal',
        }),
      });

      const data = await response.json();

      if (!data.status) {
        throw new BadRequestException({
          success: false,
          error: {
            code: 'PAYSTACK_TRANSFER_FAILED',
            message: data.message || 'Failed to initiate transfer',
          },
        });
      }

      const transfer = data.data;

      // Debit wallet immediately (Paystack will handle the actual transfer)
      await this.walletsRepository.debitWallet(riderProfileId, amount);

      // Create transaction record
      await this.transactionsRepository.create({
        riderProfileId,
        type: TransactionType.RIDER_WITHDRAWAL,
        amount: amount,
        paymentMethod: 'bank_transfer',
        provider: PaymentProvider.PAYSTACK,
        reference: transfer.reference || reference,
        status:
          transfer.status === 'success'
            ? TransactionStatus.SUCCESS
            : TransactionStatus.PENDING,
        providerResponse: transfer,
      });

      this.logger.log(
        `Withdrawal initiated for rider ${riderProfileId}: ₦${(amount / 100).toFixed(2)}`,
      );

      return {
        transferCode: transfer.transfer_code,
        reference: transfer.reference || reference,
        amount: amount,
        status: transfer.status,
      };
    } catch (error) {
      this.logger.error(
        `Failed to initiate withdrawal for rider ${riderProfileId}`,
        error,
      );

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException({
        success: false,
        error: {
          code: 'PAYSTACK_TRANSFER_FAILED',
          message: 'Failed to initiate transfer',
        },
      });
    }
  }

  /**
   * Get wallet details (for admin)
   */
  async getWalletDetails(riderProfileId: string): Promise<any> {
    const wallet = await this.walletsRepository.findByRiderProfileIdOrThrow(
      riderProfileId,
    );
    const rider = await this.ridersRepository.findById(riderProfileId);

    return {
      riderProfileId: wallet.riderProfileId.toString(),
      riderName: rider
        ? `${rider.firstName || ''} ${rider.lastName || ''}`.trim()
        : 'Unknown',
      walletBalance: wallet.walletBalance || 0,
      formattedBalance: `₦${((wallet.walletBalance || 0) / 100).toLocaleString('en-NG')}`,
      currency: wallet.currency || 'NGN',
      paystackRecipientCode: wallet.paystackRecipientCode,
      accountNumber: wallet.accountNumber,
      bankCode: wallet.bankCode,
      bankName: wallet.bankName,
      accountName: wallet.accountName,
      isVerified: wallet.isVerified || false,
      createdAt: wallet.createdAt?.toISOString(),
      updatedAt: wallet.updatedAt?.toISOString(),
    };
  }

  /**
   * List all wallets (for admin)
   */
  async listAllWallets(limit: number = 100): Promise<any[]> {
    const wallets = await this.walletsRepository.findAll(limit);

    return Promise.all(
      wallets.map(async (wallet) => {
        const rider = await this.ridersRepository.findById(
          wallet.riderProfileId.toString(),
        );

        return {
          riderProfileId: wallet.riderProfileId.toString(),
          riderName: rider
            ? `${rider.firstName || ''} ${rider.lastName || ''}`.trim()
            : 'Unknown',
          walletBalance: wallet.walletBalance || 0,
          formattedBalance: `₦${((wallet.walletBalance || 0) / 100).toLocaleString('en-NG')}`,
          currency: wallet.currency || 'NGN',
          isVerified: wallet.isVerified || false,
        };
      }),
    );
  }
}

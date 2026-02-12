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
import {
  NotificationChannel,
  NotificationType,
} from '../notifications/schemas/notification.schema';
import { NotificationsService } from '../notifications/notifications.service';

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
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService,
  ) {
    this.paystackSecretKey =
      this.configService.get<string>('PAYSTACK_SECRET_KEY') || '';
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
   * Get wallet transactions with filtering and pagination
   */
  async getWalletTransactionsWithFilters(
    riderProfileId: string,
    options: {
      page?: number;
      limit?: number;
      type?: 'earned' | 'withdrew' | 'all';
      status?: 'completed' | 'pending' | 'failed' | 'all';
      period?: 'this-month' | 'last-month' | 'this-year' | 'all-time';
    } = {},
  ): Promise<{
    transactions: any[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  }> {
    // Map frontend type to TransactionType
    let transactionType: TransactionType | undefined;
    if (options.type === 'earned') {
      transactionType = TransactionType.RIDER_EARNING;
    } else if (options.type === 'withdrew') {
      transactionType = TransactionType.RIDER_WITHDRAWAL;
    }

    // Map frontend status to TransactionStatus
    let transactionStatus: TransactionStatus | undefined;
    if (options.status === 'completed') {
      transactionStatus = TransactionStatus.SUCCESS;
    } else if (options.status === 'pending') {
      transactionStatus = TransactionStatus.PENDING;
    } else if (options.status === 'failed') {
      transactionStatus = TransactionStatus.FAILED;
    }

    // Calculate date range based on period
    let startDate: Date | undefined;
    let endDate: Date | undefined;
    const now = new Date();

    if (options.period === 'this-month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    } else if (options.period === 'last-month') {
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    } else if (options.period === 'this-year') {
      startDate = new Date(now.getFullYear(), 0, 1);
      endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
    }

    const result = await this.transactionsRepository.findByRiderProfileIdWithFilters(
      riderProfileId,
      {
        page: options.page || 1,
        limit: options.limit || 20,
        type: transactionType,
        status: transactionStatus,
        startDate,
        endDate,
      },
    );

    const transactions = result.transactions.map((t) => ({
      id: t._id.toString(),
      type: t.type === TransactionType.RIDER_EARNING ? 'earned' : 'withdrew',
      amount: t.amount,
      formattedAmount: `₦${(t.amount / 100).toLocaleString('en-NG')}`,
      status:
        t.status === TransactionStatus.SUCCESS
          ? 'completed'
          : t.status === TransactionStatus.PENDING
            ? 'pending'
            : 'failed',
      reference: t.reference,
      createdAt: t.createdAt?.toISOString(),
      orderId: t.orderId?.toString(),
      description: this.getTransactionDescription(t),
    }));

    return {
      transactions,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
        hasNext: result.page < result.totalPages,
        hasPrev: result.page > 1,
      },
    };
  }

  /**
   * Credit rider earnings immediately for a delivered order
   */
  async creditRiderEarningForOrder(params: {
    riderProfileId: string;
    orderId: string;
    orderNumber: string;
    amount: number; // in kobo
  }): Promise<void> {
    const { riderProfileId, orderId, orderNumber, amount } = params;

    if (amount <= 0) {
      this.logger.debug(
        `Skipping rider earning credit for order ${orderId} - non-positive amount: ${amount}`,
      );
      return;
    }

    // Credit wallet balance
    await this.walletsRepository.creditWallet(riderProfileId, amount);

    // Create transaction record (initially pending)
    const reference = `EARN-${orderNumber}-${Date.now()}`;
    const transaction = await this.transactionsRepository.create({
      riderProfileId,
      orderId,
      type: TransactionType.RIDER_EARNING,
      amount,
      paymentMethod: 'per_delivery',
      provider: PaymentProvider.PAYSTACK,
      reference,
    });

    // Mark transaction as successful
    await this.transactionsRepository.updateStatus(
      transaction._id.toString(),
      TransactionStatus.SUCCESS,
    );

    this.logger.log(
      `Credited ₦${(amount / 100).toFixed(2)} to rider ${riderProfileId} for order ${orderId}`,
    );

    // Notify rider about wallet credit (non-blocking)
    try {
      const rider = await this.ridersRepository.findById(riderProfileId);
      if (rider && rider.userId) {
        await this.notificationsService.queueNotification(
          rider.userId.toString(),
          NotificationType.PAYMENT_SUCCESS,
          'Wallet Credited',
          `You received ₦${(amount / 100).toFixed(2)} for order ${orderNumber}.`,
          {
            orderId,
            orderNumber,
            amount,
            source: 'wallet_credit',
          },
          [NotificationChannel.IN_APP, NotificationChannel.PUSH],
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to send wallet credit notification for rider ${riderProfileId}`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Get transaction description based on type
   */
  private getTransactionDescription(t: any): string {
    if (t.type === TransactionType.RIDER_EARNING) {
      return 'Earnings from delivery';
    } else if (t.type === TransactionType.RIDER_WITHDRAWAL) {
      return 'Withdrawal to bank account';
    }
    return 'Transaction';
  }

  /**
   * Get wallet summary/statistics
   */
  async getWalletSummary(
    riderProfileId: string,
    period: 'this-month' | 'last-month' | 'this-year' | 'all-time' = 'all-time',
  ): Promise<{
    totalEarnings: number;
    formattedTotalEarnings: string;
    totalWithdrawals: number;
    formattedTotalWithdrawals: string;
    availableBalance: number;
    formattedAvailableBalance: string;
    period: string;
  }> {
    // Get current wallet balance
    const wallet = await this.walletsRepository.findOrCreate(riderProfileId);
    const availableBalance = wallet.walletBalance || 0;

    // Calculate date range based on period
    let startDate: Date | undefined;
    let endDate: Date | undefined;
    const now = new Date();

    if (period === 'this-month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    } else if (period === 'last-month') {
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    } else if (period === 'this-year') {
      startDate = new Date(now.getFullYear(), 0, 1);
      endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
    }
    // 'all-time' means no date filter

    const stats = await this.transactionsRepository.getRiderTransactionStats(
      riderProfileId,
      startDate,
      endDate,
    );

    return {
      totalEarnings: stats.totalEarnings,
      formattedTotalEarnings: `₦${(stats.totalEarnings / 100).toLocaleString('en-NG')}`,
      totalWithdrawals: stats.totalWithdrawals,
      formattedTotalWithdrawals: `₦${(stats.totalWithdrawals / 100).toLocaleString('en-NG')}`,
      availableBalance,
      formattedAvailableBalance: `₦${(availableBalance / 100).toLocaleString('en-NG')}`,
      period,
    };
  }

  /**
   * Get payment details (bank account information)
   */
  async getPaymentDetails(riderProfileId: string): Promise<{
    recipientCode?: string;
    accountNumber?: string;
    bankCode?: string;
    bankName?: string;
    accountName?: string;
    isVerified: boolean;
  } | null> {
    const wallet = await this.walletsRepository.findByRiderProfileId(
      riderProfileId,
    );

    if (!wallet || !wallet.paystackRecipientCode) {
      return null;
    }

    return {
      recipientCode: wallet.paystackRecipientCode,
      accountNumber: wallet.accountNumber,
      bankCode: wallet.bankCode,
      bankName: wallet.bankName,
      accountName: wallet.accountName,
      isVerified: wallet.isVerified || false,
    };
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

      // Notify rider about withdrawal (non-blocking)
      try {
        const rider = await this.ridersRepository.findById(riderProfileId);
        if (rider && rider.userId) {
          await this.notificationsService.queueNotification(
            rider.userId.toString(),
            NotificationType.GENERAL,
            'Withdrawal Initiated',
            `Your withdrawal of ₦${(amount / 100).toFixed(2)} has been initiated to your bank account.`,
            {
              amount,
              reference: transfer.reference || reference,
              transferCode: transfer.transfer_code,
              source: 'wallet_withdrawal',
            },
            [NotificationChannel.IN_APP, NotificationChannel.PUSH],
          );
        }
      } catch (notifyError) {
        this.logger.error(
          `Failed to send withdrawal notification for rider ${riderProfileId}`,
          notifyError instanceof Error
            ? notifyError.message
            : String(notifyError),
        );
      }

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

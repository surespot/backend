import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TransactionsRepository } from './transactions.repository';
import {
  TransactionDocument,
  TransactionStatus,
  PaymentProvider,
  TransactionType,
} from './schemas/transaction.schema';
import { OrdersService } from '../orders/orders.service';
import { PaymentStatus } from '../orders/schemas/order.schema';
import * as crypto from 'crypto';

export interface InitializePaymentResult {
  transactionId: string;
  reference: string;
  authorizationUrl: string;
  accessCode: string;
}

export interface TransactionResponse {
  id: string;
  orderId?: string;
  userId?: string;
  riderProfileId?: string;
  type?: string;
  amount: number;
  formattedAmount: string;
  currency: string;
  paymentMethod: string;
  provider: PaymentProvider;
  status: TransactionStatus;
  reference?: string;
  authorizationUrl?: string;
  paidAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);
  private readonly paystackSecretKey: string;
  private readonly paystackBaseUrl = 'https://api.paystack.co';

  constructor(
    private readonly transactionsRepository: TransactionsRepository,
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => OrdersService))
    private readonly ordersService: OrdersService,
  ) {
    this.paystackSecretKey =
      this.configService.get<string>('PAYSTACK_SECRET_KEY') || '';
  }

  private formatPrice(amount: number): string {
    if (amount === 0) return 'Free';
    const naira = amount / 100;
    return `₦${naira.toLocaleString('en-NG')}`;
  }

  /**
   * Initialize a Paystack transaction
   * @param orderId - Optional order ID (order may not exist yet)
   * @param userId - User ID
   * @param email - Customer email
   * @param amount - Amount in kobo
   * @param paymentMethod - Payment method (default: 'card')
   * @param metadata - Additional metadata
   */
  async initializePayment(
    orderId: string | undefined,
    userId: string,
    email: string,
    amount: number,
    paymentMethod: string = 'card',
    metadata?: Record<string, unknown>,
  ): Promise<{ success: boolean; data: InitializePaymentResult }> {
    // Generate unique reference
    const reference = `TXN-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    try {
      // Call Paystack initialize endpoint
      const response = await fetch(
        `${this.paystackBaseUrl}/transaction/initialize`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.paystackSecretKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email,
            amount, // Amount in kobo
            reference,
            callback_url: 'https://api.surespot.app/checkout/success',
            metadata: {
              ...(orderId && { orderId }),
              userId,
              ...metadata,
            },
          }),
        },
      );

      const data = await response.json();

      if (!data.status) {
        throw new BadRequestException({
          success: false,
          error: {
            code: 'PAYMENT_INITIALIZATION_FAILED',
            message: data.message || 'Failed to initialize payment',
          },
        });
      }

      // Create transaction record
      const transaction = await this.transactionsRepository.create({
        orderId,
        userId,
        type: TransactionType.PAYMENT,
        amount,
        paymentMethod,
        provider: PaymentProvider.PAYSTACK,
        reference,
        authorizationUrl: data.data.authorization_url,
        accessCode: data.data.access_code,
      });

      this.logger.log(
        `Payment initialized ${orderId ? `for order ${orderId}` : ''}, reference: ${reference}`,
      );

      return {
        success: true,
        data: {
          transactionId: transaction._id.toString(),
          reference,
          authorizationUrl: data.data.authorization_url,
          accessCode: data.data.access_code,
        },
      };
    } catch (error) {
      this.logger.error(
        `Failed to initialize payment ${orderId ? `for order ${orderId}` : ''}`,
        error,
      );

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException({
        success: false,
        error: {
          code: 'PAYMENT_INITIALIZATION_FAILED',
          message: 'Failed to initialize payment',
        },
      });
    }
  }

  /**
   * Link transaction to order after order creation
   */
  async linkTransactionToOrder(
    reference: string,
    orderId: string,
  ): Promise<TransactionResponse> {
    const transaction =
      await this.transactionsRepository.findByReference(reference);

    if (!transaction) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'TRANSACTION_NOT_FOUND',
          message: 'Transaction not found',
        },
      });
    }

    // Update transaction with orderId
    transaction.orderId = transaction.orderId || (orderId as any);
    await transaction.save();

    this.logger.log(`Transaction ${reference} linked to order ${orderId}`);

    return this.formatTransaction(transaction);
  }

  /**
   * Verify a Paystack transaction
   */
  async verifyPayment(reference: string): Promise<{
    success: boolean;
    transaction: TransactionResponse;
    paystackData?: Record<string, unknown>;
  }> {
    try {
      // Call Paystack verify endpoint
      const response = await fetch(
        `${this.paystackBaseUrl}/transaction/verify/${reference}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.paystackSecretKey}`,
          },
        },
      );

      const data = await response.json();

      if (!data.status) {
        throw new BadRequestException({
          success: false,
          error: {
            code: 'PAYMENT_VERIFICATION_FAILED',
            message: data.message || 'Failed to verify payment',
          },
        });
      }

      const paystackData = data.data;
      const isSuccess = paystackData.status === 'success';

      // Update transaction status
      const status = isSuccess
        ? TransactionStatus.SUCCESS
        : TransactionStatus.FAILED;
      const transaction = await this.transactionsRepository.updateByReference(
        reference,
        status,
        {
          providerResponse: paystackData,
          paidAt: isSuccess ? new Date(paystackData.paid_at) : undefined,
          failureReason: !isSuccess ? paystackData.gateway_response : undefined,
        },
      );

      if (!transaction) {
        throw new NotFoundException({
          success: false,
          error: {
            code: 'TRANSACTION_NOT_FOUND',
            message: 'Transaction not found',
          },
        });
      }

      // Update order payment status if order exists
      try {
        await this.ordersService.updatePaymentStatusByReference(
          reference,
          isSuccess ? PaymentStatus.PAID : PaymentStatus.FAILED,
        );
      } catch (error) {
        // Order might not exist yet, that's okay
        this.logger.warn(
          `Could not update order payment status for reference ${reference}: ${error}`,
        );
      }

      this.logger.log(
        `Payment ${isSuccess ? 'successful' : 'failed'} for reference ${reference}`,
      );

      return {
        success: isSuccess,
        transaction: this.formatTransaction(transaction),
        paystackData,
      };
    } catch (error) {
      this.logger.error(
        `Failed to verify payment for reference ${reference}`,
        error,
      );

      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      throw new BadRequestException({
        success: false,
        error: {
          code: 'PAYMENT_VERIFICATION_FAILED',
          message: 'Failed to verify payment',
        },
      });
    }
  }

  /**
   * Verify Paystack webhook signature
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    if (!this.paystackSecretKey) {
      this.logger.warn(
        'PAYSTACK_SECRET_KEY not configured, skipping signature verification',
      );
      return true; // Allow in development
    }

    const hash = crypto
      .createHmac('sha512', this.paystackSecretKey)
      .update(payload)
      .digest('hex');

    return hash === signature;
  }

  /**
   * Handle Paystack webhook
   */
  async handleWebhook(
    event: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    this.logger.log(`Received Paystack webhook: ${event}`);

    switch (event) {
      case 'charge.success':
        await this.handleChargeSuccess(data);
        break;
      case 'charge.failed':
        await this.handleChargeFailed(data);
        break;
      case 'refund.processed':
        await this.handleRefundProcessed(data);
        break;
      default:
        this.logger.warn(`Unhandled webhook event: ${event}`);
    }
  }

  private async handleChargeSuccess(
    data: Record<string, unknown>,
  ): Promise<void> {
    const reference = data.reference as string;

    const transaction = await this.transactionsRepository.updateByReference(
      reference,
      TransactionStatus.SUCCESS,
      {
        providerResponse: data,
        paidAt: new Date(),
      },
    );

    if (transaction) {
      this.logger.log(`Transaction ${reference} marked as successful`);

      // Update order payment status if order exists
      try {
        await this.ordersService.updatePaymentStatusByReference(
          reference,
          PaymentStatus.PAID,
        );
      } catch (error) {
        // Order might not exist yet, that's okay
        this.logger.warn(
          `Could not update order payment status for reference ${reference}: ${error}`,
        );
      }
    }
  }

  private async handleChargeFailed(
    data: Record<string, unknown>,
  ): Promise<void> {
    const reference = data.reference as string;
    const gatewayResponse = data.gateway_response as string;

    await this.transactionsRepository.updateByReference(
      reference,
      TransactionStatus.FAILED,
      {
        providerResponse: data,
        failureReason: gatewayResponse,
      },
    );

    this.logger.log(
      `Transaction ${reference} marked as failed: ${gatewayResponse}`,
    );

    // Update order payment status if order exists
    try {
      await this.ordersService.updatePaymentStatusByReference(
        reference,
        PaymentStatus.FAILED,
      );
    } catch (error) {
      // Order might not exist yet, that's okay
      this.logger.warn(
        `Could not update order payment status for reference ${reference}: ${error}`,
      );
    }
  }

  private async handleRefundProcessed(
    data: Record<string, unknown>,
  ): Promise<void> {
    const reference = (data.transaction as Record<string, unknown>)
      ?.reference as string;

    if (reference) {
      const transaction = await this.transactionsRepository.updateByReference(
        reference,
        TransactionStatus.REFUNDED,
        {
          providerResponse: data,
          refundedAt: new Date(),
        },
      );

      if (transaction) {
        this.logger.log(`Transaction ${reference} marked as refunded`);

        // Update order payment status if order exists
        try {
          await this.ordersService.updatePaymentStatusByReference(
            reference,
            PaymentStatus.REFUNDED,
          );
        } catch (error) {
          // Order might not exist yet, that's okay
          this.logger.warn(
            `Could not update order payment status for reference ${reference}: ${error}`,
          );
        }
      }
    }
  }

  /**
   * Get transaction by ID
   */
  async getTransactionById(id: string): Promise<TransactionResponse> {
    const transaction = await this.transactionsRepository.findById(id);

    if (!transaction) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'TRANSACTION_NOT_FOUND',
          message: 'Transaction not found',
        },
      });
    }

    return this.formatTransaction(transaction);
  }

  /**
   * Get transaction by reference
   */
  async getTransactionByReference(
    reference: string,
  ): Promise<TransactionResponse> {
    const transaction =
      await this.transactionsRepository.findByReference(reference);

    if (!transaction) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'TRANSACTION_NOT_FOUND',
          message: 'Transaction not found',
        },
      });
    }

    return this.formatTransaction(transaction);
  }

  /**
   * Get transaction by order ID
   */
  async getTransactionByOrderId(
    orderId: string,
  ): Promise<TransactionResponse | null> {
    const transaction =
      await this.transactionsRepository.findByOrderId(orderId);
    return transaction ? this.formatTransaction(transaction) : null;
  }

  /**
   * Get user's transactions
   */
  async getUserTransactions(
    userId: string,
    limit: number = 20,
  ): Promise<TransactionResponse[]> {
    const transactions = await this.transactionsRepository.findByUserId(
      userId,
      limit,
    );
    return transactions.map((t) => this.formatTransaction(t));
  }

  private formatTransaction(
    transaction: TransactionDocument,
  ): TransactionResponse {
    return {
      id: transaction._id.toString(),
      orderId: transaction.orderId?.toString(),
      userId: transaction.userId?.toString(),
      riderProfileId: transaction.riderProfileId?.toString(),
      type: transaction.type,
      amount: transaction.amount,
      formattedAmount: this.formatPrice(transaction.amount),
      currency: transaction.currency,
      paymentMethod: transaction.paymentMethod,
      provider: transaction.provider,
      status: transaction.status,
      reference: transaction.reference,
      authorizationUrl: transaction.authorizationUrl,
      paidAt: transaction.paidAt?.toISOString(),
      createdAt: transaction.createdAt?.toISOString(),
      updatedAt: transaction.updatedAt?.toISOString(),
    };
  }
}

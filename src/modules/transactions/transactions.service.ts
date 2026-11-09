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
import { NotificationsService } from '../notifications/notifications.service';
import { WalletsRepository } from '../wallets/wallets.repository';
import * as crypto from 'crypto';

// Paystack statuses that mean the payment will not complete. Anything else that is
// not 'success' (pending, ongoing, processing, queued) is still in flight.
const FINAL_FAILURE_STATUSES = ['failed', 'reversed', 'abandoned'];

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
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
    @Inject(forwardRef(() => OrdersService))
    private readonly ordersService: OrdersService,
    private readonly walletsRepository: WalletsRepository,
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
    const reference = `TXN-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;

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
              ...metadata,
              ...(orderId && { orderId }),
              userId,
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
    userId: string,
  ): Promise<TransactionResponse> {
    const transaction = await this.assertReferenceUsableBy(
      reference,
      userId,
      orderId,
    );

    // Update transaction with orderId
    transaction.orderId = transaction.orderId || (orderId as any);
    await transaction.save();

    this.logger.log(`Transaction ${reference} linked to order ${orderId}`);

    return this.formatTransaction(transaction);
  }

  /**
   * Ensure a payment reference belongs to this user and is not already attached
   * to a different order. Returns the transaction.
   */
  async assertReferenceUsableBy(
    reference: string,
    userId: string,
    orderId?: string,
  ): Promise<TransactionDocument> {
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

    const ownedByUser = transaction.userId?.toString() === userId;
    const attachedElsewhere =
      !!transaction.orderId &&
      (!orderId || transaction.orderId.toString() !== orderId);

    if (
      transaction.type !== TransactionType.PAYMENT ||
      !ownedByUser ||
      attachedElsewhere
    ) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'PAYMENT_REFERENCE_INVALID',
          message: 'This payment reference cannot be used for this order',
        },
      });
    }

    return transaction;
  }

  /**
   * Fetch the authoritative state of a transaction from Paystack
   */
  private async fetchPaystackTransaction(
    reference: string,
  ): Promise<Record<string, any>> {
    const response = await fetch(
      `${this.paystackBaseUrl}/transaction/verify/${encodeURIComponent(reference)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.paystackSecretKey}`,
        },
      },
    );

    const data: { status: boolean; message?: string; data?: any } =
      await response.json();

    if (!data.status) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'PAYMENT_VERIFICATION_FAILED',
          message: data.message || 'Failed to verify payment',
        },
      });
    }

    return data.data;
  }

  /**
   * False when Paystack confirmed less than the order this reference is attached
   * to costs. Not-yet-attached references pass; they are re-checked once the order
   * exists (placeOrder verifies again after linking).
   */
  private async paidAmountCoversOrder(
    reference: string,
    paystackData: Record<string, any>,
  ): Promise<boolean> {
    const expected =
      await this.ordersService.getPaymentExpectationByReference(reference);
    if (!expected) return true;

    const paid = Number(paystackData.amount);
    const covered =
      paystackData.currency === 'NGN' &&
      Number.isFinite(paid) &&
      paid >= expected.total;

    if (!covered) {
      this.logger.error(
        `[PAYMENT_ALERT] Amount mismatch for reference ${reference}: Paystack confirmed ${paystackData.amount} ${paystackData.currency}, order ${expected.orderId} total is ${expected.total} NGN kobo. Order left unpaid; needs manual review/refund.`,
      );
    }
    return covered;
  }

  /**
   * Verify a Paystack transaction
   */
  async verifyPayment(reference: string): Promise<{
    success: boolean;
    /** True when Paystack has not reached a final state yet (nothing was changed) */
    pending?: boolean;
    transaction: TransactionResponse;
    paystackData?: Record<string, unknown>;
  }> {
    try {
      const paystackData = await this.fetchPaystackTransaction(reference);
      const isSuccess = paystackData.status === 'success';

      // pending / ongoing / processing / queued: the customer may still complete the
      // payment (bank transfer, USSD), so do not fail or cancel anything yet.
      if (!isSuccess && !FINAL_FAILURE_STATUSES.includes(paystackData.status)) {
        const existing =
          await this.transactionsRepository.findByReference(reference);
        if (!existing) {
          throw new NotFoundException({
            success: false,
            error: {
              code: 'TRANSACTION_NOT_FOUND',
              message: 'Transaction not found',
            },
          });
        }

        this.logger.log(
          `Payment for reference ${reference} is still ${paystackData.status} at Paystack, leaving it unresolved`,
        );

        return {
          success: false,
          pending: true,
          transaction: this.formatTransaction(existing),
          paystackData,
        };
      }

      if (isSuccess && !(await this.paidAmountCoversOrder(reference, paystackData))) {
        throw new BadRequestException({
          success: false,
          error: {
            code: 'PAYMENT_AMOUNT_MISMATCH',
            message:
              'The amount paid does not cover this order. Please contact support.',
          },
        });
      }

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
   * List supported banks from Paystack
   */
  async listBanks(params?: {
    country?: string;
    currency?: string;
    type?: string;
  }): Promise<Record<string, unknown>[]> {
    const country = params?.country ?? 'nigeria';
    const currency = params?.currency ?? 'NGN';
    const type = params?.type ?? 'nuban';

    try {
      const url = new URL(`${this.paystackBaseUrl}/bank`);
      url.searchParams.set('country', country);
      url.searchParams.set('currency', currency);
      url.searchParams.set('type', type);

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.paystackSecretKey}`,
        },
      });

      const data = (await response.json()) as {
        status: boolean;
        message?: string;
        data?: Record<string, unknown>[];
      };

      if (!data.status) {
        throw new BadRequestException({
          success: false,
          error: {
            code: 'BANK_LIST_FAILED',
            message: data.message || 'Failed to fetch bank list',
          },
        });
      }

      return data.data ?? [];
    } catch (error) {
      this.logger.error(
        'Failed to fetch bank list from Paystack',
        error instanceof Error ? error.message : String(error),
      );

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException({
        success: false,
        error: {
          code: 'BANK_LIST_FAILED',
          message: 'Failed to fetch bank list',
        },
      });
    }
  }

  /**
   * Verify bank account details via Paystack (/bank/resolve)
   */
  async verifyBankAccount(params: {
    accountNumber: string;
    bankCode: string;
  }): Promise<{
    status: 'valid' | 'invalid';
    accountName?: string;
    raw?: Record<string, unknown>;
    message?: string;
  }> {
    const { accountNumber, bankCode } = params;

    try {
      const url = new URL(`${this.paystackBaseUrl}/bank/resolve`);
      url.searchParams.set('account_number', accountNumber);
      url.searchParams.set('bank_code', bankCode);

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.paystackSecretKey}`,
        },
      });

      const data = (await response.json()) as {
        status: boolean;
        message?: string;
        data?: { account_name?: string } & Record<string, unknown>;
      };

      if (!data.status || !data.data) {
        const message = data.message || 'Bank account verification failed';
        this.logger.warn(
          `Bank account verification failed for ${accountNumber}/${bankCode}: ${message}`,
        );
        return {
          status: 'invalid',
          message,
          raw: data.data,
        };
      }

      return {
        status: 'valid',
        accountName: data.data.account_name,
        raw: data.data,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Error verifying bank account ${accountNumber}/${bankCode}`,
        message,
      );

      return {
        status: 'invalid',
        message,
      };
    }
  }

  /**
   * Request a refund for a successful Paystack transaction by reference.
   * This will:
   * - Check that the local transaction exists and is in SUCCESS state
   * - Call Paystack's /refund endpoint with the transaction reference
   * - Mark the local transaction (and any linked order) as REFUNDED
   */
  async requestRefund(
    reference: string,
    amountKobo?: number,
  ): Promise<{ success: boolean; data?: Record<string, unknown> }> {
    this.logger.log(`Requesting refund for transaction ${reference}`);

    // Find existing transaction
    const transaction =
      await this.transactionsRepository.findByReference(reference);

    if (!transaction) {
      this.logger.warn(
        `Cannot request refund - transaction not found for reference ${reference}`,
      );
      return {
        success: false,
        data: { error: 'Transaction not found' },
      };
    }

    if (transaction.status !== TransactionStatus.SUCCESS) {
      this.logger.warn(
        `Cannot request refund - transaction ${reference} is not in SUCCESS state (current: ${transaction.status})`,
      );
      return {
        success: false,
        data: { error: 'Transaction is not in a refundable state' },
      };
    }

    try {
      const body: Record<string, unknown> = {
        transaction: transaction.reference ?? reference,
      };

      if (typeof amountKobo === 'number' && Number.isFinite(amountKobo)) {
        body.amount = amountKobo;
      }

      const response = await fetch(`${this.paystackBaseUrl}/refund`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.paystackSecretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = (await response.json()) as {
        status: boolean;
        message?: string;
        data?: Record<string, unknown>;
      };

      if (!data.status) {
        this.logger.error(
          `Failed to request refund for ${reference}: ${
            data.message || 'Unknown error'
          }`,
        );
        throw new BadRequestException({
          success: false,
          error: {
            code: 'REFUND_FAILED',
            message: data.message || 'Failed to request refund',
          },
        });
      }

      // Mark transaction as refunded (idempotent with webhook handler)
      await this.transactionsRepository.updateByReference(
        reference,
        TransactionStatus.REFUNDED,
        {
          providerResponse: data.data,
          refundedAt: new Date(),
        },
      );

      // Store refundId on order for retry; paymentStatus stays PAID until refund.processed webhook
      const refundId =
        typeof data.data?.id === 'number' ? data.data.id : undefined;
      if (refundId) {
        try {
          await this.ordersService.updateOrderRefundIdByReference(
            reference,
            refundId,
          );
        } catch (err) {
          this.logger.warn(
            `Requested refund for ${reference} but could not update order refundId: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }

      this.logger.log(
        `Refund requested successfully for transaction ${reference}`,
      );

      return {
        success: true,
        data: data.data,
      };
    } catch (error) {
      this.logger.error(
        `Error while requesting refund for ${reference}`,
        error instanceof Error ? error.message : String(error),
      );

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException({
        success: false,
        error: {
          code: 'REFUND_FAILED',
          message: 'Failed to request refund',
        },
      });
    }
  }

  /**
   * Retry a refund with needs-attention status by providing the customer's bank account details.
   * Calls Paystack's POST /refund/retry_with_customer_details/{id}
   */
  async retryRefundWithBankDetails(
    refundId: number,
    refundAccountDetails: {
      currency: string;
      account_number: string;
      bank_id: string;
    },
  ): Promise<{ success: boolean; data?: Record<string, unknown> }> {
    this.logger.log(`Retrying refund ${refundId} with bank details`);

    try {
      const response = await fetch(
        `${this.paystackBaseUrl}/refund/retry_with_customer_details/${refundId}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.paystackSecretKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            refund_account_details: refundAccountDetails,
          }),
        },
      );

      const data = (await response.json()) as {
        status: boolean;
        message?: string;
        data?: Record<string, unknown>;
      };

      if (!data.status) {
        this.logger.error(
          `Failed to retry refund ${refundId}: ${data.message || 'Unknown error'}`,
        );
        throw new BadRequestException({
          success: false,
          error: {
            code: 'REFUND_RETRY_FAILED',
            message: data.message || 'Failed to retry refund',
          },
        });
      }

      this.logger.log(`Refund ${refundId} retried successfully`);

      return {
        success: true,
        data: data.data,
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(
        `Error while retrying refund ${refundId}`,
        error instanceof Error ? error.message : String(error),
      );
      throw new BadRequestException({
        success: false,
        error: {
          code: 'REFUND_RETRY_FAILED',
          message: 'Failed to retry refund',
        },
      });
    }
  }

  /**
   * Verify Paystack webhook signature
   */
  verifyWebhookSignature(payload: Buffer | string, signature: string): boolean {
    if (!this.paystackSecretKey) {
      // Fail closed: without the secret nothing can be authenticated
      this.logger.error(
        'PAYSTACK_SECRET_KEY not configured, rejecting webhook',
      );
      return false;
    }

    const expected = crypto
      .createHmac('sha512', this.paystackSecretKey)
      .update(payload)
      .digest();
    const received = Buffer.from(signature, 'hex');

    return (
      received.length === expected.length &&
      crypto.timingSafeEqual(received, expected)
    );
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
      case 'refund.needs-attention':
        await this.handleRefundNeedsAttention(data);
        break;
      case 'refund.pending':
        // Refund initiated but not yet settled — no action needed, refund.processed fires when done
        break;
      case 'transfer.success':
        await this.handleTransferSuccess(data);
        break;
      case 'transfer.failed':
      case 'transfer.reversed':
        await this.handleTransferFailed(data, event);
        break;
      default:
        this.logger.warn(`Unhandled webhook event: ${event}`);
    }
  }

  private async handleChargeSuccess(
    data: Record<string, unknown>,
  ): Promise<void> {
    const reference = data.reference;
    if (typeof reference !== 'string' || !reference) {
      this.logger.warn('charge.success webhook without a reference, ignoring');
      return;
    }

    // Never trust the payload: confirm the charge and its amount with Paystack
    const paystackData = await this.fetchPaystackTransaction(reference);
    if (paystackData.status !== 'success') {
      this.logger.warn(
        `charge.success webhook for ${reference} but Paystack reports status ${paystackData.status}, ignoring`,
      );
      return;
    }
    if (!(await this.paidAmountCoversOrder(reference, paystackData))) {
      return; // already alerted; retrying the webhook would not change the outcome
    }

    const session = await this.transactionsRepository.startSession();
    let transaction: Awaited<
      ReturnType<typeof this.transactionsRepository.updateByReference>
    > = null;
    try {
      await session.withTransaction(async () => {
        transaction = await this.transactionsRepository.updateByReference(
          reference,
          TransactionStatus.SUCCESS,
          {
            providerResponse: paystackData,
            paidAt: paystackData.paid_at
              ? new Date(paystackData.paid_at)
              : new Date(),
          },
          session,
        );

        if (transaction) {
          await this.ordersService.updatePaymentStatusByReference(
            reference,
            PaymentStatus.PAID,
            undefined,
            session,
          );
        }
      });
    } catch (error) {
      this.logger.error(
        `Failed to process charge.success webhook for reference ${reference}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    } finally {
      await session.endSession();
    }

    if (transaction) {
      this.logger.log(`Transaction ${reference} marked as successful`);
    }
  }

  private async handleTransferSuccess(
    data: Record<string, unknown>,
  ): Promise<void> {
    const reference = data.reference;
    if (typeof reference !== 'string' || !reference) return;

    const transaction = await this.transactionsRepository.transitionStatus(
      reference,
      [TransactionStatus.PENDING],
      TransactionStatus.SUCCESS,
      { providerResponse: data },
    );
    if (transaction) {
      this.logger.log(`Withdrawal ${reference} confirmed by Paystack`);
    }
  }

  private async handleTransferFailed(
    data: Record<string, unknown>,
    event: string,
  ): Promise<void> {
    const reference = data.reference;
    if (typeof reference !== 'string' || !reference) return;

    const transaction =
      await this.transactionsRepository.findByReference(reference);
    if (
      !transaction ||
      transaction.type !== TransactionType.RIDER_WITHDRAWAL ||
      !transaction.riderProfileId
    ) {
      return;
    }

    await this.releaseFailedWithdrawal(
      reference,
      transaction.riderProfileId.toString(),
      transaction.amount,
      `Paystack ${event}`,
    );
  }

  /**
   * Release a reserved withdrawal back to the rider's wallet. The
   * PENDING/SUCCESS -> FAILED transition is atomic, so retries and duplicate
   * webhooks credit at most once.
   */
  async releaseFailedWithdrawal(
    reference: string,
    riderProfileId: string,
    amount: number,
    reason: string,
  ): Promise<boolean> {
    const transitioned = await this.transactionsRepository.transitionStatus(
      reference,
      [TransactionStatus.PENDING, TransactionStatus.SUCCESS],
      TransactionStatus.FAILED,
      { failureReason: reason },
    );
    if (!transitioned) return false;

    await this.walletsRepository.creditWallet(riderProfileId, amount);
    this.logger.warn(
      `Withdrawal ${reference} failed (${reason}); ${amount} kobo returned to rider ${riderProfileId}`,
    );
    return true;
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
    // transaction_reference is the paymentIntentId on orders (Paystack format)
    const reference =
      (data.transaction_reference as string) ??
      ((data.transaction as Record<string, unknown>)?.reference as string);

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

        // Update order payment status and hasBeenRefunded if order exists
        try {
          await this.ordersService.updatePaymentStatusByReference(
            reference,
            PaymentStatus.REFUNDED,
          );
          await this.ordersService.updateOrderHasBeenRefundedByReference(
            reference,
          );
        } catch (error) {
          // Order might not exist yet, that's okay
          this.logger.warn(
            `Could not update order for reference ${reference}: ${error}`,
          );
        }
      }
    }
  }

  private async handleRefundNeedsAttention(
    data: Record<string, unknown>,
  ): Promise<void> {
    const refundId = data.id as number | undefined;
    const transactionData = data.transaction as
      | Record<string, unknown>
      | undefined;
    const reference = transactionData?.transaction_reference as
      | string
      | undefined;
    const domain = data.domain as string | undefined;
    const status = data.status as string | undefined;
    const amount =
      (transactionData?.amount as number) ?? (data.amount as number) ?? 0;
    const formattedAmount = amount ? this.formatPrice(amount) : 'N/A';

    const refundDetails = {
      refundId,
      reference: reference ?? 'Unknown',
      domain: domain ?? 'Unknown',
      status: status ?? 'needs-attention',
      amount,
      formattedAmount,
      rawData: data,
    };

    this.logger.warn(
      `Refund needs attention: reference=${reference}, domain=${domain}, amount=${formattedAmount}`,
    );

    // Store refundId on order for retry with bank details
    if (refundId != null && reference) {
      try {
        await this.ordersService.updateOrderRefundIdByReference(
          reference,
          refundId,
        );
      } catch (err) {
        this.logger.warn(
          `Could not update order refundId for reference ${reference}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    await this.notificationsService.notifyAdminsRefundNeedsAttention(
      refundDetails,
    );
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

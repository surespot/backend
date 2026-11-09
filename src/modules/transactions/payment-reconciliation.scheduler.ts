import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TransactionsService } from './transactions.service';
import { OrdersRepository } from '../orders/orders.repository';

// Orders older than this with paymentStatus=PENDING are eligible for reconciliation.
const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

@Injectable()
export class PaymentReconciliationScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(PaymentReconciliationScheduler.name);

  constructor(
    private readonly transactionsService: TransactionsService,
    private readonly ordersRepository: OrdersRepository,
  ) {}

  async onApplicationBootstrap() {
    await this.cleanupFailedPaymentOrders();
    await this.reconcilePendingPayments();
  }

  @Cron('*/15 * * * *') // every 15 minutes
  async reconcilePendingPayments() {
    const orders = await this.ordersRepository.findStalePendingCardOrders(
      STALE_THRESHOLD_MS,
    );

    if (orders.length === 0) {
      this.logger.log('reconcilePendingPayments: no stale orders found');
      return;
    }

    this.logger.log(
      `Reconciling ${orders.length} stale pending payment(s)...`,
    );

    let confirmed = 0;
    let failed = 0;
    let unknown = 0;

    for (const order of orders) {
      const ref = order.paymentIntentId as string;
      try {
        const result = await this.transactionsService.verifyPayment(ref);
        if (result.success) {
          confirmed++;
          this.logger.log(
            `Reconciled: order ${order.orderNumber} (${ref}) confirmed`,
          );
        } else if (result.pending) {
          unknown++;
          this.logger.log(
            `Order ${order.orderNumber} (${ref}) is still in flight at Paystack, will retry`,
          );
        } else {
          failed++;
          this.logger.log(
            `Reconciled: order ${order.orderNumber} (${ref}) marked failed`,
          );
        }
      } catch (err) {
        unknown++;
        this.logger.warn(
          `Could not reconcile order ${order.orderNumber} (${ref}): ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    this.logger.log(
      `Reconciliation complete — confirmed: ${confirmed}, failed: ${failed}, unknown: ${unknown}`,
    );
  }

  @Cron('0 * * * *') // hourly cutoff for orders Paystack never replied to
  async cancelAbandonedOrders() {
    const TWO_HOURS = 2 * 60 * 60 * 1000;
    const ONE_HOUR = 60 * 60 * 1000;

    const [stale, orphaned] = await Promise.all([
      this.ordersRepository.findStalePendingCardOrders(TWO_HOURS),
      // Orders where Paystack initialization failed mid-write and left no paymentIntentId
      this.ordersRepository.findOrphanedPendingCardOrders(ONE_HOUR),
    ]);

    if (stale.length === 0 && orphaned.length === 0) {
      this.logger.log('cancelAbandonedOrders: no abandoned or orphaned orders found');
      return;
    }

    // PENDING means "not confirmed as paid", not "unpaid": ask Paystack one last
    // time. Success marks the order paid; a definitive failure cancels it (via
    // the FAILED transition). If we cannot get an answer the customer may have
    // been charged, so leave the order alone and raise an alert instead.
    let resolved = 0;
    let skipped = 0;
    for (const order of stale) {
      const ref = order.paymentIntentId as string;
      try {
        const result = await this.transactionsService.verifyPayment(ref);
        if (result.pending) {
          skipped++;
          this.logger.error(
            `[PAYMENT_ALERT] Order ${order.orderNumber} (${ref}) is >2h PENDING and Paystack still reports it in flight, leaving it untouched for manual review`,
          );
        } else {
          resolved++;
        }
      } catch (err) {
        skipped++;
        this.logger.error(
          `[PAYMENT_ALERT] Order ${order.orderNumber} (${ref}) is >2h PENDING and could not be verified with Paystack, leaving it untouched for manual review: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // No reference means no payment can exist for these; cancel, never delete
    const cancelledOrphans = await this.ordersRepository.cancelPendingUnpaidOrders(
      orphaned.map((o) => o._id),
      'Payment was never initialized',
    );

    this.logger.warn(
      `cancelAbandonedOrders: resolved ${resolved}, skipped ${skipped} (unverifiable), cancelled ${cancelledOrphans} orphaned order(s)`,
    );
  }

  private async cleanupFailedPaymentOrders() {
    const count = await this.ordersRepository.cancelOrdersWithFailedPayment();
    if (count > 0) {
      this.logger.log(`Startup cleanup: cancelled ${count} failed-payment order(s)`);
    }
  }
}

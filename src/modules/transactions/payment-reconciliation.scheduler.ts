import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TransactionsService } from './transactions.service';
import { OrdersRepository } from '../orders/orders.repository';
import { OrderStatus, PaymentStatus } from '../orders/schemas/order.schema';

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

  @Cron('0 * * * *') // hourly hard cutoff for orders Paystack never replied to
  async cancelAbandonedOrders() {
    const TWO_HOURS = 2 * 60 * 60 * 1000;
    const ONE_HOUR = 60 * 60 * 1000;

    const [stale, orphaned] = await Promise.all([
      this.ordersRepository.findStalePendingCardOrders(TWO_HOURS),
      // Orders where Paystack initialization failed mid-write and left no paymentIntentId
      this.ordersRepository.findOrphanedPendingCardOrders(ONE_HOUR),
    ]);

    const all = [...stale, ...orphaned];
    if (all.length === 0) {
      this.logger.log('cancelAbandonedOrders: no abandoned or orphaned orders found');
      return;
    }

    this.logger.log(
      `Force-cancelling ${stale.length} abandoned + ${orphaned.length} orphaned order(s)...`,
    );

    for (const order of all) {
      try {
        await this.ordersRepository.updateOrder(order._id.toString(), {
          status: OrderStatus.CANCELLED,
          paymentStatus: PaymentStatus.FAILED,
          cancelledAt: new Date(),
          cancellationReason: 'Payment not completed',
        });
        this.logger.warn(`Force-cancelled order ${order.orderNumber}`);
      } catch (err) {
        this.logger.warn(
          `Could not force-cancel order ${order.orderNumber}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }
}

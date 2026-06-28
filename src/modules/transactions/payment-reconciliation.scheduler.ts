import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TransactionsService } from './transactions.service';
import { OrdersRepository } from '../orders/orders.repository';

// Orders older than this with paymentStatus=PENDING are eligible for reconciliation.
const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

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

    if (orders.length === 0) return;

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
}

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { OrdersService } from './orders.service';

export interface RiderSearchJobData {
  orderId: string;
  attempt: number; // 1-based; cancel after attempt 3 finds no riders
}

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 20 * 60 * 1000; // 20 minutes

@Processor('rider-search')
export class OrdersRiderSearchProcessor extends WorkerHost {
  private readonly logger = new Logger(OrdersRiderSearchProcessor.name);

  constructor(
    private readonly ordersService: OrdersService,
    @InjectQueue('rider-search') private readonly riderSearchQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<RiderSearchJobData>): Promise<void> {
    const { orderId, attempt } = job.data;

    this.logger.log(
      `Rider search attempt ${attempt}/${MAX_ATTEMPTS} for order ${orderId}`,
    );

    const ridersFound =
      await this.ordersService.notifyNearbyRidersForOrder(orderId);

    if (ridersFound) {
      this.logger.log(
        `Riders found on attempt ${attempt} for order ${orderId}`,
      );
      await this.ordersService.notifyAdminRiderSearch(orderId, attempt);
      return;
    }

    // Order may have been assigned, cancelled, or delivered since this job was queued
    if (await this.ordersService.isOrderResolved(orderId)) {
      this.logger.log(
        `Rider search attempt ${attempt} skipped for order ${orderId} — order already resolved`,
      );
      return;
    }

    await this.ordersService.notifyAdminRiderSearch(orderId, attempt);

    if (attempt < MAX_ATTEMPTS) {
      await this.riderSearchQueue.add(
        'search',
        { orderId, attempt: attempt + 1 },
        { delay: RETRY_DELAY_MS },
      );
      this.logger.log(
        `No riders found on attempt ${attempt} for order ${orderId}. Retrying in 20 min (attempt ${attempt + 1}/${MAX_ATTEMPTS}).`,
      );
    } else {
      this.logger.warn(
        `No riders found after ${MAX_ATTEMPTS} attempts for order ${orderId}. Cancelling order.`,
      );
      await this.ordersService.cancelOrderBySystem(
        orderId,
        'No riders were available to fulfil your order. You have been refunded.',
      );
    }
  }
}

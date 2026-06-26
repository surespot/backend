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
const RETRY_DELAY_MS = 60 * 60 * 1000; // 1 hour

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
      `Rider search retry attempt ${attempt}/${MAX_ATTEMPTS} for order ${orderId}`,
    );

    const ridersFound =
      await this.ordersService.notifyNearbyRidersForOrder(orderId);

    if (ridersFound) {
      this.logger.log(
        `Riders found on attempt ${attempt} for order ${orderId}`,
      );
      return;
    }

    if (attempt < MAX_ATTEMPTS) {
      await this.riderSearchQueue.add(
        'search',
        { orderId, attempt: attempt + 1 },
        { delay: RETRY_DELAY_MS },
      );
      this.logger.log(
        `No riders found on attempt ${attempt} for order ${orderId}. Retrying in 1 hour (attempt ${attempt + 1}/${MAX_ATTEMPTS}).`,
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

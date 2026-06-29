import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { OrdersService } from './orders.service';

export interface PickupTimeoutJobData {
  orderId: string;
  riderProfileId: string;
}

export const PICKUP_TIMEOUT_MS = 3 * 60 * 60 * 1000; // 3 hours

@Processor('pickup-timeout')
export class OrdersPickupTimeoutProcessor extends WorkerHost {
  private readonly logger = new Logger(OrdersPickupTimeoutProcessor.name);

  constructor(private readonly ordersService: OrdersService) {
    super();
  }

  async process(job: Job<PickupTimeoutJobData>): Promise<void> {
    const { orderId, riderProfileId } = job.data;
    this.logger.log(
      `Pickup timeout fired for order ${orderId}, rider ${riderProfileId}`,
    );
    await this.ordersService.releaseTimedOutAssignment(orderId, riderProfileId);
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class RidersScheduler {
  private readonly logger = new Logger(RidersScheduler.name);

  constructor(@InjectQueue('riders') private readonly ridersQueue: Queue) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async updateRiderAvailabilityBySchedule() {
    this.logger.log('Scheduling daily rider availability update job');
    await this.ridersQueue.add('update-availability-by-schedule', {
      timestamp: new Date().toISOString(),
    });
  }
}

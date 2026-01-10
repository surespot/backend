import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { WalletsService } from './wallets.service';

@Injectable()
export class WalletsScheduler {
  private readonly logger = new Logger(WalletsScheduler.name);

  constructor(private readonly walletsService: WalletsService) {}

  /**
   * Process daily earnings for all riders at 10pm
   */
  @Cron('0 22 * * *') // 10:00 PM every day
  async processDailyEarnings() {
    this.logger.log('Scheduled daily earnings processing started');
    try {
      const result = await this.walletsService.processDailyEarnings();
      this.logger.log(
        `Daily earnings processing completed: ${result.processed} riders processed, ₦${(result.totalCredited / 100).toFixed(2)} total credited`,
      );
      if (result.errors.length > 0) {
        this.logger.warn(
          `Daily earnings processing had ${result.errors.length} errors`,
        );
        result.errors.forEach((error) => this.logger.error(error));
      }
    } catch (error) {
      this.logger.error('Failed to process daily earnings', error);
    }
  }
}

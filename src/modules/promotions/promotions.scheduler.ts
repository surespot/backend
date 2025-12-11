import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PromotionsService } from './promotions.service';

@Injectable()
export class PromotionsScheduler {
  private readonly logger = new Logger(PromotionsScheduler.name);

  constructor(private readonly promotionsService: PromotionsService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleCron() {
    const { activated, ended } = await this.promotionsService.runAutoStartEnd();
    if (activated || ended) {
      this.logger.log(
        `Promotions auto-updated: activated=${activated}, ended=${ended}`,
      );
    }
  }
}

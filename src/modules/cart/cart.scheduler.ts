import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CartRepository } from './cart.repository';

@Injectable()
export class CartScheduler {
  private readonly logger = new Logger(CartScheduler.name);

  constructor(private readonly cartRepository: CartRepository) {}

  /**
   * Run daily to clean up expired carts
   * This is a backup in case TTL index doesn't work as expected
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleExpiredCarts() {
    try {
      const deletedCount = await this.cartRepository.deleteExpiredCarts();
      if (deletedCount > 0) {
        this.logger.log(`Cleaned up ${deletedCount} expired carts`);
      }
    } catch (error) {
      this.logger.error('Error cleaning up expired carts', error);
    }
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AuthRepository } from './auth.repository';
import { SavedLocationsRepository } from '../saved-locations/saved-locations.repository';
import { CartRepository } from '../cart/cart.repository';
import { RidersRepository } from '../riders/riders.repository';

@Injectable()
export class UserCleanupScheduler {
  private readonly logger = new Logger(UserCleanupScheduler.name);

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly savedLocationsRepository: SavedLocationsRepository,
    private readonly cartRepository: CartRepository,
    private readonly ridersRepository: RidersRepository,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async anonymizeDeletedUsers() {
    try {
      const users = await this.authRepository.findUsersToAnonymize();
      if (users.length === 0) return;

      for (const user of users) {
        const userId = user._id.toString();
        try {
          await this.savedLocationsRepository.deleteAllByUserId(userId);
          await this.cartRepository.deleteCartByUserId(userId);
          await this.ridersRepository.anonymizeByUserId(userId);
          await this.authRepository.anonymizeUser(userId);
        } catch (err) {
          this.logger.error(`Failed to anonymize user ${userId}`, err);
        }
      }

      this.logger.log(`Anonymized ${users.length} deleted user account(s)`);
    } catch (error) {
      this.logger.error('Error during user anonymization cron', error);
    }
  }
}

import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { AuthRepository } from '../auth/auth.repository';
import { OrdersRepository } from '../orders/orders.repository';
import { RidersRepository } from '../riders/riders.repository';
import { RegionsRepository } from '../regions/regions.repository';
import { PickupLocationsRepository } from '../pickup-locations/pickup-locations.repository';
import { MailService } from '../mail/mail.service';
import { UserRole } from '../auth/schemas/user.schema';
import {
  SendNewsletterDto,
  NewsletterAudience,
} from './dto/send-newsletter.dto';

@Injectable()
export class AdminNewsletterService {
  private readonly logger = new Logger(AdminNewsletterService.name);

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly ordersRepository: OrdersRepository,
    private readonly ridersRepository: RidersRepository,
    private readonly regionsRepository: RegionsRepository,
    private readonly pickupLocationsRepository: PickupLocationsRepository,
    private readonly mailService: MailService,
  ) {}

  async sendNewsletter(dto: SendNewsletterDto): Promise<{
    success: boolean;
    message: string;
    data: { sent: number; failed: number; total: number };
  }> {
    const recipients = await this.resolveRecipients(dto);
    if (recipients.length === 0) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'NO_RECIPIENTS',
          message:
            'No recipients found for the selected audience. Ensure the audience has email addresses.',
        },
      });
    }

    // Deduplicate by email
    const seen = new Set<string>();
    const unique = recipients.filter((r) => {
      if (seen.has(r.email.toLowerCase())) return false;
      seen.add(r.email.toLowerCase());
      return true;
    });

    let sent = 0;
    let failed = 0;

    for (const recipient of unique) {
      try {
        await this.mailService.sendNewsletterEmail({
          to: recipient.email,
          firstName: recipient.firstName,
          subject: dto.subject,
          body: dto.body,
        });
        sent++;
      } catch (err) {
        failed++;
        this.logger.warn(
          `Failed to send newsletter to ${recipient.email}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    this.logger.log(
      `Newsletter sent: ${sent} sent, ${failed} failed, audience=${dto.audience}`,
    );

    return {
      success: true,
      message: `Newsletter sent to ${sent} recipients${failed > 0 ? ` (${failed} failed)` : ''}`,
      data: {
        sent,
        failed,
        total: unique.length,
      },
    };
  }

  private async resolveRecipients(
    dto: SendNewsletterDto,
  ): Promise<Array<{ email: string; firstName: string }>> {
    switch (dto.audience) {
      case NewsletterAudience.RIDERS:
        return this.ridersRepository.findNewsletterRecipients();

      case NewsletterAudience.CUSTOMERS:
        return this.authRepository.findNewsletterRecipientsByRole(UserRole.USER);

      case NewsletterAudience.PICKUP_LOCATIONS: {
        if (!dto.pickupLocationId) {
          throw new BadRequestException({
            success: false,
            error: {
              code: 'PICKUP_LOCATION_REQUIRED',
              message: 'pickupLocationId is required for this audience',
            },
          });
        }
        const pickupExists = await this.pickupLocationsRepository.findById(
          dto.pickupLocationId,
        );
        if (!pickupExists) {
          throw new NotFoundException({
            success: false,
            error: {
              code: 'PICKUP_LOCATION_NOT_FOUND',
              message: 'Pickup location not found',
            },
          });
        }
        const userIds =
          await this.ordersRepository.findDistinctUserIdsByPickupLocationId(
            dto.pickupLocationId,
          );
        return this.authRepository.findNewsletterRecipientsByIds(userIds);
      }

      case NewsletterAudience.REGIONS: {
        if (!dto.regionId) {
          throw new BadRequestException({
            success: false,
            error: {
              code: 'REGION_REQUIRED',
              message: 'regionId is required for this audience',
            },
          });
        }
        const regionExists = await this.regionsRepository.findById(dto.regionId);
        if (!regionExists) {
          throw new NotFoundException({
            success: false,
            error: {
              code: 'REGION_NOT_FOUND',
              message: 'Region not found',
            },
          });
        }
        return this.ridersRepository.findNewsletterRecipients(dto.regionId);
      }

      default:
        throw new BadRequestException({
          success: false,
          error: {
            code: 'INVALID_AUDIENCE',
            message: `Unknown audience: ${dto.audience}`,
          },
        });
    }
  }
}

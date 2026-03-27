import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { MailService } from './mail.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Newsletter, NewsletterDocument } from './schemas/newsletter.schema';
import { User, UserDocument } from '../auth/schemas/user.schema';
import { OrdersRepository } from '../orders/orders.repository';

interface NewsletterJobData {
  newsletterId: string;
}

@Processor('newsletters')
export class NewslettersProcessor extends WorkerHost {
  private readonly logger = new Logger(NewslettersProcessor.name);

  constructor(
    private readonly mailService: MailService,
    private readonly ordersRepository: OrdersRepository,
    @InjectModel(Newsletter.name)
    private readonly newsletterModel: Model<NewsletterDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {
    super();
  }

  async process(job: Job<NewsletterJobData>): Promise<void> {
    const { newsletterId } = job.data;

    this.logger.log(`Processing newsletter ${newsletterId}`);

    const newsletter = await this.newsletterModel.findById(newsletterId);
    if (!newsletter) {
      this.logger.error(`Newsletter ${newsletterId} not found`);
      return;
    }

    // Get recipients based on audience type
    const recipients = await this.getRecipients(newsletter);

    this.logger.log(
      `Sending newsletter to ${recipients.length} recipients (${newsletter.audience})`,
    );

    let successCount = 0;
    let failureCount = 0;

    // Send emails
    for (const user of recipients) {
      try {
        await this.mailService.sendNewsletterEmail({
          to: user.email,
          subject: newsletter.subject,
          firstName: user.firstName,
          body: newsletter.body,
        });
        successCount++;
      } catch (error) {
        this.logger.error(
          `Failed to send newsletter to ${user.email}: ${error instanceof Error ? error.message : String(error)}`,
        );
        failureCount++;
      }
    }

    // Update newsletter status
    await this.newsletterModel.updateOne(
      { _id: newsletter._id },
      {
        $set: {
          status: 'sent',
          sentAt: new Date(),
          totalRecipients: recipients.length,
          successCount,
          failureCount,
        },
      },
    );

    this.logger.log(
      `Newsletter ${newsletterId} sent: ${successCount} success, ${failureCount} failures`,
    );
  }

  private async getRecipients(
    newsletter: NewsletterDocument,
  ): Promise<Array<{ email: string; firstName: string }>> {
    const query: Record<string, unknown> = {
      isEmailVerified: true,
      isActive: true,
      deletedAt: { $exists: false },
      email: { $exists: true, $ne: '' },
    };

    switch (newsletter.audience) {
      case 'customers':
        query.role = 'user';
        break;

      case 'riders':
        query.role = 'rider';
        break;

      case 'pickup-locations':
        if (
          !newsletter.targetPickupLocationIds ||
          newsletter.targetPickupLocationIds.length === 0
        ) {
          return [];
        }
        // Find users who have ordered from these pickup locations
        const ordersByPickup =
          await this.ordersRepository.findOrdersByPickupLocations(
            newsletter.targetPickupLocationIds.map((id) => id.toString()),
          );
        const userIdsFromPickup = [
          ...new Set(ordersByPickup.map((o) => o.userId.toString())),
        ];
        query._id = { $in: userIdsFromPickup.map((id) => new Types.ObjectId(id)) };
        query.role = 'user';
        break;

      case 'regions':
        if (
          !newsletter.targetRegionIds ||
          newsletter.targetRegionIds.length === 0
        ) {
          return [];
        }
        // Find riders in these regions
        query.role = 'rider';
        query.regionId = { $in: newsletter.targetRegionIds };
        break;

      default:
        return [];
    }

    return this.userModel
      .find(query)
      .select('firstName email')
      .lean()
      .exec() as Promise<Array<{ email: string; firstName: string }>>;
  }
}

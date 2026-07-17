import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  NotificationCampaign,
  NotificationCampaignChannel,
  NotificationCampaignDocument,
  NotificationCampaignStatus,
} from './schemas/notification-campaign.schema';
import { NotificationCampaignResolverService } from './notification-campaign-resolver.service';
import { SmsService } from '../sms/sms.service';
import { PushNotificationService } from '../notifications/push-notification.service';
import { MailService } from '../mail/mail.service';

interface NotificationCampaignJobData {
  campaignId: string;
}

@Processor('notification-campaigns')
export class NotificationCampaignProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationCampaignProcessor.name);

  constructor(
    @InjectModel(NotificationCampaign.name)
    private readonly campaignModel: Model<NotificationCampaignDocument>,
    private readonly resolver: NotificationCampaignResolverService,
    private readonly smsService: SmsService,
    private readonly pushNotificationService: PushNotificationService,
    private readonly mailService: MailService,
  ) {
    super();
  }

  async process(job: Job<NotificationCampaignJobData>): Promise<void> {
    const { campaignId } = job.data;

    this.logger.log(`Processing notification campaign ${campaignId}`);

    const campaign = await this.campaignModel.findById(campaignId);
    if (!campaign) {
      this.logger.error(`Notification campaign ${campaignId} not found`);
      return;
    }

    const recipients =
      await this.resolver.resolveRecipientsForCampaign(campaign);
    const { eligible, ineligible } = this.resolver.filterEligible(
      recipients,
      campaign.channel,
    );

    this.logger.log(
      `Sending campaign to ${eligible.length}/${recipients.length} recipients (${campaign.channel}, ${ineligible.length} skipped)`,
    );

    let successCount = 0;
    let failureCount = 0;

    switch (campaign.channel) {
      case NotificationCampaignChannel.SMS: {
        if (eligible.length > 0) {
          const result = await this.smsService.sendBulkSms(
            eligible.map((u) => u.phone),
            campaign.body,
          );
          if (result.success) {
            successCount = eligible.length;
          } else {
            failureCount = eligible.length;
            this.logger.error(
              `Bulk SMS send failed for campaign ${campaignId}: ${result.error}`,
            );
          }
        }
        break;
      }

      case NotificationCampaignChannel.PUSH: {
        if (eligible.length > 0) {
          const sentCount = await this.pushNotificationService.sendToUsers(
            eligible.map((u) => u._id.toString()),
            { title: campaign.title ?? '', body: campaign.body },
          );
          successCount = sentCount;
          failureCount = eligible.length - sentCount;
        }
        break;
      }

      case NotificationCampaignChannel.EMAIL: {
        for (const user of eligible) {
          try {
            await this.mailService.sendNewsletterEmail({
              to: user.email!,
              subject: campaign.subject ?? '',
              firstName: user.firstName ?? '',
              body: campaign.body,
            });
            successCount++;
          } catch (error) {
            this.logger.error(
              `Failed to send campaign email to ${user.email}: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
            failureCount++;
          }
        }
        break;
      }
    }

    await this.campaignModel.updateOne(
      { _id: campaign._id },
      {
        $set: {
          status: NotificationCampaignStatus.SENT,
          sentAt: new Date(),
          totalRecipients: recipients.length,
          successCount,
          failureCount,
          skippedCount: ineligible.length,
        },
      },
    );

    this.logger.log(
      `Notification campaign ${campaignId} sent: ${successCount} success, ${failureCount} failures, ${ineligible.length} skipped`,
    );
  }
}

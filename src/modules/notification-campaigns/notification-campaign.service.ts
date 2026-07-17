import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  NotificationCampaign,
  NotificationCampaignDocument,
  NotificationCampaignStatus,
} from './schemas/notification-campaign.schema';
import { NotificationCampaignResolverService } from './notification-campaign-resolver.service';
import { CreateNotificationCampaignDto } from './dto/create-notification-campaign.dto';
import { PreviewNotificationCampaignDto } from './dto/preview-notification-campaign.dto';

export interface NotificationCampaignPreview {
  totalMatched: number;
  eligible: number;
  ineligible: number;
}

@Injectable()
export class NotificationCampaignService {
  private readonly logger = new Logger(NotificationCampaignService.name);

  constructor(
    @InjectModel(NotificationCampaign.name)
    private readonly campaignModel: Model<NotificationCampaignDocument>,
    @InjectQueue('notification-campaigns')
    private readonly campaignQueue: Queue,
    private readonly resolver: NotificationCampaignResolverService,
  ) {}

  /**
   * Resolve targeting criteria into a recipient count without persisting anything.
   */
  async preview(
    dto: PreviewNotificationCampaignDto,
  ): Promise<NotificationCampaignPreview> {
    const recipients = await this.resolver.resolveRecipients({
      targetMode: dto.targetMode,
      audience: dto.audience,
      targetPickupLocationIds: dto.targetPickupLocationIds,
      targetRegionIds: dto.targetRegionIds,
      targetUserIds: dto.targetUserIds,
    });

    const { eligible, ineligible } = this.resolver.filterEligible(
      recipients,
      dto.channel,
    );

    return {
      totalMatched: recipients.length,
      eligible: eligible.length,
      ineligible: ineligible.length,
    };
  }

  async create(
    dto: CreateNotificationCampaignDto,
    createdBy: string,
  ): Promise<NotificationCampaignDocument> {
    const campaign = await this.campaignModel.create({
      channel: dto.channel,
      targetMode: dto.targetMode,
      audience: dto.audience,
      targetPickupLocationIds: dto.targetPickupLocationIds?.map(
        (id) => new Types.ObjectId(id),
      ),
      targetRegionIds: dto.targetRegionIds?.map((id) => new Types.ObjectId(id)),
      targetUserIds: dto.targetUserIds?.map((id) => new Types.ObjectId(id)),
      subject: dto.subject,
      title: dto.title,
      body: dto.body,
      createdBy: new Types.ObjectId(createdBy),
      status: NotificationCampaignStatus.DRAFT,
    });

    this.logger.log(
      `Notification campaign created: ${campaign._id.toString()}`,
    );
    return campaign;
  }

  async send(campaignId: string): Promise<void> {
    const campaign = await this.campaignModel.findById(campaignId);

    if (!campaign) {
      throw new NotFoundException('Notification campaign not found');
    }

    if (campaign.status === NotificationCampaignStatus.SENT) {
      throw new Error('Notification campaign already sent');
    }

    if (campaign.status === NotificationCampaignStatus.SENDING) {
      throw new Error('Notification campaign is already being sent');
    }

    await this.campaignModel.updateOne(
      { _id: campaign._id },
      { $set: { status: NotificationCampaignStatus.SENDING } },
    );

    await this.campaignQueue.add('send-campaign', {
      campaignId: campaign._id.toString(),
    });

    this.logger.log(`Notification campaign ${campaignId} queued for sending`);
  }

  async findAll(): Promise<NotificationCampaignDocument[]> {
    return this.campaignModel
      .find()
      .sort({ createdAt: -1 })
      .populate('createdBy', 'firstName lastName email')
      .exec();
  }

  async findById(id: string): Promise<NotificationCampaignDocument | null> {
    return this.campaignModel
      .findById(id)
      .populate('createdBy', 'firstName lastName email')
      .exec();
  }
}

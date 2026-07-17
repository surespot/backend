import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument, UserRole } from '../auth/schemas/user.schema';
import { OrdersRepository } from '../orders/orders.repository';
import { RidersRepository } from '../riders/riders.repository';
import { NewsletterAudienceType } from '../mail/schemas/newsletter.schema';
import {
  NotificationCampaignChannel,
  NotificationCampaignTargetMode,
  NotificationCampaignDocument,
} from './schemas/notification-campaign.schema';

export interface ResolveTargetsInput {
  targetMode: NotificationCampaignTargetMode;
  audience?: NewsletterAudienceType;
  targetPickupLocationIds?: (string | Types.ObjectId)[];
  targetRegionIds?: (string | Types.ObjectId)[];
  targetUserIds?: (string | Types.ObjectId)[];
}

/**
 * Resolves a campaign's targeting criteria into the underlying set of users.
 * Mirrors the demographic filters used by NewslettersProcessor, plus a
 * specific-users branch for individually picked recipients.
 */
@Injectable()
export class NotificationCampaignResolverService {
  private readonly logger = new Logger(
    NotificationCampaignResolverService.name,
  );

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly ordersRepository: OrdersRepository,
    private readonly ridersRepository: RidersRepository,
  ) {}

  async resolveRecipients(input: ResolveTargetsInput): Promise<UserDocument[]> {
    if (input.targetMode === NotificationCampaignTargetMode.SPECIFIC_USERS) {
      if (!input.targetUserIds || input.targetUserIds.length === 0) {
        return [];
      }
      return this.userModel
        .find({
          _id: { $in: input.targetUserIds.map((id) => new Types.ObjectId(id)) },
          deletedAt: { $exists: false },
        })
        .exec();
    }

    const query: Record<string, unknown> = {
      deletedAt: { $exists: false },
    };

    switch (input.audience) {
      case NewsletterAudienceType.ALL_CUSTOMERS:
        query.role = UserRole.USER;
        break;

      case NewsletterAudienceType.ALL_RIDERS:
        query.role = UserRole.RIDER;
        break;

      case NewsletterAudienceType.PICKUP_LOCATIONS: {
        if (
          !input.targetPickupLocationIds ||
          input.targetPickupLocationIds.length === 0
        ) {
          return [];
        }
        const ordersByPickup =
          await this.ordersRepository.findOrdersByPickupLocations(
            input.targetPickupLocationIds.map((id) => id.toString()),
          );
        const userIdsFromPickup = [
          ...new Set(ordersByPickup.map((o) => o.userId.toString())),
        ];
        if (userIdsFromPickup.length === 0) return [];
        query._id = {
          $in: userIdsFromPickup.map((id) => new Types.ObjectId(id)),
        };
        query.role = UserRole.USER;
        break;
      }

      case NewsletterAudienceType.REGIONS: {
        if (!input.targetRegionIds || input.targetRegionIds.length === 0) {
          return [];
        }
        const riderUserIds = await this.ridersRepository.findUserIdsByRegionIds(
          input.targetRegionIds,
        );
        if (riderUserIds.length === 0) return [];
        query._id = { $in: riderUserIds };
        query.role = UserRole.RIDER;
        break;
      }

      default:
        return [];
    }

    return this.userModel.find(query).exec();
  }

  async resolveRecipientsForCampaign(
    campaign: NotificationCampaignDocument,
  ): Promise<UserDocument[]> {
    return this.resolveRecipients({
      targetMode: campaign.targetMode,
      audience: campaign.audience,
      targetPickupLocationIds: campaign.targetPickupLocationIds,
      targetRegionIds: campaign.targetRegionIds,
      targetUserIds: campaign.targetUserIds,
    });
  }

  /**
   * Splits resolved recipients into those eligible to receive the given
   * channel (has a phone/push token/verified email) and those that aren't.
   */
  filterEligible(
    users: UserDocument[],
    channel: NotificationCampaignChannel,
  ): { eligible: UserDocument[]; ineligible: UserDocument[] } {
    const eligible: UserDocument[] = [];
    const ineligible: UserDocument[] = [];

    for (const user of users) {
      const isEligible = this.isEligibleForChannel(user, channel);
      (isEligible ? eligible : ineligible).push(user);
    }

    return { eligible, ineligible };
  }

  private isEligibleForChannel(
    user: UserDocument,
    channel: NotificationCampaignChannel,
  ): boolean {
    switch (channel) {
      case NotificationCampaignChannel.SMS:
        return Boolean(user.phone);
      case NotificationCampaignChannel.PUSH:
        return Boolean(user.pushTokens && user.pushTokens.length > 0);
      case NotificationCampaignChannel.EMAIL:
        return Boolean(user.isEmailVerified && user.email);
      default:
        return false;
    }
  }
}

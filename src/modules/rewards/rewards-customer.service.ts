import { Injectable } from '@nestjs/common';
import { RewardsService } from './rewards.service';
import {
  RewardGrantDocument,
  RewardGrantStatus,
} from './schemas/reward-grant.schema';
import { describeBenefit } from './reward-benefit';

/** Builds the customer's "special rewards" screen. */
@Injectable()
export class RewardsCustomerService {
  constructor(private readonly rewardsService: RewardsService) {}

  async getOverview(userId: string) {
    const [earnable, grants] = await Promise.all([
      this.rewardsService.listEarnableCampaigns(),
      this.rewardsService.listForUser(userId),
    ]);
    const campaigns = await this.rewardsService.findCampaignsByIds(
      grants.map((g) => g.campaignId),
    );

    const effective = (g: RewardGrantDocument): string =>
      g.status === RewardGrantStatus.EARNED &&
      g.expiresAt.getTime() <= Date.now()
        ? 'expired'
        : g.status;

    return {
      success: true,
      message: 'Special rewards retrieved successfully',
      data: {
        // What the customer can still earn. The code is only revealed once earned.
        available: earnable.map((c) => ({
          id: c._id.toString(),
          name: c.name,
          description: c.description,
          imageUrl: c.imageUrl,
          trigger: c.trigger,
          benefit: c.discountType ? describeBenefit(c) : undefined,
          earnUntil: c.earnTo,
          validityDays: c.validityDays,
          canEarnMultiple: c.accumulation?.enabled ?? false,
          maxPerUser: c.accumulation?.maxPerUser,
        })),
        // What the customer has earned, with the code to use at checkout
        mine: grants.map((g) => {
          const c = campaigns.get(g.campaignId.toString());
          return {
            id: g._id.toString(),
            status: effective(g),
            code: c?.code,
            earnedAt: g.createdAt,
            expiresAt: g.expiresAt,
            redeemedAt: g.redeemedAt,
            campaign: c
              ? {
                  id: c._id.toString(),
                  name: c.name,
                  description: c.description,
                  imageUrl: c.imageUrl,
                  benefit: describeBenefit(c),
                }
              : null,
          };
        }),
      },
    };
  }
}

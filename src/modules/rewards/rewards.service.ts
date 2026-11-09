import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  RewardCampaign,
  RewardCampaignDocument,
  RewardCampaignStatus,
  RewardTrigger,
} from './schemas/reward-campaign.schema';
import {
  RewardGrant,
  RewardGrantDocument,
  RewardGrantStatus,
  RewardRevokeKind,
} from './schemas/reward-grant.schema';
import {
  Order,
  OrderDocument,
  OrderStatus,
  PaymentStatus,
} from '../orders/schemas/order.schema';
import {
  FoodItem,
  FoodItemDocument,
} from '../food-items/schemas/food-item.schema';
import {
  BenefitContext,
  calculateBenefit,
} from '../promotions/discount-calculator';
import { NotificationsService } from '../notifications/notifications.service';
import {
  NotificationChannel,
  NotificationType,
} from '../notifications/schemas/notification.schema';
import { describeBenefit } from './reward-benefit';

const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * An order that references a reward but is still unpaid blocks reuse of that
 * reward for this long. Matches the payment reconciliation window: after it,
 * an abandoned order stops locking the reward.
 */
const UNPAID_ORDER_HOLD_MS = 2 * 60 * 60 * 1000;

export interface GrantParams {
  campaignId: string;
  userId: string;
  sourceType: string;
  sourceId: string;
  orderId?: string;
  /** Admin who approved it; omit for automatic grants. */
  grantedBy?: string;
}

export type GrantOutcome =
  | {
      outcome: 'granted' | 'reinstated' | 'already_granted';
      grant: RewardGrantDocument;
    }
  | { outcome: 'campaign_unavailable' | 'limit_reached' | 'revoked_by_admin' };

export interface RevokeBySourceResult {
  revoked: number;
  /** True if a grant from this source was already used, so it could not be taken back. */
  alreadyRedeemed: boolean;
}

export type RewardCheckoutResult =
  | {
      valid: true;
      discountAmount: number;
      waivesDelivery: boolean;
      grantId: string;
      campaign: {
        id: string;
        name: string;
        code: string;
        summary: string;
        discountType: string;
        discountValue?: number;
      };
    }
  | { valid: false; message: string };

export const REWARD_CODE_NOT_RECOGNISED = 'Invalid or expired discount code';

@Injectable()
export class RewardsService {
  private readonly logger = new Logger(RewardsService.name);

  constructor(
    @InjectModel(RewardCampaign.name)
    private readonly campaignModel: Model<RewardCampaignDocument>,
    @InjectModel(RewardGrant.name)
    private readonly grantModel: Model<RewardGrantDocument>,
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
    @InjectModel(FoodItem.name)
    private readonly foodItemModel: Model<FoodItemDocument>,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
  ) {}

  // ---------------------------------------------------------------------------
  // Campaign lookup
  // ---------------------------------------------------------------------------

  /** The campaign customers can currently earn for this trigger, if any. */
  async findEarningCampaign(
    trigger: RewardTrigger,
    at: Date = new Date(),
  ): Promise<RewardCampaignDocument | null> {
    return this.campaignModel
      .findOne({
        trigger,
        status: RewardCampaignStatus.ACTIVE,
        earnFrom: { $lte: at },
        earnTo: { $gte: at },
      })
      .sort({ earnFrom: -1 })
      .exec();
  }

  async findCampaignById(id: string): Promise<RewardCampaignDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.campaignModel.findById(id).exec();
  }

  // ---------------------------------------------------------------------------
  // Granting and revoking
  // ---------------------------------------------------------------------------

  /**
   * Whether a user already holds as many rewards from a campaign as it allows.
   * Rewards an admin revoked still count (so they cannot simply be re-earned);
   * rewards revoked because the earning action was undone do not.
   */
  private async isAtLimit(
    campaign: RewardCampaignDocument,
    userId: Types.ObjectId,
  ): Promise<boolean> {
    const accumulation = campaign.accumulation;
    const limit = accumulation?.enabled
      ? (accumulation.maxPerUser ?? Number.POSITIVE_INFINITY)
      : 1;
    if (!Number.isFinite(limit)) return false;

    const held = await this.grantModel.countDocuments({
      campaignId: campaign._id,
      userId,
      $or: [
        {
          status: {
            $in: [RewardGrantStatus.EARNED, RewardGrantStatus.REDEEMED],
          },
        },
        {
          status: RewardGrantStatus.REVOKED,
          revokeKind: RewardRevokeKind.ADMIN,
        },
      ],
    });
    return held >= limit;
  }

  /** Whether this user can still earn a reward from the campaign (limit not reached). */
  async userCanEarn(
    campaign: RewardCampaignDocument,
    userId: string,
  ): Promise<boolean> {
    return !(await this.isAtLimit(campaign, new Types.ObjectId(userId)));
  }

  /** Grants earned by the given sources, keyed by source id (for admin views). */
  async findGrantsBySource(
    sourceType: string,
    sourceIds: Types.ObjectId[],
  ): Promise<Map<string, RewardGrantDocument>> {
    if (sourceIds.length === 0) return new Map();
    const grants = await this.grantModel
      .find({ sourceType, sourceId: { $in: sourceIds } })
      .exec();
    return new Map(grants.map((g) => [g.sourceId.toString(), g]));
  }

  /**
   * Grant a campaign's reward to a user for one qualifying action. Safe to call
   * more than once for the same action: it never grants twice.
   */
  async grant(params: GrantParams): Promise<GrantOutcome> {
    const campaign = await this.findCampaignById(params.campaignId);
    if (!campaign || campaign.status !== RewardCampaignStatus.ACTIVE) {
      return { outcome: 'campaign_unavailable' };
    }

    const userId = new Types.ObjectId(params.userId);
    const sourceId = new Types.ObjectId(params.sourceId);
    const expiresAt = new Date(Date.now() + campaign.validityDays * DAY_MS);
    const grantedBy = params.grantedBy
      ? new Types.ObjectId(params.grantedBy)
      : undefined;

    const existing = await this.grantModel
      .findOne({
        campaignId: campaign._id,
        sourceType: params.sourceType,
        sourceId,
      })
      .exec();

    if (existing) {
      if (existing.status !== RewardGrantStatus.REVOKED) {
        return { outcome: 'already_granted', grant: existing };
      }
      if (existing.revokeKind === RewardRevokeKind.ADMIN) {
        return { outcome: 'revoked_by_admin' };
      }
      // Revoked only because the review was hidden and now it is approved again
      if (await this.isAtLimit(campaign, userId)) {
        return { outcome: 'limit_reached' };
      }
      const reinstated = await this.grantModel
        .findOneAndUpdate(
          {
            _id: existing._id,
            status: RewardGrantStatus.REVOKED,
            revokeKind: RewardRevokeKind.SOURCE,
          },
          {
            $set: {
              status: RewardGrantStatus.EARNED,
              expiresAt,
              ...(grantedBy ? { grantedBy } : {}),
            },
            $unset: {
              revokedAt: 1,
              revokedBy: 1,
              revokeKind: 1,
              revokedReason: 1,
            },
          },
          { new: true },
        )
        .exec();
      if (!reinstated) return { outcome: 'already_granted', grant: existing };
      this.notifyGranted(reinstated, campaign);
      return { outcome: 'reinstated', grant: reinstated };
    }

    if (await this.isAtLimit(campaign, userId)) {
      return { outcome: 'limit_reached' };
    }

    try {
      const created = await this.grantModel.create({
        campaignId: campaign._id,
        userId,
        trigger: campaign.trigger,
        sourceType: params.sourceType,
        sourceId,
        orderId: params.orderId
          ? new Types.ObjectId(params.orderId)
          : undefined,
        status: RewardGrantStatus.EARNED,
        grantedBy,
        expiresAt,
      });
      this.notifyGranted(created, campaign);
      return { outcome: 'granted', grant: created };
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        // Lost a race with another request granting the same action
        const raced = await this.grantModel
          .findOne({
            campaignId: campaign._id,
            sourceType: params.sourceType,
            sourceId,
          })
          .exec();
        if (raced) return { outcome: 'already_granted', grant: raced };
      }
      throw err;
    }
  }

  /**
   * Take back rewards earned by an action that has been undone (e.g. a hidden
   * review). Rewards already used cannot be taken back and are reported.
   */
  async revokeBySource(
    sourceType: string,
    sourceIdStr: string,
    opts: { revokedBy?: string; reason?: string } = {},
  ): Promise<RevokeBySourceResult> {
    const sourceId = new Types.ObjectId(sourceIdStr);
    const earned = await this.grantModel
      .find({ sourceType, sourceId, status: RewardGrantStatus.EARNED })
      .exec();

    let revoked = 0;
    if (earned.length > 0) {
      const res = await this.grantModel.updateMany(
        {
          _id: { $in: earned.map((g) => g._id) },
          status: RewardGrantStatus.EARNED,
        },
        {
          $set: {
            status: RewardGrantStatus.REVOKED,
            revokedAt: new Date(),
            revokeKind: RewardRevokeKind.SOURCE,
            ...(opts.revokedBy
              ? { revokedBy: new Types.ObjectId(opts.revokedBy) }
              : {}),
            ...(opts.reason ? { revokedReason: opts.reason } : {}),
          },
        },
      );
      revoked = res.modifiedCount;
      earned.forEach((g) => this.notifyRevoked(g));
    }

    const alreadyRedeemed = !!(await this.grantModel.exists({
      sourceType,
      sourceId,
      status: RewardGrantStatus.REDEEMED,
    }));

    return { revoked, alreadyRedeemed };
  }

  /** Admin takes back one specific reward. */
  async revokeGrant(
    grantId: string,
    adminId: string,
    reason?: string,
  ): Promise<RewardGrantDocument> {
    if (!Types.ObjectId.isValid(grantId)) {
      throw this.grantNotFound();
    }
    const revoked = await this.grantModel
      .findOneAndUpdate(
        { _id: grantId, status: RewardGrantStatus.EARNED },
        {
          $set: {
            status: RewardGrantStatus.REVOKED,
            revokedAt: new Date(),
            revokedBy: new Types.ObjectId(adminId),
            revokeKind: RewardRevokeKind.ADMIN,
            ...(reason ? { revokedReason: reason } : {}),
          },
        },
        { new: true },
      )
      .exec();

    if (revoked) {
      this.notifyRevoked(revoked);
      return revoked;
    }

    const current = await this.grantModel.findById(grantId).exec();
    if (!current) throw this.grantNotFound();
    if (current.status === RewardGrantStatus.REVOKED) return current; // idempotent
    throw new ConflictException({
      success: false,
      error: {
        code: 'REWARD_ALREADY_REDEEMED',
        message: 'This reward has already been used and cannot be revoked',
      },
    });
  }

  private grantNotFound(): NotFoundException {
    return new NotFoundException({
      success: false,
      error: { code: 'REWARD_GRANT_NOT_FOUND', message: 'Reward not found' },
    });
  }

  // ---------------------------------------------------------------------------
  // Using a reward at checkout
  // ---------------------------------------------------------------------------

  /**
   * Check whether `code` is a special-reward code this user may use right now
   * and what it is worth on this order. A code nobody has earned does nothing.
   */
  async resolveForCheckout(
    code: string,
    userId: string,
    context: BenefitContext,
  ): Promise<RewardCheckoutResult> {
    const campaign = await this.campaignModel
      .findOne({ code: code.trim().toUpperCase() })
      .exec();
    if (!campaign) {
      // Not ours: use the generic message so the caller can prefer another validator's
      return { valid: false, message: REWARD_CODE_NOT_RECOGNISED };
    }
    if (campaign.status !== RewardCampaignStatus.ACTIVE) {
      return { valid: false, message: 'This reward is no longer available' };
    }

    const now = new Date();
    const grants = await this.grantModel
      .find({
        campaignId: campaign._id,
        userId: new Types.ObjectId(userId),
        status: RewardGrantStatus.EARNED,
        expiresAt: { $gt: now },
      })
      .sort({ expiresAt: 1 })
      .exec();

    if (grants.length === 0) {
      return {
        valid: false,
        message: 'You have not earned this reward, or it has expired',
      };
    }

    const inFlight = await this.findInFlightGrantIds(grants.map((g) => g._id));
    const grant = grants.find((g) => !inFlight.has(g._id.toString()));
    if (!grant) {
      return {
        valid: false,
        message: 'This reward is already applied to another order',
      };
    }

    const result = await calculateBenefit(
      campaign,
      context,
      (ids) => this.findCategoriesByIds(ids),
      'reward',
    );
    if (!result.valid) {
      return {
        valid: false,
        message: result.message ?? 'Reward not applicable',
      };
    }

    return {
      valid: true,
      discountAmount: result.discountAmount ?? 0,
      waivesDelivery: result.waivesDelivery ?? false,
      grantId: grant._id.toString(),
      campaign: {
        id: campaign._id.toString(),
        name: campaign.name,
        code: campaign.code,
        summary: describeBenefit(campaign),
        discountType: campaign.discountType,
        discountValue: campaign.discountValue,
      },
    };
  }

  private async findInFlightGrantIds(
    grantIds: Types.ObjectId[],
  ): Promise<Set<string>> {
    const cutoff = new Date(Date.now() - UNPAID_ORDER_HOLD_MS);
    const orders = await this.orderModel
      .find({
        rewardGrantId: { $in: grantIds },
        status: { $ne: OrderStatus.CANCELLED },
        $or: [
          { paymentStatus: PaymentStatus.PAID },
          { createdAt: { $gte: cutoff } },
        ],
      })
      .select('rewardGrantId')
      .lean()
      .exec();
    return new Set(orders.map((o) => String(o.rewardGrantId)));
  }

  private async findCategoriesByIds(
    ids: string[],
  ): Promise<Map<string, string>> {
    const valid = ids.filter((id) => Types.ObjectId.isValid(id));
    if (valid.length === 0) return new Map();
    const items = await this.foodItemModel
      .find({ _id: { $in: valid.map((id) => new Types.ObjectId(id)) } })
      .select('_id category')
      .lean()
      .exec();
    return new Map(items.map((i) => [String(i._id), i.category]));
  }

  /**
   * Mark a reward as used by an order, once payment is confirmed. Atomic: a
   * reward can be redeemed only once. Returns false if it was not redeemable.
   */
  async redeem(
    grantId: string,
    userId: string,
    orderId: string,
  ): Promise<boolean> {
    const redeemed = await this.grantModel
      .findOneAndUpdate(
        {
          _id: grantId,
          userId: new Types.ObjectId(userId),
          status: RewardGrantStatus.EARNED,
        },
        {
          $set: {
            status: RewardGrantStatus.REDEEMED,
            redeemedAt: new Date(),
            redeemedOrderId: new Types.ObjectId(orderId),
          },
        },
        { new: true },
      )
      .exec();
    return !!redeemed;
  }

  // ---------------------------------------------------------------------------
  // Customer-facing views
  // ---------------------------------------------------------------------------

  /** Campaigns a customer can earn right now (for the "special rewards" screen). */
  async listEarnableCampaigns(): Promise<RewardCampaignDocument[]> {
    const now = new Date();
    return this.campaignModel
      .find({
        status: RewardCampaignStatus.ACTIVE,
        earnFrom: { $lte: now },
        earnTo: { $gte: now },
      })
      .sort({ earnTo: 1 })
      .exec();
  }

  async listForUser(userId: string): Promise<RewardGrantDocument[]> {
    return this.grantModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .limit(100)
      .exec();
  }

  async findCampaignsByIds(
    ids: Types.ObjectId[],
  ): Promise<Map<string, RewardCampaignDocument>> {
    if (ids.length === 0) return new Map();
    const campaigns = await this.campaignModel
      .find({ _id: { $in: ids } })
      .exec();
    return new Map(campaigns.map((c) => [c._id.toString(), c]));
  }

  // ---------------------------------------------------------------------------
  // Notifications (best effort: never fail the caller)
  // ---------------------------------------------------------------------------

  private notifyGranted(
    grant: RewardGrantDocument,
    campaign: RewardCampaignDocument,
  ): void {
    const title = 'You earned a reward!';
    const message = `${describeBenefit(campaign)}. Use code ${campaign.code} at checkout before ${grant.expiresAt.toLocaleDateString('en-NG')}.`;
    this.notificationsService
      .queueNotification(
        grant.userId.toString(),
        NotificationType.SPECIAL_REWARD,
        title,
        message,
        {
          title,
          message,
          grantId: grant._id.toString(),
          campaignId: campaign._id.toString(),
          code: campaign.code,
          expiresAt: grant.expiresAt.toISOString(),
          event: 'granted',
        },
        [NotificationChannel.IN_APP, NotificationChannel.PUSH],
      )
      .catch((err) =>
        this.logger.warn(
          `Failed to send reward granted notification: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
  }

  private notifyRevoked(grant: RewardGrantDocument): void {
    const title = 'Reward removed';
    const message = 'A reward you earned has been removed.';
    this.notificationsService
      .queueNotification(
        grant.userId.toString(),
        NotificationType.SPECIAL_REWARD,
        title,
        message,
        { title, message, grantId: grant._id.toString(), event: 'revoked' },
        [NotificationChannel.IN_APP],
      )
      .catch((err) =>
        this.logger.warn(
          `Failed to send reward revoked notification: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
  }
}

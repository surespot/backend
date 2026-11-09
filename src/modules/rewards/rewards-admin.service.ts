import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
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
} from './schemas/reward-grant.schema';
import {
  Promotion,
  PromotionDocument,
} from '../promotions/schemas/promotion.schema';
import {
  Marketer,
  MarketerDocument,
} from '../marketers/schemas/marketer.schema';
import { User, UserDocument } from '../auth/schemas/user.schema';
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import { validateBenefitFields } from '../promotions/discount-calculator';
import { CreateRewardCampaignDto } from './dto/create-reward-campaign.dto';
import { UpdateRewardCampaignDto } from './dto/update-reward-campaign.dto';
import { GetRewardGrantsDto } from './dto/reward-admin-queries.dto';
import { RewardsService } from './rewards.service';
import { describeBenefit } from './reward-benefit';

/** Benefit fields an admin may clear by sending `null`. */
const CLEARABLE_BENEFIT_FIELDS = [
  'discountValue',
  'minOrderAmount',
  'maxDiscountAmount',
  'targetCategory',
  'targetFoodItemIds',
  'maxFreeQuantity',
  'buyQuantity',
  'getFreeQuantity',
  'maxRedeemablePerOrder',
] as const;

@Injectable()
export class RewardsAdminService {
  constructor(
    @InjectModel(RewardCampaign.name)
    private readonly campaignModel: Model<RewardCampaignDocument>,
    @InjectModel(RewardGrant.name)
    private readonly grantModel: Model<RewardGrantDocument>,
    @InjectModel(Promotion.name)
    private readonly promotionModel: Model<PromotionDocument>,
    @InjectModel(Marketer.name)
    private readonly marketerModel: Model<MarketerDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    private readonly rewardsService: RewardsService,
  ) {}

  // ---------------------------------------------------------------------------
  // Campaigns
  // ---------------------------------------------------------------------------

  async createCampaign(dto: CreateRewardCampaignDto, adminId: string) {
    const earnFrom = new Date(dto.earnFrom);
    const earnTo = new Date(dto.earnTo);
    this.assertValidWindow(earnFrom, earnTo);
    validateBenefitFields(dto, 'REWARD');
    this.assertValidAccumulation(dto.accumulation);

    const code = dto.code.trim().toUpperCase();
    await this.assertCodeFree(code);

    const status = dto.status ?? RewardCampaignStatus.ACTIVE;
    if (status === RewardCampaignStatus.ACTIVE) {
      await this.assertNoOverlap(dto.trigger, earnFrom, earnTo);
    }

    const campaign = await this.campaignModel.create({
      name: dto.name,
      description: dto.description,
      imageUrl: dto.imageUrl,
      trigger: dto.trigger,
      code,
      status,
      earnFrom,
      earnTo,
      validityDays: dto.validityDays ?? 30,
      requiresApproval: dto.requiresApproval ?? true,
      accumulation: {
        enabled: dto.accumulation?.enabled ?? false,
        maxPerUser: dto.accumulation?.enabled
          ? dto.accumulation.maxPerUser
          : undefined,
      },
      discountType: dto.discountType,
      discountValue: dto.discountValue,
      minOrderAmount: dto.minOrderAmount,
      maxDiscountAmount: dto.maxDiscountAmount,
      targetCategory: dto.targetCategory,
      targetFoodItemIds: this.toObjectIds(dto.targetFoodItemIds),
      maxFreeQuantity: dto.maxFreeQuantity,
      buyQuantity: dto.buyQuantity,
      getFreeQuantity: dto.getFreeQuantity,
      maxRedeemablePerOrder: dto.maxRedeemablePerOrder,
      createdBy: new Types.ObjectId(adminId),
    });

    return {
      success: true,
      message: 'Reward campaign created successfully',
      data: this.toCampaignResponse(campaign, {}),
    };
  }

  async updateCampaign(id: string, dto: UpdateRewardCampaignDto) {
    const existing = await this.getCampaignOrThrow(id);

    const earnFrom = dto.earnFrom ? new Date(dto.earnFrom) : existing.earnFrom;
    const earnTo = dto.earnTo ? new Date(dto.earnTo) : existing.earnTo;
    this.assertValidWindow(earnFrom, earnTo);

    const $set: Record<string, unknown> = {};
    const $unset: Record<string, 1> = {};

    for (const key of [
      'name',
      'description',
      'imageUrl',
      'status',
      'validityDays',
      'requiresApproval',
      'discountType',
    ] as const) {
      if (dto[key] !== undefined) $set[key] = dto[key];
    }
    if (dto.earnFrom) $set.earnFrom = earnFrom;
    if (dto.earnTo) $set.earnTo = earnTo;

    if (dto.accumulation) {
      this.assertValidAccumulation(dto.accumulation);
      $set.accumulation = {
        enabled: dto.accumulation.enabled,
        maxPerUser: dto.accumulation.enabled
          ? dto.accumulation.maxPerUser
          : undefined,
      };
    }

    // Benefit fields: a value sets it, null clears it, absent leaves it alone
    const merged: Record<string, unknown> = {
      discountType: existing.discountType,
      discountValue: existing.discountValue,
      minOrderAmount: existing.minOrderAmount,
      maxDiscountAmount: existing.maxDiscountAmount,
      targetCategory: existing.targetCategory,
      targetFoodItemIds: existing.targetFoodItemIds?.map((x) => x.toString()),
      maxFreeQuantity: existing.maxFreeQuantity,
      buyQuantity: existing.buyQuantity,
      getFreeQuantity: existing.getFreeQuantity,
      maxRedeemablePerOrder: existing.maxRedeemablePerOrder,
    };
    if (dto.discountType !== undefined) merged.discountType = dto.discountType;
    for (const key of CLEARABLE_BENEFIT_FIELDS) {
      const value = (dto as Record<string, unknown>)[key];
      if (value === null) {
        merged[key] = undefined;
        $unset[key] = 1;
      } else if (value !== undefined) {
        merged[key] = value;
        $set[key] =
          key === 'targetFoodItemIds'
            ? this.toObjectIds(value as string[])
            : value;
      }
    }
    validateBenefitFields(merged, 'REWARD');

    if (dto.code !== undefined) {
      const code = dto.code.trim().toUpperCase();
      if (code !== existing.code) {
        await this.assertCodeFree(code, existing._id);
        $set.code = code;
      }
    }

    const resultingStatus = dto.status ?? existing.status;
    if (resultingStatus === RewardCampaignStatus.ACTIVE) {
      await this.assertNoOverlap(
        existing.trigger,
        earnFrom,
        earnTo,
        existing._id,
      );
    }

    const updated = await this.campaignModel
      .findByIdAndUpdate(
        existing._id,
        {
          ...(Object.keys($set).length ? { $set } : {}),
          ...(Object.keys($unset).length ? { $unset } : {}),
        },
        { new: true },
      )
      .exec();

    return {
      success: true,
      message: 'Reward campaign updated successfully',
      data: this.toCampaignResponse(
        updated as RewardCampaignDocument,
        await this.statsFor([existing._id]).then((m) => m.get(id) ?? {}),
      ),
    };
  }

  async listCampaigns() {
    const campaigns = await this.campaignModel
      .find()
      .sort({ createdAt: -1 })
      .exec();
    const stats = await this.statsFor(campaigns.map((c) => c._id));
    return {
      success: true,
      message: 'Reward campaigns retrieved successfully',
      data: {
        campaigns: campaigns.map((c) =>
          this.toCampaignResponse(c, stats.get(c._id.toString()) ?? {}),
        ),
      },
    };
  }

  async getCampaign(id: string) {
    const campaign = await this.getCampaignOrThrow(id);
    const stats = await this.statsFor([campaign._id]);
    return {
      success: true,
      message: 'Reward campaign retrieved successfully',
      data: this.toCampaignResponse(campaign, stats.get(id) ?? {}),
    };
  }

  // ---------------------------------------------------------------------------
  // Who has earned it
  // ---------------------------------------------------------------------------

  async listGrants(campaignId: string, query: GetRewardGrantsDto) {
    const campaign = await this.getCampaignOrThrow(campaignId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const filter: Record<string, unknown> = { campaignId: campaign._id };
    if (query.status) filter.status = query.status;

    const [grants, total] = await Promise.all([
      this.grantModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.grantModel.countDocuments(filter),
    ]);

    const userIds = [...new Set(grants.map((g) => g.userId.toString()))];
    const orderIds = [
      ...new Set(
        grants.flatMap((g) =>
          [g.orderId, g.redeemedOrderId]
            .filter((x): x is Types.ObjectId => !!x)
            .map((x) => x.toString()),
        ),
      ),
    ];
    const [users, orders] = await Promise.all([
      this.userModel
        .find({ _id: { $in: userIds } })
        .select('firstName lastName email phone')
        .lean()
        .exec(),
      this.orderModel
        .find({ _id: { $in: orderIds } })
        .select('orderNumber')
        .lean()
        .exec(),
    ]);
    const userMap = new Map(users.map((u) => [String(u._id), u]));
    const orderMap = new Map(orders.map((o) => [String(o._id), o.orderNumber]));

    return {
      success: true,
      message: 'Reward grants retrieved successfully',
      data: {
        campaign: { id: campaignId, name: campaign.name, code: campaign.code },
        grants: grants.map((g) => {
          const u = userMap.get(g.userId.toString());
          return {
            id: g._id.toString(),
            status: this.effectiveStatus(g),
            earnedAt: g.createdAt,
            expiresAt: g.expiresAt,
            user: {
              id: g.userId.toString(),
              name: [u?.firstName, u?.lastName].filter(Boolean).join(' '),
              email: u?.email,
              phone: u?.phone,
            },
            source: { type: g.sourceType, id: g.sourceId.toString() },
            order: g.orderId
              ? {
                  id: g.orderId.toString(),
                  orderNumber: orderMap.get(g.orderId.toString()),
                }
              : null,
            redeemedAt: g.redeemedAt,
            redeemedOrder: g.redeemedOrderId
              ? {
                  id: g.redeemedOrderId.toString(),
                  orderNumber: orderMap.get(g.redeemedOrderId.toString()),
                }
              : null,
            revokedAt: g.revokedAt,
            revokeKind: g.revokeKind,
            revokedReason: g.revokedReason,
          };
        }),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        },
      },
    };
  }

  async revokeGrant(grantId: string, adminId: string, reason?: string) {
    const grant = await this.rewardsService.revokeGrant(
      grantId,
      adminId,
      reason,
    );
    return {
      success: true,
      message: 'Reward revoked successfully',
      data: {
        id: grant._id.toString(),
        status: grant.status,
        revokedAt: grant.revokedAt,
        revokedReason: grant.revokedReason,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** `earned` grants past their expiry are reported as `expired`. */
  effectiveStatus(grant: RewardGrantDocument): string {
    if (
      grant.status === RewardGrantStatus.EARNED &&
      grant.expiresAt.getTime() <= Date.now()
    ) {
      return 'expired';
    }
    return grant.status;
  }

  private async getCampaignOrThrow(
    id: string,
  ): Promise<RewardCampaignDocument> {
    const campaign = Types.ObjectId.isValid(id)
      ? await this.campaignModel.findById(id).exec()
      : null;
    if (!campaign) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'REWARD_CAMPAIGN_NOT_FOUND',
          message: 'Reward campaign not found',
        },
      });
    }
    return campaign;
  }

  private assertValidWindow(from: Date, to: Date): void {
    if (
      Number.isNaN(from.getTime()) ||
      Number.isNaN(to.getTime()) ||
      from >= to
    ) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'REWARD_INVALID_DATES',
          message: '`earnFrom` must be before `earnTo`',
        },
      });
    }
  }

  private assertValidAccumulation(accumulation?: {
    enabled: boolean;
    maxPerUser?: number;
  }): void {
    if (accumulation && !accumulation.enabled && accumulation.maxPerUser) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'REWARD_INVALID_ACCUMULATION',
          message: 'maxPerUser only applies when accumulation is enabled',
        },
      });
    }
  }

  /** Reward codes share one namespace with promotion and marketer codes. */
  private async assertCodeFree(
    code: string,
    excludeCampaignId?: Types.ObjectId,
  ): Promise<void> {
    const caseInsensitive = { locale: 'en', strength: 2 } as const;
    const [campaign, promotion, marketer] = await Promise.all([
      this.campaignModel
        .findOne({
          code,
          ...(excludeCampaignId ? { _id: { $ne: excludeCampaignId } } : {}),
        })
        .select('_id')
        .lean()
        .exec(),
      this.promotionModel
        .findOne({ discountCode: code })
        .collation(caseInsensitive)
        .select('_id')
        .lean()
        .exec(),
      this.marketerModel
        .findOne({ code })
        .collation(caseInsensitive)
        .select('_id')
        .lean()
        .exec(),
    ]);
    if (campaign || promotion || marketer) {
      throw new ConflictException({
        success: false,
        error: {
          code: 'REWARD_CODE_TAKEN',
          message:
            'That code is already used by a promotion, marketer or reward',
        },
      });
    }
  }

  /** Only one campaign per trigger can be earnable at any time. */
  private async assertNoOverlap(
    trigger: RewardTrigger,
    from: Date,
    to: Date,
    excludeId?: Types.ObjectId,
  ): Promise<void> {
    const clash = await this.campaignModel
      .findOne({
        trigger,
        status: RewardCampaignStatus.ACTIVE,
        earnFrom: { $lt: to },
        earnTo: { $gt: from },
        ...(excludeId ? { _id: { $ne: excludeId } } : {}),
      })
      .select('name')
      .lean()
      .exec();
    if (clash) {
      throw new ConflictException({
        success: false,
        error: {
          code: 'REWARD_CAMPAIGN_OVERLAP',
          message: `Another active "${trigger}" campaign ("${clash.name}") overlaps these dates`,
        },
      });
    }
  }

  private toObjectIds(ids?: string[]): Types.ObjectId[] | undefined {
    if (!ids?.length) return undefined;
    return ids
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));
  }

  private async statsFor(
    campaignIds: Types.ObjectId[],
  ): Promise<Map<string, Record<string, number>>> {
    const rows = await this.grantModel
      .aggregate<{
        _id: { campaignId: Types.ObjectId; status: string };
        n: number;
      }>([
        { $match: { campaignId: { $in: campaignIds } } },
        {
          $group: {
            _id: { campaignId: '$campaignId', status: '$status' },
            n: { $sum: 1 },
          },
        },
      ])
      .exec();
    const out = new Map<string, Record<string, number>>();
    for (const row of rows) {
      const key = row._id.campaignId.toString();
      const entry = out.get(key) ?? {};
      entry[row._id.status] = row.n;
      out.set(key, entry);
    }
    return out;
  }

  private toCampaignResponse(
    c: RewardCampaignDocument,
    stats: Record<string, number>,
  ) {
    const now = Date.now();
    return {
      id: c._id.toString(),
      name: c.name,
      description: c.description,
      imageUrl: c.imageUrl,
      trigger: c.trigger,
      code: c.code,
      status: c.status,
      earnFrom: c.earnFrom,
      earnTo: c.earnTo,
      isEarningOpen:
        c.status === RewardCampaignStatus.ACTIVE &&
        c.earnFrom.getTime() <= now &&
        c.earnTo.getTime() >= now,
      validityDays: c.validityDays,
      requiresApproval: c.requiresApproval,
      accumulation: {
        enabled: c.accumulation?.enabled ?? false,
        maxPerUser: c.accumulation?.maxPerUser,
      },
      benefit: {
        summary: describeBenefit(c),
        discountType: c.discountType,
        discountValue: c.discountValue,
        minOrderAmount: c.minOrderAmount,
        maxDiscountAmount: c.maxDiscountAmount,
        targetCategory: c.targetCategory,
        targetFoodItemIds: c.targetFoodItemIds?.map((x) => x.toString()),
        maxFreeQuantity: c.maxFreeQuantity,
        buyQuantity: c.buyQuantity,
        getFreeQuantity: c.getFreeQuantity,
        maxRedeemablePerOrder: c.maxRedeemablePerOrder,
      },
      stats: {
        earned: stats[RewardGrantStatus.EARNED] ?? 0,
        redeemed: stats[RewardGrantStatus.REDEEMED] ?? 0,
        revoked: stats[RewardGrantStatus.REVOKED] ?? 0,
      },
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  }
}

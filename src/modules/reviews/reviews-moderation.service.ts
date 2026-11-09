import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Review,
  ReviewDocument,
  ReviewModerationStatus,
  ReviewSource,
} from '../food-items/schemas/review.schema';
import {
  OrderReview,
  OrderReviewDocument,
} from './schemas/order-review.schema';
import {
  FoodItem,
  FoodItemDocument,
} from '../food-items/schemas/food-item.schema';
import { User, UserDocument } from '../auth/schemas/user.schema';
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import { RewardsService, GrantOutcome } from '../rewards/rewards.service';
import { RewardGrantDocument } from '../rewards/schemas/reward-grant.schema';
import { ReviewRatingsService } from './review-ratings.service';
import { AdminGetReviewsDto, ReviewKind } from './dto/admin-reviews.dto';
import {
  ORDER_REVIEW_SOURCE_TYPE,
  REVIEW_SOURCE_TYPE,
} from './reviews.constants';

/** What happened to the reward when a review was approved. */
function describeGrantOutcome(outcome: GrantOutcome | null) {
  if (!outcome) return { status: 'none' };
  switch (outcome.outcome) {
    case 'granted':
    case 'reinstated':
    case 'already_granted':
      return {
        status: outcome.outcome,
        grantId: outcome.grant._id.toString(),
        expiresAt: outcome.grant.expiresAt,
      };
    default:
      return { status: outcome.outcome };
  }
}

@Injectable()
export class ReviewsModerationService {
  constructor(
    @InjectModel(Review.name)
    private readonly reviewModel: Model<ReviewDocument>,
    @InjectModel(OrderReview.name)
    private readonly orderReviewModel: Model<OrderReviewDocument>,
    @InjectModel(FoodItem.name)
    private readonly foodItemModel: Model<FoodItemDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    private readonly rewardsService: RewardsService,
    private readonly ratingsService: ReviewRatingsService,
  ) {}

  // ---------------------------------------------------------------------------
  // Listing
  // ---------------------------------------------------------------------------

  async list(query: AdminGetReviewsDto) {
    const type = query.type ?? ReviewKind.ITEMS;
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    return type === ReviewKind.ORDERS
      ? this.listOrderReviews(query, page, limit)
      : this.listItemReviews(query, page, limit);
  }

  /** Reviews that predate moderation have no status; they count as pending. */
  private statusFilter(status?: ReviewModerationStatus) {
    if (!status) return {};
    return status === ReviewModerationStatus.PENDING
      ? { moderationStatus: { $in: [ReviewModerationStatus.PENDING, null] } }
      : { moderationStatus: status };
  }

  private async listItemReviews(
    query: AdminGetReviewsDto,
    page: number,
    limit: number,
  ) {
    // Copies made from a whole-order review are moderated through that review
    const filter = {
      source: { $ne: ReviewSource.ORDER },
      ...this.statusFilter(query.status),
    };
    const [reviews, total] = await Promise.all([
      this.reviewModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.reviewModel.countDocuments(filter),
    ]);

    const [users, foods, orders, grants] = await Promise.all([
      this.loadUsers(reviews.map((r) => r.userId)),
      this.foodItemModel
        .find({ _id: { $in: reviews.map((r) => r.foodItemId) } })
        .select('name imageUrl')
        .lean()
        .exec(),
      this.loadOrderNumbers(reviews.map((r) => r.orderId)),
      this.rewardsService.findGrantsBySource(
        REVIEW_SOURCE_TYPE,
        reviews.map((r) => r._id),
      ),
    ]);
    const foodMap = new Map(foods.map((f) => [String(f._id), f]));

    return {
      success: true,
      message: 'Reviews retrieved successfully',
      data: {
        type: ReviewKind.ITEMS,
        reviews: reviews.map((r) => ({
          id: r._id.toString(),
          rating: r.rating,
          comment: r.comment,
          status: r.moderationStatus ?? ReviewModerationStatus.PENDING,
          createdAt: r.createdAt,
          hiddenAt: r.hiddenAt,
          hiddenReason: r.hiddenReason,
          user: users.get(r.userId.toString()),
          foodItem: {
            id: r.foodItemId.toString(),
            name: foodMap.get(r.foodItemId.toString())?.name,
            imageUrl: foodMap.get(r.foodItemId.toString())?.imageUrl,
          },
          order: r.orderId
            ? {
                id: r.orderId.toString(),
                orderNumber: orders.get(r.orderId.toString()),
              }
            : null,
          reward: this.rewardView(
            r.rewardCampaignId,
            grants.get(r._id.toString()),
          ),
        })),
        pagination: this.pagination(page, limit, total),
      },
    };
  }

  private async listOrderReviews(
    query: AdminGetReviewsDto,
    page: number,
    limit: number,
  ) {
    const filter = this.statusFilter(query.status);
    const [reviews, total] = await Promise.all([
      this.orderReviewModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.orderReviewModel.countDocuments(filter),
    ]);

    const foodIds = reviews.flatMap((r) => r.foodItemIds);
    const [users, foods, orders, grants] = await Promise.all([
      this.loadUsers(reviews.map((r) => r.userId)),
      this.foodItemModel
        .find({ _id: { $in: foodIds } })
        .select('name')
        .lean()
        .exec(),
      this.loadOrderNumbers(reviews.map((r) => r.orderId)),
      this.rewardsService.findGrantsBySource(
        ORDER_REVIEW_SOURCE_TYPE,
        reviews.map((r) => r._id),
      ),
    ]);
    const foodNames = new Map(foods.map((f) => [String(f._id), f.name]));

    return {
      success: true,
      message: 'Order reviews retrieved successfully',
      data: {
        type: ReviewKind.ORDERS,
        reviews: reviews.map((r) => ({
          id: r._id.toString(),
          rating: r.rating,
          comment: r.comment,
          status: r.moderationStatus ?? ReviewModerationStatus.PENDING,
          createdAt: r.createdAt,
          hiddenAt: r.hiddenAt,
          hiddenReason: r.hiddenReason,
          user: users.get(r.userId.toString()),
          order: {
            id: r.orderId.toString(),
            orderNumber: orders.get(r.orderId.toString()),
          },
          appliedToItems: r.foodItemIds.map((id) => ({
            id: id.toString(),
            name: foodNames.get(id.toString()),
          })),
          reward: this.rewardView(
            r.rewardCampaignId,
            grants.get(r._id.toString()),
          ),
        })),
        pagination: this.pagination(page, limit, total),
      },
    };
  }

  private rewardView(
    campaignId: Types.ObjectId | undefined,
    grant: RewardGrantDocument | undefined,
  ) {
    return {
      campaignId: campaignId?.toString() ?? null,
      grant: grant
        ? {
            id: grant._id.toString(),
            status: grant.status,
            expiresAt: grant.expiresAt,
          }
        : null,
    };
  }

  // ---------------------------------------------------------------------------
  // Moderation actions
  // ---------------------------------------------------------------------------

  /** Approve a review: it stays live, and its reward (if any) is granted. */
  async approve(kind: ReviewKind, id: string, adminId: string) {
    const doc = await this.loadForModeration(kind, id);
    if (doc.moderationStatus === ReviewModerationStatus.HIDDEN) {
      throw new ConflictException({
        success: false,
        error: {
          code: 'REVIEW_HIDDEN',
          message: 'This review is hidden. Unhide it before approving.',
        },
      });
    }

    const now = new Date();
    const adminObjectId = new Types.ObjectId(adminId);
    if (doc.moderationStatus !== ReviewModerationStatus.APPROVED) {
      await this.setStatus(kind, doc._id, {
        $set: {
          moderationStatus: ReviewModerationStatus.APPROVED,
          approvedAt: now,
          approvedBy: adminObjectId,
        },
      });
    }

    // Re-running approve is safe: it only tops up a missing reward
    let outcome: GrantOutcome | null = null;
    if (doc.rewardCampaignId) {
      outcome = await this.rewardsService.grant({
        campaignId: doc.rewardCampaignId.toString(),
        userId: doc.userId.toString(),
        sourceType: this.sourceType(kind),
        sourceId: doc._id.toString(),
        orderId: this.orderIdOf(doc),
        grantedBy: adminId,
      });
    }

    return {
      success: true,
      message: 'Review approved',
      data: {
        id,
        status: ReviewModerationStatus.APPROVED,
        reward: describeGrantOutcome(outcome),
      },
    };
  }

  /**
   * Hide a review. It stops counting toward ratings and disappears everywhere
   * reviews are shown, and any reward it earned is taken back (unless the
   * customer has already used it).
   */
  async hide(kind: ReviewKind, id: string, adminId: string, reason?: string) {
    const doc = await this.loadForModeration(kind, id);

    // Safe to repeat: re-hiding just re-runs the rating and reward cleanup
    if (doc.moderationStatus !== ReviewModerationStatus.HIDDEN) {
      await this.setStatus(kind, doc._id, {
        $set: {
          moderationStatus: ReviewModerationStatus.HIDDEN,
          hiddenAt: new Date(),
          hiddenBy: new Types.ObjectId(adminId),
          ...(reason ? { hiddenReason: reason } : {}),
        },
      });
    }
    await this.ratingsService.recompute(this.affectedFoodItems(kind, doc));

    const reward = await this.rewardsService.revokeBySource(
      this.sourceType(kind),
      doc._id.toString(),
      { revokedBy: adminId, reason: reason ?? 'Review hidden' },
    );

    return {
      success: true,
      message: 'Review hidden',
      data: {
        id,
        status: ReviewModerationStatus.HIDDEN,
        reward: {
          revoked: reward.revoked > 0,
          // Already used: the discount cannot be taken back
          alreadyRedeemed: reward.alreadyRedeemed,
        },
      },
    };
  }

  /**
   * Bring a hidden review back. It returns to pending (counted in ratings
   * again); a reward is only granted again when an admin approves it.
   */
  async unhide(kind: ReviewKind, id: string) {
    const doc = await this.loadForModeration(kind, id);
    if (doc.moderationStatus === ReviewModerationStatus.HIDDEN) {
      await this.setStatus(kind, doc._id, {
        $set: { moderationStatus: ReviewModerationStatus.PENDING },
        $unset: {
          hiddenAt: 1,
          hiddenBy: 1,
          hiddenReason: 1,
          approvedAt: 1,
          approvedBy: 1,
        },
      });
      await this.ratingsService.recompute(this.affectedFoodItems(kind, doc));
    }
    return {
      success: true,
      message: 'Review restored',
      data: { id, status: ReviewModerationStatus.PENDING },
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private sourceType(kind: ReviewKind): string {
    return kind === ReviewKind.ORDERS
      ? ORDER_REVIEW_SOURCE_TYPE
      : REVIEW_SOURCE_TYPE;
  }

  private orderIdOf(
    doc: ReviewDocument | OrderReviewDocument,
  ): string | undefined {
    return doc.orderId?.toString();
  }

  private async loadForModeration(
    kind: ReviewKind,
    id: string,
  ): Promise<ReviewDocument | OrderReviewDocument> {
    const doc = Types.ObjectId.isValid(id)
      ? kind === ReviewKind.ORDERS
        ? await this.orderReviewModel.findById(id).exec()
        : await this.reviewModel.findById(id).exec()
      : null;
    if (!doc) {
      throw new NotFoundException({
        success: false,
        error: { code: 'REVIEW_NOT_FOUND', message: 'Review not found' },
      });
    }
    if (
      kind === ReviewKind.ITEMS &&
      (doc as ReviewDocument).source === ReviewSource.ORDER
    ) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'USE_ORDER_REVIEW',
          message:
            'This rating came from a whole-order review. Moderate the order review instead.',
          orderReviewId: (doc as ReviewDocument).orderReviewId?.toString(),
        },
      });
    }
    return doc;
  }

  /**
   * Apply a status change. For a whole-order review it cascades to the item
   * reviews copied from it, so the one decision covers the whole rating.
   */
  private async setStatus(
    kind: ReviewKind,
    id: Types.ObjectId,
    update: Record<string, unknown>,
  ): Promise<void> {
    if (kind === ReviewKind.ORDERS) {
      await this.orderReviewModel.updateOne({ _id: id }, update).exec();
      // The copies mirror the order review's status and hide details
      await this.reviewModel.updateMany({ orderReviewId: id }, update).exec();
    } else {
      await this.reviewModel.updateOne({ _id: id }, update).exec();
    }
  }

  private affectedFoodItems(
    kind: ReviewKind,
    doc: ReviewDocument | OrderReviewDocument,
  ): Types.ObjectId[] {
    return kind === ReviewKind.ORDERS
      ? (doc as OrderReviewDocument).foodItemIds
      : [(doc as ReviewDocument).foodItemId];
  }

  private async loadUsers(ids: Types.ObjectId[]) {
    const users = await this.userModel
      .find({ _id: { $in: ids } })
      .select('firstName lastName email phone')
      .lean()
      .exec();
    return new Map(
      users.map((u) => [
        String(u._id),
        {
          id: String(u._id),
          name: [u.firstName, u.lastName].filter(Boolean).join(' '),
          email: u.email,
          phone: u.phone,
        },
      ]),
    );
  }

  private async loadOrderNumbers(
    ids: Array<Types.ObjectId | undefined>,
  ): Promise<Map<string, string>> {
    const valid = ids.filter((x): x is Types.ObjectId => !!x);
    if (valid.length === 0) return new Map();
    const orders = await this.orderModel
      .find({ _id: { $in: valid } })
      .select('orderNumber')
      .lean()
      .exec();
    return new Map(orders.map((o) => [String(o._id), o.orderNumber]));
  }

  private pagination(page: number, limit: number, total: number) {
    return {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }
}

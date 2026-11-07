import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
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
  ReviewPrompt,
  ReviewPromptDocument,
  ReviewPromptStatus,
} from './schemas/review-prompt.schema';
import {
  Order,
  OrderDocument,
  OrderStatus,
} from '../orders/schemas/order.schema';
import {
  OrderItem,
  OrderItemDocument,
} from '../orders/schemas/order-item.schema';
import { RewardsService } from '../rewards/rewards.service';
import { RewardTrigger } from '../rewards/schemas/reward-campaign.schema';
import type { RewardCampaignDocument } from '../rewards/schemas/reward-campaign.schema';
import { describeBenefit } from '../rewards/reward-benefit';
import { NotificationsService } from '../notifications/notifications.service';
import { ReviewRatingsService } from './review-ratings.service';
import {
  ORDER_REVIEW_SOURCE_TYPE,
  REVIEW_SOURCE_TYPE,
} from './reviews.constants';
import {
  REVIEW_WINDOW_MS,
  buildReviewQueue,
  isWithinReviewWindow,
  reviewWindowCutoff,
  QueueEntry,
} from './review-queue';
import {
  SubmitItemReviewsDto,
  SubmitOrderReviewDto,
} from './dto/submit-reviews.dto';

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(
    @InjectModel(Review.name)
    private readonly reviewModel: Model<ReviewDocument>,
    @InjectModel(OrderReview.name)
    private readonly orderReviewModel: Model<OrderReviewDocument>,
    @InjectModel(ReviewPrompt.name)
    private readonly promptModel: Model<ReviewPromptDocument>,
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    @InjectModel(OrderItem.name)
    private readonly orderItemModel: Model<OrderItemDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly rewardsService: RewardsService,
    private readonly ratingsService: ReviewRatingsService,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
  ) {}

  // ---------------------------------------------------------------------------
  // The prompt queue
  // ---------------------------------------------------------------------------

  /** Delivered orders still inside the review window that need a prompt, newest first. */
  private async loadQueue(userId: string): Promise<QueueEntry[]> {
    const userObjectId = new Types.ObjectId(userId);
    const orders = await this.orderModel
      .find({
        userId: userObjectId,
        status: OrderStatus.DELIVERED,
        deliveredAt: { $gte: reviewWindowCutoff() },
      })
      .select('orderNumber createdAt deliveredAt')
      .sort({ deliveredAt: -1 })
      .limit(50)
      .lean()
      .exec();
    if (orders.length === 0) return [];

    const orderIds = orders.map((o) => o._id);
    const [prompts, items] = await Promise.all([
      this.promptModel
        .find({ userId: userObjectId, orderId: { $in: orderIds } })
        .select('orderId')
        .lean()
        .exec(),
      this.orderItemModel
        .find({ orderId: { $in: orderIds } })
        .sort({ createdAt: 1 })
        .lean()
        .exec(),
    ]);

    // A review the customer already left on a meal (on any order, even one an
    // admin later hid) means that meal cannot be reviewed again.
    const reviews = await this.reviewModel
      .find({
        userId: userObjectId,
        foodItemId: { $in: items.map((i) => i.foodItemId) },
      })
      .select('foodItemId')
      .lean()
      .exec();

    return buildReviewQueue({
      orders,
      items,
      resolvedOrderIds: new Set(prompts.map((p) => p.orderId.toString())),
      reviewedFoodItemIds: new Set(reviews.map((r) => r.foodItemId.toString())),
    });
  }

  /** What to show the customer when they open the app. */
  async getPending(userId: string, isDemo = false) {
    const queue = isDemo ? [] : await this.loadQueue(userId);
    const head = queue[0];

    return {
      success: true,
      message: head ? 'Review prompt retrieved' : 'Nothing to review',
      data: {
        prompt: head
          ? {
              orderId: head.order._id.toString(),
              orderNumber: head.order.orderNumber,
              orderedAt: head.order.createdAt,
              deliveredAt: head.order.deliveredAt,
              reviewableUntil: head.order.deliveredAt
                ? new Date(head.order.deliveredAt.getTime() + REVIEW_WINDOW_MS)
                : undefined,
              items: head.items,
            }
          : null,
        // Orders waiting, including this one. Call again after resolving to get the next.
        queueSize: queue.length,
        reward: await this.describeReward(userId),
      },
    };
  }

  /** Whether reviewing right now would earn a special reward, and what it is. */
  private async describeReward(userId: string) {
    const campaign = await this.rewardsService.findEarningCampaign(
      RewardTrigger.REVIEW,
    );
    if (!campaign) return { available: false };
    const canEarn = await this.rewardsService.userCanEarn(campaign, userId);
    return {
      available: canEarn,
      campaign: {
        id: campaign._id.toString(),
        name: campaign.name,
        description: campaign.description,
        benefit: describeBenefit(campaign),
        earnUntil: campaign.earnTo,
        validityDays: campaign.validityDays,
      },
      requiresApproval: campaign.requiresApproval,
      canEarnMultiple: campaign.accumulation?.enabled ?? false,
    };
  }

  // ---------------------------------------------------------------------------
  // Submitting
  // ---------------------------------------------------------------------------

  /** The order must be the customer's, delivered recently, and not already dealt with. */
  private async loadReviewableOrder(
    userId: string,
    orderId: string,
  ): Promise<OrderDocument> {
    const order = Types.ObjectId.isValid(orderId)
      ? await this.orderModel
          .findOne({
            _id: orderId,
            userId: new Types.ObjectId(userId),
          })
          .exec()
      : null;
    if (!order) {
      throw new NotFoundException({
        success: false,
        error: { code: 'ORDER_NOT_FOUND', message: 'Order not found' },
      });
    }
    if (order.status !== OrderStatus.DELIVERED) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'ORDER_NOT_DELIVERED',
          message: 'You can only review an order after it has been delivered',
        },
      });
    }
    if (!isWithinReviewWindow(order.deliveredAt)) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'REVIEW_WINDOW_CLOSED',
          message: 'This order can no longer be reviewed',
        },
      });
    }
    if (await this.promptModel.exists({ orderId: order._id })) {
      throw this.alreadyResolved();
    }
    return order;
  }

  private alreadyResolved(): ConflictException {
    return new ConflictException({
      success: false,
      error: {
        code: 'ORDER_ALREADY_RESOLVED',
        message: 'You have already reviewed or skipped this order',
      },
    });
  }

  /** The distinct meals on an order, with the name used in notifications. */
  private async loadOrderMeals(
    orderId: Types.ObjectId,
  ): Promise<Map<string, string>> {
    const items = await this.orderItemModel
      .find({ orderId })
      .select('foodItemId name')
      .lean()
      .exec();
    return new Map(items.map((i) => [i.foodItemId.toString(), i.name]));
  }

  private async findReviewedMeals(
    userId: string,
    foodItemIds: string[],
  ): Promise<Set<string>> {
    const reviews = await this.reviewModel
      .find({
        userId: new Types.ObjectId(userId),
        foodItemId: { $in: foodItemIds.map((id) => new Types.ObjectId(id)) },
      })
      .select('foodItemId')
      .lean()
      .exec();
    return new Set(reviews.map((r) => r.foodItemId.toString()));
  }

  /**
   * Run `work` in a transaction, turning the unique-index violations that mean
   * "someone got there first" into the right 409.
   */
  private async inTransaction(
    work: (session: ClientSession) => Promise<void>,
  ): Promise<void> {
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(() => work(session));
    } catch (err) {
      const e = err as { code?: number; message?: string };
      if (e?.code === 11000) {
        if (String(e.message).includes('foodItemId')) {
          throw new ConflictException({
            success: false,
            error: {
              code: 'ALREADY_REVIEWED',
              message: 'You have already reviewed one of these items',
            },
          });
        }
        throw this.alreadyResolved();
      }
      throw err;
    } finally {
      await session.endSession();
    }
  }

  /** Review individual items of an order. */
  async submitItemReviews(
    userId: string,
    orderId: string,
    dto: SubmitItemReviewsDto,
  ) {
    const order = await this.loadReviewableOrder(userId, orderId);
    const meals = await this.loadOrderMeals(order._id);

    const ids = dto.reviews.map((r) => r.foodItemId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'DUPLICATE_ITEMS',
          message: 'Each item can only be reviewed once',
        },
      });
    }
    const notInOrder = ids.filter((id) => !meals.has(id));
    if (notInOrder.length > 0) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'ITEM_NOT_IN_ORDER',
          message: 'You can only review items that were in this order',
          details: notInOrder,
        },
      });
    }
    const alreadyReviewed = await this.findReviewedMeals(userId, ids);
    if (alreadyReviewed.size > 0) {
      throw new ConflictException({
        success: false,
        error: {
          code: 'ALREADY_REVIEWED',
          message: 'You have already reviewed one of these items',
          details: [...alreadyReviewed],
        },
      });
    }

    const campaign = await this.rewardsService.findEarningCampaign(
      RewardTrigger.REVIEW,
    );
    const userObjectId = new Types.ObjectId(userId);

    let created: ReviewDocument[] = [];
    await this.inTransaction(async (session) => {
      await this.promptModel.create(
        [
          {
            userId: userObjectId,
            orderId: order._id,
            status: ReviewPromptStatus.COMPLETED,
            kind: 'items',
          },
        ],
        { session },
      );
      created = await this.reviewModel.insertMany(
        dto.reviews.map((r) => ({
          foodItemId: new Types.ObjectId(r.foodItemId),
          userId: userObjectId,
          rating: r.rating,
          comment: r.comment || undefined,
          orderId: order._id,
          source: ReviewSource.ITEM,
          moderationStatus: ReviewModerationStatus.PENDING,
          rewardCampaignId: campaign?._id,
        })),
        { session },
      );
    });

    await this.afterSubmit(
      created.map((r) => r.foodItemId),
      userId,
    );

    // Some campaigns grant straight away instead of waiting for an admin
    if (campaign && !campaign.requiresApproval) {
      for (const review of created) {
        await this.rewardsService
          .grant({
            campaignId: campaign._id.toString(),
            userId,
            sourceType: REVIEW_SOURCE_TYPE,
            sourceId: review._id.toString(),
            orderId: order._id.toString(),
          })
          .catch((err) => this.logger.warn(`Auto reward grant failed: ${err}`));
      }
    }

    for (const review of created) {
      this.notifyAdmins(
        order._id.toString(),
        meals.get(review.foodItemId.toString()) ?? 'an item',
        review.rating,
        review._id.toString(),
        review.comment,
      );
    }

    return {
      success: true,
      message: 'Thanks for your review!',
      data: {
        reviews: created.map((r) => ({
          id: r._id.toString(),
          foodItemId: r.foodItemId.toString(),
          rating: r.rating,
          comment: r.comment,
        })),
        reward: await this.rewardOutcome(campaign, userId),
        queueSize: (await this.loadQueue(userId)).length,
      },
    };
  }

  /** Review a whole order: the rating is applied to every item not yet reviewed. */
  async submitOrderReview(
    userId: string,
    orderId: string,
    dto: SubmitOrderReviewDto,
  ) {
    const order = await this.loadReviewableOrder(userId, orderId);
    const meals = await this.loadOrderMeals(order._id);

    const alreadyReviewed = await this.findReviewedMeals(userId, [
      ...meals.keys(),
    ]);
    const toReview = [...meals.keys()].filter((id) => !alreadyReviewed.has(id));
    if (toReview.length === 0) {
      throw new ConflictException({
        success: false,
        error: {
          code: 'NOTHING_TO_REVIEW',
          message: 'You have already reviewed every item in this order',
        },
      });
    }

    const campaign = await this.rewardsService.findEarningCampaign(
      RewardTrigger.REVIEW,
    );
    const userObjectId = new Types.ObjectId(userId);
    const foodItemIds = toReview.map((id) => new Types.ObjectId(id));

    let orderReview!: OrderReviewDocument;
    await this.inTransaction(async (session) => {
      await this.promptModel.create(
        [
          {
            userId: userObjectId,
            orderId: order._id,
            status: ReviewPromptStatus.COMPLETED,
            kind: 'order',
          },
        ],
        { session },
      );
      const [createdOrderReview] = await this.orderReviewModel.create(
        [
          {
            userId: userObjectId,
            orderId: order._id,
            rating: dto.rating,
            comment: dto.comment || undefined,
            foodItemIds,
            moderationStatus: ReviewModerationStatus.PENDING,
            rewardCampaignId: campaign?._id,
          },
        ],
        { session },
      );
      orderReview = createdOrderReview;
      await this.reviewModel.insertMany(
        foodItemIds.map((foodItemId) => ({
          foodItemId,
          userId: userObjectId,
          rating: dto.rating,
          comment: dto.comment || undefined,
          orderId: order._id,
          source: ReviewSource.ORDER,
          orderReviewId: orderReview._id,
          moderationStatus: ReviewModerationStatus.PENDING,
        })),
        { session },
      );
    });

    await this.afterSubmit(foodItemIds, userId);

    if (campaign && !campaign.requiresApproval) {
      await this.rewardsService
        .grant({
          campaignId: campaign._id.toString(),
          userId,
          sourceType: ORDER_REVIEW_SOURCE_TYPE,
          sourceId: orderReview._id.toString(),
          orderId: order._id.toString(),
        })
        .catch((err) => this.logger.warn(`Auto reward grant failed: ${err}`));
    }

    this.notifyAdmins(
      order._id.toString(),
      'your whole order',
      dto.rating,
      orderReview._id.toString(),
      dto.comment,
    );

    return {
      success: true,
      message: 'Thanks for your review!',
      data: {
        review: {
          id: orderReview._id.toString(),
          orderId: order._id.toString(),
          rating: orderReview.rating,
          comment: orderReview.comment,
          appliedToItems: toReview,
        },
        reward: await this.rewardOutcome(campaign, userId),
        queueSize: (await this.loadQueue(userId)).length,
      },
    };
  }

  /** Skip an order: it leaves the queue and is not asked about again. */
  async dismiss(userId: string, orderId: string) {
    const order = Types.ObjectId.isValid(orderId)
      ? await this.orderModel
          .findOne({ _id: orderId, userId: new Types.ObjectId(userId) })
          .select('_id')
          .lean()
          .exec()
      : null;
    if (!order) {
      throw new NotFoundException({
        success: false,
        error: { code: 'ORDER_NOT_FOUND', message: 'Order not found' },
      });
    }

    try {
      await this.promptModel.create({
        userId: new Types.ObjectId(userId),
        orderId: order._id,
        status: ReviewPromptStatus.DISMISSED,
      });
    } catch (err) {
      // Already dealt with: skipping again is harmless
      if ((err as { code?: number }).code !== 11000) throw err;
    }

    return {
      success: true,
      message: 'Order skipped',
      data: { queueSize: (await this.loadQueue(userId)).length },
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Reviews are live straight away, so refresh the ratings they affect. */
  private async afterSubmit(
    foodItemIds: Types.ObjectId[],
    userId: string,
  ): Promise<void> {
    try {
      await this.ratingsService.recompute(foodItemIds);
    } catch (err) {
      // The reviews are saved; ratings are corrected on the next recompute
      this.logger.error(
        `Failed to recompute ratings after review by ${userId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** What the customer should be told about a reward for what they just submitted. */
  private async rewardOutcome(
    campaign: RewardCampaignDocument | null,
    userId: string,
  ) {
    if (!campaign) return { eligible: false };
    const canEarn = await this.rewardsService.userCanEarn(campaign, userId);
    return {
      // After an automatic grant the user is at their limit, so this reads "no" correctly
      eligible: campaign.requiresApproval ? canEarn : true,
      requiresApproval: campaign.requiresApproval,
      benefit: describeBenefit(campaign),
      campaignName: campaign.name,
    };
  }

  private notifyAdmins(
    orderId: string,
    itemName: string,
    rating: number,
    reviewId: string,
    comment?: string,
  ): void {
    this.notificationsService
      .notifyPickupLocationAdminsNewReview(
        orderId,
        itemName,
        rating,
        reviewId,
        comment,
      )
      .catch((err) =>
        this.logger.warn(
          `Failed to notify admins of new review: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
  }
}

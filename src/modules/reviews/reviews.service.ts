import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
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
import {
  FoodItem,
  FoodItemDocument,
} from '../food-items/schemas/food-item.schema';
import { CreateReviewDto } from '../food-items/dto/create-review.dto';
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
    @InjectModel(FoodItem.name)
    private readonly foodItemModel: Model<FoodItemDocument>,
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

  /**
   * The order must be the customer's and delivered. There is deliberately NO
   * time limit here: a customer can review anything from a delivered order at
   * any time. The 2-day window only decides what the app *prompts* about.
   */
  private async loadDeliveredOrder(
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
    return order;
  }

  private alreadyResolved(): ConflictException {
    return new ConflictException({
      success: false,
      error: {
        code: 'ORDER_ALREADY_RESOLVED',
        message: 'You have already left a review for this whole order',
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
    const order = await this.loadDeliveredOrder(userId, orderId);
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

    await this.markOrderHandled(userId, order._id, 'items');
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
    const order = await this.loadDeliveredOrder(userId, orderId);
    if (await this.orderReviewModel.exists({ orderId: order._id })) {
      throw this.alreadyResolved();
    }
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

    await this.markOrderHandled(userId, order._id, 'order');
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

  /**
   * Skip an order: it leaves the prompt queue and is not asked about again.
   * This only affects the prompt. The customer can still review the order's
   * items later (e.g. from order history).
   */
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
      // $setOnInsert: skipping an order already handled must not change it
      await this.promptModel.updateOne(
        { orderId: order._id },
        {
          $setOnInsert: {
            userId: new Types.ObjectId(userId),
            status: ReviewPromptStatus.DISMISSED,
          },
        },
        { upsert: true },
      );
    } catch (err) {
      // Two skips racing each other: harmless
      if ((err as { code?: number }).code !== 11000) throw err;
    }

    return {
      success: true,
      message: 'Order skipped',
      data: { queueSize: (await this.loadQueue(userId)).length },
    };
  }

  // ---------------------------------------------------------------------------
  // Single-item review (POST /food-items/:id/reviews)
  // ---------------------------------------------------------------------------

  /**
   * Review one meal, from a food item page or order history. The customer must
   * have received it: it has to be in one of their delivered orders (the one in
   * `dto.orderId`, or else their most recent delivered order containing it).
   * No time limit. Earns the same reward as the order flow.
   */
  async submitSingleReview(
    userId: string,
    foodItemIdOrSlug: string,
    dto: CreateReviewDto,
  ) {
    const foodItem = Types.ObjectId.isValid(foodItemIdOrSlug)
      ? await this.foodItemModel.findById(foodItemIdOrSlug).exec()
      : await this.foodItemModel.findOne({ slug: foodItemIdOrSlug }).exec();
    if (!foodItem) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'FOOD_ITEM_NOT_FOUND',
          message: 'Food item not found',
        },
      });
    }

    const order = await this.findDeliveredOrderContaining(
      userId,
      foodItem._id,
      dto.orderId,
    );

    const userObjectId = new Types.ObjectId(userId);
    if (
      await this.reviewModel.exists({
        foodItemId: foodItem._id,
        userId: userObjectId,
      })
    ) {
      throw new ConflictException({
        success: false,
        error: {
          code: 'ALREADY_REVIEWED',
          message: 'You have already reviewed this food item',
        },
      });
    }

    const campaign = await this.rewardsService.findEarningCampaign(
      RewardTrigger.REVIEW,
    );

    let review: ReviewDocument;
    try {
      review = await this.reviewModel.create({
        foodItemId: foodItem._id,
        userId: userObjectId,
        rating: dto.rating,
        comment: dto.comment || undefined,
        orderId: order._id,
        source: ReviewSource.ITEM,
        moderationStatus: ReviewModerationStatus.PENDING,
        rewardCampaignId: campaign?._id,
      });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        throw new ConflictException({
          success: false,
          error: {
            code: 'ALREADY_REVIEWED',
            message: 'You have already reviewed this food item',
          },
        });
      }
      throw err;
    }

    await this.afterSubmit([foodItem._id], userId);

    if (campaign && !campaign.requiresApproval) {
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

    this.notifyAdmins(
      order._id.toString(),
      foodItem.name,
      review.rating,
      review._id.toString(),
      review.comment,
    );

    return {
      success: true,
      message: 'Review created successfully',
      data: {
        id: review._id.toString(),
        foodItemId: foodItem._id.toString(),
        userId,
        orderId: order._id.toString(),
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt?.toISOString(),
        reward: await this.rewardOutcome(campaign, userId),
      },
    };
  }

  /**
   * The customer's delivered order that contains this meal. With an explicit
   * order id that order is checked; without one, the most recent matching
   * delivered order is used (so older app builds that omit it still work).
   */
  private async findDeliveredOrderContaining(
    userId: string,
    foodItemId: Types.ObjectId,
    orderId?: string,
  ): Promise<OrderDocument> {
    if (orderId) {
      const order = await this.loadDeliveredOrder(userId, orderId);
      const inOrder = await this.orderItemModel.exists({
        orderId: order._id,
        foodItemId,
      });
      if (!inOrder) {
        throw new BadRequestException({
          success: false,
          error: {
            code: 'ITEM_NOT_IN_ORDER',
            message: 'You can only review items that were in this order',
          },
        });
      }
      return order;
    }

    const delivered = await this.orderModel
      .find({
        userId: new Types.ObjectId(userId),
        status: OrderStatus.DELIVERED,
      })
      .select('_id deliveredAt')
      .lean()
      .exec();
    const lines = delivered.length
      ? await this.orderItemModel
          .find({ orderId: { $in: delivered.map((o) => o._id) }, foodItemId })
          .select('orderId')
          .lean()
          .exec()
      : [];
    const matching = new Set(lines.map((l) => l.orderId.toString()));
    const latest = delivered
      .filter((o) => matching.has(o._id.toString()))
      .sort(
        (a, b) =>
          (b.deliveredAt?.getTime() ?? 0) - (a.deliveredAt?.getTime() ?? 0),
      )[0];
    if (!latest) {
      throw new ForbiddenException({
        success: false,
        error: {
          code: 'NOT_ORDERED',
          message: 'You can only review meals you have ordered and received',
        },
      });
    }
    return this.loadDeliveredOrder(userId, latest._id.toString());
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Remember that this order has been reviewed so it leaves the prompt queue.
   * Bookkeeping only (the review itself is already saved), so it must never
   * fail the request, and it never blocks reviewing again later.
   */
  private async markOrderHandled(
    userId: string,
    orderId: Types.ObjectId,
    kind: 'items' | 'order',
  ): Promise<void> {
    try {
      await this.promptModel.updateOne(
        { orderId },
        {
          $set: {
            userId: new Types.ObjectId(userId),
            status: ReviewPromptStatus.COMPLETED,
            kind,
          },
        },
        { upsert: true },
      );
    } catch (err) {
      if ((err as { code?: number }).code !== 11000) {
        this.logger.warn(
          `Could not mark order ${orderId.toString()} as reviewed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

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

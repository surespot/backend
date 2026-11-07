import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReviewsController } from './reviews.controller';
import { AdminReviewsController } from './admin-reviews.controller';
import { ReviewsService } from './reviews.service';
import { ReviewsModerationService } from './reviews-moderation.service';
import { ReviewRatingsService } from './review-ratings.service';
import { Review, ReviewSchema } from '../food-items/schemas/review.schema';
import { OrderReview, OrderReviewSchema } from './schemas/order-review.schema';
import {
  ReviewPrompt,
  ReviewPromptSchema,
} from './schemas/review-prompt.schema';
import { Order, OrderSchema } from '../orders/schemas/order.schema';
import {
  OrderItem,
  OrderItemSchema,
} from '../orders/schemas/order-item.schema';
import {
  FoodItem,
  FoodItemSchema,
} from '../food-items/schemas/food-item.schema';
import { User, UserSchema } from '../auth/schemas/user.schema';
import { RewardsModule } from '../rewards/rewards.module';
import { NotificationsModule } from '../notifications/notifications.module';

/**
 * Post-delivery review prompts, submissions and moderation. Rewards are earned
 * through RewardsModule; this module only tells it when someone qualifies.
 *
 * Like RewardsModule it registers the models it reads rather than importing
 * Orders / FoodItems, to stay out of their module cycles.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Review.name, schema: ReviewSchema },
      { name: OrderReview.name, schema: OrderReviewSchema },
      { name: ReviewPrompt.name, schema: ReviewPromptSchema },
      { name: Order.name, schema: OrderSchema },
      { name: OrderItem.name, schema: OrderItemSchema },
      { name: FoodItem.name, schema: FoodItemSchema },
      { name: User.name, schema: UserSchema },
    ]),
    RewardsModule,
    forwardRef(() => NotificationsModule),
  ],
  controllers: [ReviewsController, AdminReviewsController],
  providers: [ReviewsService, ReviewsModerationService, ReviewRatingsService],
})
export class ReviewsModule {}

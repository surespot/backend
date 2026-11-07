import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RewardsController } from './rewards.controller';
import { AdminRewardsController } from './admin-rewards.controller';
import { RewardsService } from './rewards.service';
import { RewardsAdminService } from './rewards-admin.service';
import { RewardsCustomerService } from './rewards-customer.service';
import {
  RewardCampaign,
  RewardCampaignSchema,
} from './schemas/reward-campaign.schema';
import { RewardGrant, RewardGrantSchema } from './schemas/reward-grant.schema';
import { Order, OrderSchema } from '../orders/schemas/order.schema';
import {
  FoodItem,
  FoodItemSchema,
} from '../food-items/schemas/food-item.schema';
import {
  Promotion,
  PromotionSchema,
} from '../promotions/schemas/promotion.schema';
import { Marketer, MarketerSchema } from '../marketers/schemas/marketer.schema';
import { User, UserSchema } from '../auth/schemas/user.schema';
import { NotificationsModule } from '../notifications/notifications.module';

/**
 * Special rewards: campaigns customers earn the right to use a code for.
 *
 * Deliberately a leaf in the module graph: it registers the Mongoose models it
 * reads instead of importing the Orders / FoodItems / Promotions / Auth modules,
 * so OrdersModule (and ReviewsModule) can import it without closing a cycle.
 * Only NotificationsModule is imported, via forwardRef, for user notifications.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RewardCampaign.name, schema: RewardCampaignSchema },
      { name: RewardGrant.name, schema: RewardGrantSchema },
      { name: Order.name, schema: OrderSchema },
      { name: FoodItem.name, schema: FoodItemSchema },
      { name: Promotion.name, schema: PromotionSchema },
      { name: Marketer.name, schema: MarketerSchema },
      { name: User.name, schema: UserSchema },
    ]),
    forwardRef(() => NotificationsModule),
  ],
  controllers: [RewardsController, AdminRewardsController],
  providers: [RewardsService, RewardsAdminService, RewardsCustomerService],
  exports: [RewardsService],
})
export class RewardsModule {}

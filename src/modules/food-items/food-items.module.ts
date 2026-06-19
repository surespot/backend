import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FoodItemsController } from './food-items.controller';
import { CategoriesController } from './categories.controller';
import { FoodExtrasController } from './food-extras.controller';
import { FoodItemsService } from './food-items.service';
import { FoodItemsRepository } from './food-items.repository';
import { FoodItem, FoodItemSchema } from './schemas/food-item.schema';
import { FoodExtra, FoodExtraSchema } from './schemas/food-extra.schema';
import {
  FoodInteraction,
  FoodInteractionSchema,
} from './schemas/food-interaction.schema';
import { Review, ReviewSchema } from './schemas/review.schema';
import { AuthModule } from '../auth/auth.module';
import { OrdersModule } from '../orders/orders.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FoodItem.name, schema: FoodItemSchema },
      { name: FoodExtra.name, schema: FoodExtraSchema },
      { name: FoodInteraction.name, schema: FoodInteractionSchema },
      { name: Review.name, schema: ReviewSchema },
    ]),
    forwardRef(() => AuthModule),
    forwardRef(() => OrdersModule),
    forwardRef(() => NotificationsModule),
  ],
  controllers: [
    FoodItemsController,
    CategoriesController,
    FoodExtrasController,
  ],
  providers: [FoodItemsService, FoodItemsRepository],
  exports: [FoodItemsService, FoodItemsRepository],
})
export class FoodItemsModule {}

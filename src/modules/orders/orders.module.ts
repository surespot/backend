import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrdersController, CheckoutController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrdersRepository } from './orders.repository';
import { Order, OrderSchema } from './schemas/order.schema';
import { OrderItem, OrderItemSchema } from './schemas/order-item.schema';
import { OrderExtra, OrderExtraSchema } from './schemas/order-extra.schema';
import {
  OrderDeliveryStatus,
  OrderDeliveryStatusSchema,
} from './schemas/order-delivery-status.schema';
import { AuthModule } from '../auth/auth.module';
import { CartModule } from '../cart/cart.module';
import { PickupLocationsModule } from '../pickup-locations/pickup-locations.module';
import { SavedLocationsModule } from '../saved-locations/saved-locations.module';
import { PromotionsModule } from '../promotions/promotions.module';
import { FoodItemsModule } from '../food-items/food-items.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TransactionsModule } from '../transactions/transactions.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: OrderItem.name, schema: OrderItemSchema },
      { name: OrderExtra.name, schema: OrderExtraSchema },
      { name: OrderDeliveryStatus.name, schema: OrderDeliveryStatusSchema },
    ]),
    AuthModule,
    forwardRef(() => CartModule),
    PickupLocationsModule,
    SavedLocationsModule,
    PromotionsModule,
    forwardRef(() => FoodItemsModule),
    NotificationsModule,
    forwardRef(() => TransactionsModule),
  ],
  controllers: [OrdersController, CheckoutController],
  providers: [OrdersService, OrdersRepository],
  exports: [OrdersService, OrdersRepository],
})
export class OrdersModule {}

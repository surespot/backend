import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { OrdersController, CheckoutController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrdersRepository } from './orders.repository';
import { OrdersGateway } from './orders.gateway';
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
import { RidersModule } from '../riders/riders.module';
import { WalletsModule } from '../wallets/wallets.module';
import { ChatModule } from '../chat/chat.module';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: OrderItem.name, schema: OrderItemSchema },
      { name: OrderExtra.name, schema: OrderExtraSchema },
      { name: OrderDeliveryStatus.name, schema: OrderDeliveryStatusSchema },
    ]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') ?? 'default-secret-key',
      }),
    }),
    AuthModule,
    forwardRef(() => CartModule),
    PickupLocationsModule,
    SavedLocationsModule,
    PromotionsModule,
    forwardRef(() => FoodItemsModule),
    NotificationsModule,
    forwardRef(() => TransactionsModule),
    forwardRef(() => RidersModule),
    forwardRef(() => WalletsModule),
    forwardRef(() => ChatModule),
    forwardRef(() => AdminModule),
  ],
  controllers: [OrdersController, CheckoutController],
  providers: [
    OrdersService,
    OrdersRepository,
    OrdersGateway,
    {
      provide: 'AdminGateway',
      useFactory: (adminModule: any) => {
        // Lazy load AdminGateway to avoid circular dependency
        return adminModule?.adminGateway;
      },
      inject: [{ token: 'AdminModule', optional: true }],
    },
  ],
  exports: [OrdersService, OrdersRepository, OrdersGateway],
})
export class OrdersModule {}

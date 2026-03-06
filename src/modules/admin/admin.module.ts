import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { AdminOrdersController } from './admin-orders.controller';
import { AdminOrdersService } from './admin-orders.service';
import { AdminMenuController } from './admin-menu.controller';
import { AdminMenuService } from './admin-menu.service';
import { AdminMenuRepository } from './admin-menu.repository';
import { AdminGateway } from './admin.gateway';
import { OrdersModule } from '../orders/orders.module';
import { FoodItemsModule } from '../food-items/food-items.module';
import { SupportModule } from '../support/support.module';
import { AdminSupportController } from '../support/admin-support.controller';
import { AdminSupportService } from '../support/admin-support.service';
import { AdminRefundsController } from './admin-refunds.controller';
import { AuthModule } from '../auth/auth.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { RidersModule } from '../riders/riders.module';
import { MailModule } from '../mail/mail.module';
import {
  WebSocketConnection,
  WebSocketConnectionSchema,
} from '../notifications/schemas/websocket-connection.schema';
import {
  PickupLocationItemAvailability,
  PickupLocationItemAvailabilitySchema,
} from './schemas/pickup-location-item-availability.schema';

@Module({
  imports: [
    TransactionsModule,
    forwardRef(() => OrdersModule),
    forwardRef(() => SupportModule),
    forwardRef(() => FoodItemsModule),
    forwardRef(() => AuthModule),
    MailModule,
    forwardRef(() => RidersModule),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') ?? 'default-secret-key',
      }),
    }),
    MongooseModule.forFeature([
      { name: WebSocketConnection.name, schema: WebSocketConnectionSchema },
      {
        name: PickupLocationItemAvailability.name,
        schema: PickupLocationItemAvailabilitySchema,
      },
    ]),
  ],
  controllers: [
    DashboardController,
    AdminOrdersController,
    AdminMenuController,
    AdminSupportController,
    AdminRefundsController,
  ],
  providers: [
    DashboardService,
    AdminOrdersService,
    AdminSupportService,
    AdminMenuService,
    AdminMenuRepository,
    AdminGateway,
    {
      provide: 'AdminModule',
      useFactory: (adminGateway: AdminGateway) => ({ adminGateway }),
      inject: [AdminGateway],
    },
  ],
  exports: [
    DashboardService,
    AdminOrdersService,
    AdminMenuRepository,
    AdminGateway,
    'AdminModule',
  ],
})
export class AdminModule {}

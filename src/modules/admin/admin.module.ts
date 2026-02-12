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
import { AuthModule } from '../auth/auth.module';
import { RidersModule } from '../riders/riders.module';
import { CloudinaryModule } from '../../common/cloudinary/cloudinary.module';
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
    forwardRef(() => OrdersModule),
    forwardRef(() => FoodItemsModule),
    AuthModule,
    RidersModule,
    CloudinaryModule,
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
  ],
  providers: [
    DashboardService,
    AdminOrdersService,
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

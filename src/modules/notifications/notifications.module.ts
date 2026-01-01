import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsRepository } from './notifications.repository';
import { NotificationsGateway } from './notifications.gateway';
import { PushNotificationService } from './push-notification.service';
import { NotificationContextService } from './notification-context.service';
import { NotificationsProcessor } from './notifications.processor';
import {
  Notification,
  NotificationSchema,
} from './schemas/notification.schema';
import {
  WebSocketConnection,
  WebSocketConnectionSchema,
} from './schemas/websocket-connection.schema';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';
import { SmsModule } from '../sms/sms.module';
import { OrdersModule } from '../orders/orders.module';
import { PickupLocationsModule } from '../pickup-locations/pickup-locations.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
      { name: WebSocketConnection.name, schema: WebSocketConnectionSchema },
    ]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret:
          configService.get<string>('JWT_SECRET') ?? 'default-secret-key',
      }),
    }),
    BullModule.registerQueue({
      name: 'notifications',
    }),
    AuthModule,
    MailModule,
    SmsModule,
    forwardRef(() => OrdersModule),
    PickupLocationsModule,
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsRepository,
    NotificationsGateway,
    PushNotificationService,
    NotificationContextService,
    NotificationsProcessor,
  ],
  exports: [
    NotificationsService,
    NotificationsRepository,
    NotificationsGateway,
    PushNotificationService,
  ],
})
export class NotificationsModule {}

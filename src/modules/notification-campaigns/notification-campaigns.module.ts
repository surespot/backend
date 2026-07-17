import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { NotificationCampaignService } from './notification-campaign.service';
import { NotificationCampaignResolverService } from './notification-campaign-resolver.service';
import { NotificationCampaignProcessor } from './notification-campaign.processor';
import {
  NotificationCampaign,
  NotificationCampaignSchema,
} from './schemas/notification-campaign.schema';
import { User, UserSchema } from '../auth/schemas/user.schema';
import { OrdersModule } from '../orders/orders.module';
import { RidersModule } from '../riders/riders.module';
import { SmsModule } from '../sms/sms.module';
import { MailModule } from '../mail/mail.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'notification-campaigns',
    }),
    MongooseModule.forFeature([
      { name: NotificationCampaign.name, schema: NotificationCampaignSchema },
      { name: User.name, schema: UserSchema },
    ]),
    forwardRef(() => OrdersModule),
    forwardRef(() => RidersModule),
    SmsModule,
    forwardRef(() => MailModule),
    forwardRef(() => NotificationsModule),
  ],
  providers: [
    NotificationCampaignService,
    NotificationCampaignResolverService,
    NotificationCampaignProcessor,
  ],
  exports: [NotificationCampaignService, NotificationCampaignResolverService],
})
export class NotificationCampaignsModule {}

import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PickupLocationsController } from './pickup-locations.controller';
import { PickupLocationsService } from './pickup-locations.service';
import { PickupLocationsRepository } from './pickup-locations.repository';
import {
  PickupLocation,
  PickupLocationSchema,
} from './schemas/pickup-location.schema';
import {
  PickupLocationWaitlist,
  PickupLocationWaitlistSchema,
} from './schemas/pickup-location-waitlist.schema';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';
import { SmsModule } from '../sms/sms.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SavedLocationsModule } from '../saved-locations/saved-locations.module';
import { AdminUsersController } from './admin-users.controller';
import { AdminOnboardingController } from './admin-onboarding.controller';
import { AdminPickupLocationsController } from './admin-pickup-locations.controller';
import { PlacesModule } from '../places/places.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PickupLocation.name, schema: PickupLocationSchema },
      { name: PickupLocationWaitlist.name, schema: PickupLocationWaitlistSchema },
    ]),
    forwardRef(() => AuthModule),
    forwardRef(() => MailModule),
    SmsModule,
    forwardRef(() => NotificationsModule),
    SavedLocationsModule,
    PlacesModule,
  ],
  controllers: [
    PickupLocationsController,
    AdminUsersController,
    AdminOnboardingController,
    AdminPickupLocationsController,
  ],
  providers: [PickupLocationsService, PickupLocationsRepository],
  exports: [PickupLocationsService, PickupLocationsRepository],
})
export class PickupLocationsModule {}

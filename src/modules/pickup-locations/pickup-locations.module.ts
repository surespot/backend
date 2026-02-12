import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PickupLocationsController } from './pickup-locations.controller';
import { PickupLocationsService } from './pickup-locations.service';
import { PickupLocationsRepository } from './pickup-locations.repository';
import {
  PickupLocation,
  PickupLocationSchema,
} from './schemas/pickup-location.schema';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';
import { AdminUsersController } from './admin-users.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PickupLocation.name, schema: PickupLocationSchema },
    ]),
    AuthModule,
    MailModule,
  ],
  controllers: [PickupLocationsController, AdminUsersController],
  providers: [PickupLocationsService, PickupLocationsRepository],
  exports: [PickupLocationsService, PickupLocationsRepository],
})
export class PickupLocationsModule {}

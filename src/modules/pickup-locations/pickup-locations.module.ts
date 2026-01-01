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

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PickupLocation.name, schema: PickupLocationSchema },
    ]),
    AuthModule,
  ],
  controllers: [PickupLocationsController],
  providers: [PickupLocationsService, PickupLocationsRepository],
  exports: [PickupLocationsService, PickupLocationsRepository],
})
export class PickupLocationsModule {}

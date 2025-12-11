import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SavedLocationsController } from './saved-locations.controller';
import { SavedLocationsService } from './saved-locations.service';
import { SavedLocationsRepository } from './saved-locations.repository';
import { AuthModule } from '../auth/auth.module';
import {
  SavedLocation,
  SavedLocationSchema,
} from './schemas/saved-location.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SavedLocation.name, schema: SavedLocationSchema },
    ]),
    AuthModule, // Import AuthModule to access JWT strategy and guard
  ],
  controllers: [SavedLocationsController],
  providers: [SavedLocationsService, SavedLocationsRepository],
  exports: [SavedLocationsService, SavedLocationsRepository],
})
export class SavedLocationsModule {}

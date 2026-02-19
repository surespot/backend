import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RegionsController } from './regions.controller';
import { RegionsService } from './regions.service';
import { RegionsRepository } from './regions.repository';
import { Region, RegionSchema } from './schemas/region.schema';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Region.name, schema: RegionSchema }]),
    forwardRef(() => AuthModule),
  ],
  controllers: [RegionsController],
  providers: [RegionsService, RegionsRepository],
  exports: [RegionsService, RegionsRepository],
})
export class RegionsModule {}

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PromotionsController } from './promotions.controller';
import { PromotionsService } from './promotions.service';
import { PromotionsRepository } from './promotions.repository';
import { Promotion, PromotionSchema } from './schemas/promotion.schema';
import { AuthModule } from '../auth/auth.module';
import { PromotionsScheduler } from './promotions.scheduler';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Promotion.name, schema: PromotionSchema },
    ]),
    AuthModule,
  ],
  controllers: [PromotionsController],
  providers: [PromotionsService, PromotionsRepository, PromotionsScheduler],
  exports: [PromotionsService, PromotionsRepository],
})
export class PromotionsModule {}

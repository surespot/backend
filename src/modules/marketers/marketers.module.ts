import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MarketersController } from './marketers.controller';
import { MarketersService } from './marketers.service';
import { MarketersRepository } from './marketers.repository';
import { Marketer, MarketerSchema } from './schemas/marketer.schema';
import { MarketerCodeUsage, MarketerCodeUsageSchema } from './schemas/marketer-code-usage.schema';
import { AuthModule } from '../auth/auth.module';
import { PromotionsModule } from '../promotions/promotions.module';
import { FoodItemsModule } from '../food-items/food-items.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Marketer.name, schema: MarketerSchema },
      { name: MarketerCodeUsage.name, schema: MarketerCodeUsageSchema },
    ]),
    forwardRef(() => AuthModule),
    PromotionsModule,
    FoodItemsModule,
  ],
  controllers: [MarketersController],
  providers: [MarketersService, MarketersRepository],
  exports: [MarketersService],
})
export class MarketersModule {}

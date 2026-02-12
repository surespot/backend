import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { RidersController } from './riders.controller';
import { RidersService } from './riders.service';
import { RidersRepository } from './riders.repository';
import { RidersScheduler } from './riders.scheduler';
import { RidersProcessor } from './riders.processor';
import { RiderLocationController } from './rider-location.controller';
import { RiderLocationService } from './rider-location.service';
import { RiderLocationRepository } from './rider-location.repository';
import {
  RiderProfile,
  RiderProfileSchema,
} from './schemas/rider-profile.schema';
import {
  RiderDocumentation,
  RiderDocumentationSchema,
} from './schemas/rider-documentation.schema';
import {
  RiderLocation,
  RiderLocationSchema,
} from './schemas/rider-location.schema';
import { AuthModule } from '../auth/auth.module';
import { SmsModule } from '../sms/sms.module';
import { MailModule } from '../mail/mail.module';
import { RegionsModule } from '../regions/regions.module';
import { forwardRef } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { TransactionsModule } from '../transactions/transactions.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RiderProfile.name, schema: RiderProfileSchema },
      { name: RiderDocumentation.name, schema: RiderDocumentationSchema },
      { name: RiderLocation.name, schema: RiderLocationSchema },
    ]),
    BullModule.registerQueue({
      name: 'riders',
    }),
    AuthModule,
    SmsModule,
    MailModule,
    RegionsModule,
    forwardRef(() => OrdersModule),
    TransactionsModule,
  ],
  controllers: [RidersController, RiderLocationController],
  providers: [
    RidersService,
    RidersRepository,
    RidersScheduler,
    RidersProcessor,
    RiderLocationService,
    RiderLocationRepository,
  ],
  exports: [RidersService, RidersRepository, RiderLocationRepository],
})
export class RidersModule {}

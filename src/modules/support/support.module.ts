import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SupportRequest, SupportRequestSchema } from './schemas/support-request.schema';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';
import { SupportRepository } from './support.repository';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SupportRequest.name, schema: SupportRequestSchema },
    ]),
    forwardRef(() => OrdersModule),
  ],
  controllers: [SupportController],
  providers: [SupportService, SupportRepository],
  exports: [SupportService, SupportRepository],
})
export class SupportModule {}

import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TransactionsService } from './transactions.service';
import { TransactionsRepository } from './transactions.repository';
import { PaymentReconciliationScheduler } from './payment-reconciliation.scheduler';
import { Transaction, TransactionSchema } from './schemas/transaction.schema';
import { TransactionsController } from './transactions.controller';
import { OrdersModule } from '../orders/orders.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { WalletsModule } from '../wallets/wallets.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Transaction.name, schema: TransactionSchema },
    ]),
    forwardRef(() => OrdersModule),
    forwardRef(() => NotificationsModule),
    forwardRef(() => WalletsModule),
  ],
  controllers: [TransactionsController],
  providers: [TransactionsService, TransactionsRepository, PaymentReconciliationScheduler],
  exports: [TransactionsService, TransactionsRepository],
})
export class TransactionsModule {}

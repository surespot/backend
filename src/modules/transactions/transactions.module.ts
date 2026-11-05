import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TransactionsService } from './transactions.service';
import { TransactionsRepository } from './transactions.repository';
import { PaymentReconciliationScheduler } from './payment-reconciliation.scheduler';
import { Transaction, TransactionSchema } from './schemas/transaction.schema';
import { TransactionsController } from './transactions.controller';
import { OrdersModule } from '../orders/orders.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { WalletsRepository } from '../wallets/wallets.repository';
import {
  RiderWallet,
  RiderWalletSchema,
} from '../wallets/schemas/rider-wallet.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Transaction.name, schema: TransactionSchema },
      { name: RiderWallet.name, schema: RiderWalletSchema },
    ]),
    forwardRef(() => OrdersModule),
    forwardRef(() => NotificationsModule),
  ],
  controllers: [TransactionsController],
  providers: [
    TransactionsService,
    TransactionsRepository,
    PaymentReconciliationScheduler,
    // Provided here (not via WalletsModule) so releasing failed withdrawals does not
    // add a TransactionsModule <-> WalletsModule import cycle
    WalletsRepository,
  ],
  exports: [TransactionsService, TransactionsRepository],
})
export class TransactionsModule {}

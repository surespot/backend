import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WalletsController } from './wallets.controller';
import { WalletsService } from './wallets.service';
import { WalletsRepository } from './wallets.repository';
import { WalletsScheduler } from './wallets.scheduler';
import { RiderWallet, RiderWalletSchema } from './schemas/rider-wallet.schema';
import { TransactionsModule } from '../transactions/transactions.module';
import { OrdersModule } from '../orders/orders.module';
import { RidersModule } from '../riders/riders.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RiderWallet.name, schema: RiderWalletSchema },
    ]),
    forwardRef(() => TransactionsModule),
    forwardRef(() => OrdersModule),
    forwardRef(() => RidersModule),
  ],
  controllers: [WalletsController],
  providers: [WalletsService, WalletsRepository, WalletsScheduler],
  exports: [WalletsService, WalletsRepository],
})
export class WalletsModule {}

import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WalletsController } from './wallets.controller';
import { WalletsService } from './wallets.service';
import { WalletsRepository } from './wallets.repository';
import { RiderWallet, RiderWalletSchema } from './schemas/rider-wallet.schema';
import { AuthModule } from '../auth/auth.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { OrdersModule } from '../orders/orders.module';
import { RidersModule } from '../riders/riders.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RiderWallet.name, schema: RiderWalletSchema },
    ]),
    forwardRef(() => AuthModule),
    forwardRef(() => TransactionsModule),
    forwardRef(() => OrdersModule),
    forwardRef(() => RidersModule),
    forwardRef(() => NotificationsModule),
  ],
  controllers: [WalletsController],
  providers: [WalletsService, WalletsRepository],
  exports: [WalletsService, WalletsRepository],
})
export class WalletsModule {}

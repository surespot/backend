import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { CartRepository } from './cart.repository';
import { CartScheduler } from './cart.scheduler';
import { Cart, CartSchema } from './schemas/cart.schema';
import { CartItem, CartItemSchema } from './schemas/cart-item.schema';
import { CartExtra, CartExtraSchema } from './schemas/cart-extra.schema';
import { AuthModule } from '../auth/auth.module';
import { FoodItemsModule } from '../food-items/food-items.module';
import { PromotionsModule } from '../promotions/promotions.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Cart.name, schema: CartSchema },
      { name: CartItem.name, schema: CartItemSchema },
      { name: CartExtra.name, schema: CartExtraSchema },
    ]),
    AuthModule,
    forwardRef(() => FoodItemsModule),
    PromotionsModule,
  ],
  controllers: [CartController],
  providers: [CartService, CartRepository, CartScheduler],
  exports: [CartService, CartRepository],
})
export class CartModule {}

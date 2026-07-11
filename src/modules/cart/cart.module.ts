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
import { MarketersModule } from '../marketers/marketers.module';
import { AdminMenuRepository } from '../admin/admin-menu.repository';
import {
  PickupLocationItemAvailability,
  PickupLocationItemAvailabilitySchema,
} from '../admin/schemas/pickup-location-item-availability.schema';
import {
  PickupLocationItemPrice,
  PickupLocationItemPriceSchema,
} from '../admin/schemas/pickup-location-item-price.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Cart.name, schema: CartSchema },
      { name: CartItem.name, schema: CartItemSchema },
      { name: CartExtra.name, schema: CartExtraSchema },
      { name: PickupLocationItemAvailability.name, schema: PickupLocationItemAvailabilitySchema },
      { name: PickupLocationItemPrice.name, schema: PickupLocationItemPriceSchema },
    ]),
    forwardRef(() => AuthModule),
    forwardRef(() => FoodItemsModule),
    PromotionsModule,
    MarketersModule,
  ],
  controllers: [CartController],
  providers: [CartService, CartRepository, CartScheduler, AdminMenuRepository],
  exports: [CartService, CartRepository],
})
export class CartModule {}

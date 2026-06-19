import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { CartService } from './cart.service';
import { AddItemToCartDto } from './dto/add-item-to-cart.dto';
import { UpdateCartItemQuantityDto } from './dto/update-cart-item-quantity.dto';
import { ApplyPromoCodeDto } from './dto/apply-promo-code.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('cart')
@Controller('cart')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Get current user's cart" })
  @ApiResponse({
    status: 200,
    description: 'Cart retrieved successfully',
    schema: {
      example: {
        success: true,
        message: 'Cart retrieved successfully',
        data: {
          id: '507f1f77bcf86cd799439011',
          userId: '507f1f77bcf86cd799439012',
          items: [
            {
              id: '507f1f77bcf86cd799439013',
              foodItemId: '507f1f77bcf86cd799439014',
              name: 'Jollof Rice',
              description: 'Smoky jollof with grilled chicken wing',
              slug: 'jollof-rice',
              price: 150000,
              formattedPrice: '₦1,500',
              currency: 'NGN',
              imageUrl: 'https://cdn.surespot.app/images/jollof-rice.jpg',
              quantity: 2,
              extras: [
                {
                  id: '507f1f77bcf86cd799439015',
                  foodExtraId: '507f1f77bcf86cd799439016',
                  name: 'Extra chicken',
                  price: 50000,
                  formattedPrice: '₦500',
                  currency: 'NGN',
                  quantity: 1,
                },
              ],
              subtotal: 300000,
              extrasTotal: 100000,
              lineTotal: 400000,
              estimatedTime: { min: 20, max: 25 },
            },
          ],
          subtotal: 300000,
          extrasTotal: 100000,
          discountAmount: 0,
          total: 400000,
          formattedTotal: '₦4,000',
          itemCount: 2,
          extrasCount: 2,
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async getCart(@CurrentUser() user: { id: string }) {
    return this.cartService.getCart(user.id);
  }

  @Post('items')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Add item to cart' })
  @ApiResponse({
    status: 200,
    description: 'Item added to cart',
  })
  @ApiResponse({
    status: 404,
    description: 'Food item not found',
  })
  @ApiResponse({
    status: 400,
    description: 'Item not available or extra not available',
  })
  async addItem(
    @CurrentUser() user: { id: string },
    @Body() dto: AddItemToCartDto,
  ) {
    return this.cartService.addItem(user.id, dto);
  }

  @Patch('items/:itemId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update cart item quantity' })
  @ApiResponse({
    status: 200,
    description: 'Cart item updated',
  })
  @ApiResponse({
    status: 404,
    description: 'Cart item not found',
  })
  async updateItemQuantity(
    @CurrentUser() user: { id: string },
    @Param('itemId') itemId: string,
    @Body() dto: UpdateCartItemQuantityDto,
  ) {
    return this.cartService.updateItemQuantity(user.id, itemId, dto.quantity);
  }

  @Delete('items/:itemId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove item from cart' })
  @ApiResponse({
    status: 200,
    description: 'Item removed from cart',
  })
  @ApiResponse({
    status: 404,
    description: 'Cart item not found',
  })
  async removeItem(
    @CurrentUser() user: { id: string },
    @Param('itemId') itemId: string,
  ) {
    return this.cartService.removeItem(user.id, itemId);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Clear all items from cart' })
  @ApiResponse({
    status: 200,
    description: 'Cart cleared',
  })
  async clearCart(@CurrentUser() user: { id: string }) {
    return this.cartService.clearCart(user.id);
  }

  @Post('promo-code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Apply promo code to cart' })
  @ApiResponse({
    status: 200,
    description: 'Promo code applied successfully',
    schema: {
      example: {
        success: true,
        message: 'Promo code applied successfully',
        data: {
          cart: {
            id: '507f1f77bcf86cd799439011',
            subtotal: 300000,
            extrasTotal: 50000,
            discountAmount: 35000,
            discountPercent: 10,
            promoCode: 'TGIF224',
            total: 315000,
            formattedTotal: '₦3,150',
          },
          promoCode: {
            code: 'TGIF224',
            discountPercent: 10,
            discountAmount: 35000,
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid promo code or cart empty',
  })
  async applyPromoCode(
    @CurrentUser() user: { id: string },
    @Body() dto: ApplyPromoCodeDto,
  ) {
    return this.cartService.applyPromoCode(user.id, dto.code);
  }

  @Delete('promo-code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove promo code from cart' })
  @ApiResponse({
    status: 200,
    description: 'Promo code removed',
  })
  async removePromoCode(@CurrentUser() user: { id: string }) {
    return this.cartService.removePromoCode(user.id);
  }
}

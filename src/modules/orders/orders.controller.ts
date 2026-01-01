import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
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
import { OrdersService } from './orders.service';
import { ValidateCheckoutDto } from './dto/validate-checkout.dto';
import { PlaceOrderDto } from './dto/place-order.dto';
import { GetOrdersFilterDto } from './dto/get-orders-filter.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../auth/schemas/user.schema';

@ApiTags('checkout')
@Controller('checkout')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class CheckoutController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate checkout data before placing order' })
  @ApiResponse({
    status: 200,
    description: 'Checkout validation result',
    schema: {
      example: {
        success: true,
        data: {
          isValid: true,
          cart: {
            subtotal: 300000,
            extrasTotal: 50000,
            discountAmount: 35000,
            total: 315000,
          },
          deliveryFee: 80000,
          estimatedDeliveryTime: '2024-01-15T12:30:00.000Z',
          estimatedPreparationTime: 25,
        },
      },
    },
  })
  async validateCheckout(
    @CurrentUser() user: { id: string },
    @Body() dto: ValidateCheckoutDto,
  ) {
    return this.ordersService.validateCheckout(user.id, dto);
  }
}

@ApiTags('orders')
@Controller('orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Place an order' })
  @ApiResponse({
    status: 201,
    description: 'Order placed successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error or cart empty',
  })
  async placeOrder(
    @CurrentUser() user: { id: string },
    @Body() dto: PlaceOrderDto,
  ) {
    return this.ordersService.placeOrder(user.id, dto);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get order history' })
  @ApiResponse({
    status: 200,
    description: 'Orders retrieved successfully',
  })
  async getOrders(
    @CurrentUser() user: { id: string },
    @Query() filter: GetOrdersFilterDto,
  ) {
    return this.ordersService.getOrders(user.id, filter);
  }

  @Get(':orderId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get order details' })
  @ApiResponse({
    status: 200,
    description: 'Order retrieved successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Order not found',
  })
  async getOrderById(
    @CurrentUser() user: { id: string },
    @Param('orderId') orderId: string,
  ) {
    return this.ordersService.getOrderById(user.id, orderId);
  }

  @Post(':orderId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel an order (only before payment)' })
  @ApiResponse({
    status: 200,
    description: 'Order cancelled successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Order cannot be cancelled',
  })
  @ApiResponse({
    status: 404,
    description: 'Order not found',
  })
  async cancelOrder(
    @CurrentUser() user: { id: string },
    @Param('orderId') orderId: string,
    @Body() dto: CancelOrderDto,
  ) {
    return this.ordersService.cancelOrder(user.id, orderId, dto.reason);
  }

  @Post(':orderId/reorder')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reorder - add items from previous order to cart' })
  @ApiResponse({
    status: 200,
    description: 'Items added to cart',
  })
  @ApiResponse({
    status: 404,
    description: 'Order not found',
  })
  async reorder(
    @CurrentUser() user: { id: string },
    @Param('orderId') orderId: string,
  ) {
    return this.ordersService.reorder(user.id, orderId);
  }

  @Get(':orderId/tracking')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get order tracking information' })
  @ApiResponse({
    status: 200,
    description: 'Tracking information retrieved successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Order not found',
  })
  async getOrderTracking(
    @CurrentUser() user: { id: string },
    @Param('orderId') orderId: string,
  ) {
    return this.ordersService.getOrderTracking(user.id, orderId);
  }

  @Patch(':orderId/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.RESTAURANT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update order status (Admin/Rider only)' })
  @ApiResponse({
    status: 200,
    description: 'Order status updated successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Order not found',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin/Rider access required',
  })
  async updateOrderStatus(
    @CurrentUser() user: { id: string },
    @Param('orderId') orderId: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateOrderStatus(orderId, dto, user.id);
  }
}

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
import { GetRiderOrdersDto } from './dto/get-rider-orders.dto';
import { AcceptOrderDto } from './dto/accept-order.dto';
import { MarkOrderDeliveredDto } from './dto/mark-delivered.dto';
import { MarkOrderPickedUpDto } from './dto/mark-picked-up.dto';
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
  @ApiOperation({ summary: 'Update order status (Admin/Restaurant only)' })
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
    description: 'Forbidden - Admin/Restaurant access required',
  })
  async updateOrderStatus(
    @CurrentUser() user: { id: string },
    @Param('orderId') orderId: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateOrderStatus(orderId, dto, user.id);
  }

  @Get('rider/eligible')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.RIDER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get orders eligible for rider (Rider only)' })
  @ApiResponse({
    status: 200,
    description: 'Eligible orders retrieved successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Rider access required',
  })
  async getRiderEligibleOrders(
    @CurrentUser() user: { id: string },
    @Query() filter: GetRiderOrdersDto,
  ) {
    return this.ordersService.getRiderEligibleOrders(user.id, filter);
  }

  @Post('rider/accept')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.RIDER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept an order (Rider only)' })
  @ApiResponse({
    status: 200,
    description: 'Order accepted successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Order not found or rider profile not found',
  })
  @ApiResponse({
    status: 409,
    description: 'Order already assigned to another rider',
  })
  @ApiResponse({
    status: 400,
    description: 'Order not ready or invalid order type',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Rider access required',
  })
  async acceptOrder(
    @CurrentUser() user: { id: string },
    @Body() dto: AcceptOrderDto,
  ) {
    return this.ordersService.acceptOrder(user.id, dto.orderId);
  }

  @Get('rider/assigned')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.RIDER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get orders assigned to rider (Rider only)' })
  @ApiResponse({
    status: 200,
    description: 'Assigned orders retrieved successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Rider access required',
  })
  async getRiderAssignedOrders(
    @CurrentUser() user: { id: string },
    @Query() filter: GetRiderOrdersDto,
  ) {
    return this.ordersService.getRiderAssignedOrders(user.id, filter);
  }

  @Post('rider/:orderId/picked-up')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.RIDER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark order as picked up (Rider only)' })
  @ApiResponse({
    status: 200,
    description: 'Order marked as picked up successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Order or rider profile not found',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Order not assigned to this rider',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid order status or order not assigned',
  })
  async markOrderAsPickedUp(
    @CurrentUser() user: { id: string },
    @Param('orderId') orderId: string,
    @Body() dto: MarkOrderPickedUpDto,
  ) {
    return this.ordersService.markOrderAsPickedUp(
      orderId,
      user.id,
      dto.message,
      dto.latitude,
      dto.longitude,
    );
  }

  @Post('rider/:orderId/delivered')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.RIDER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark order as delivered (Rider only)' })
  @ApiResponse({
    status: 200,
    description: 'Order marked as delivered successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Order or rider profile not found',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Order not assigned to this rider',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid order status or order not assigned',
  })
  async markOrderAsDelivered(
    @CurrentUser() user: { id: string },
    @Param('orderId') orderId: string,
    @Body() dto: MarkOrderDeliveredDto,
  ) {
    return this.ordersService.markOrderAsDelivered(
      orderId,
      user.id,
      dto.confirmationCode,
      dto.message,
      dto.latitude,
      dto.longitude,
    );
  }
}

import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../auth/schemas/user.schema';
import { AdminOrdersService } from './admin-orders.service';
import { AdminGetOrdersDto } from './dto/admin-get-orders.dto';
import { AdminUpdateOrderStatusDto } from './dto/admin-update-order-status.dto';

type CurrentUserType = {
  id: string;
  role: string;
  email?: string;
  phone?: string;
  pickupLocationId?: string;
};

@ApiTags('Admin Orders')
@Controller('admin/orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.PICKUP_ADMIN)
export class AdminOrdersController {
  constructor(private readonly adminOrdersService: AdminOrdersService) {}

  @Get()
  @ApiOperation({
    summary: 'Get orders list for admin',
    description:
      'Returns paginated list of orders for the admin\'s assigned pickup location with optional filters',
  })
  @ApiResponse({
    status: 200,
    description: 'Orders list retrieved successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - no pickup location assigned',
  })
  async getOrders(
    @Query() query: AdminGetOrdersDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    // Ensure user has a pickup location
    if (!user.pickupLocationId) {
      throw new ForbiddenException({
        success: false,
        error: {
          code: 'NO_PICKUP_LOCATION',
          message:
            'Your account is not linked to a pickup location. Please contact support.',
        },
      });
    }

    return this.adminOrdersService.getOrders(user.pickupLocationId, query);
  }

  @Get(':orderId')
  @ApiOperation({
    summary: 'Get order details for admin',
    description:
      'Returns detailed order information if the order belongs to the admin\'s pickup location',
  })
  @ApiResponse({
    status: 200,
    description: 'Order details retrieved successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - no pickup location assigned',
  })
  @ApiResponse({
    status: 404,
    description: 'Order not found or does not belong to this pickup location',
  })
  async getOrderById(
    @Param('orderId') orderId: string,
    @CurrentUser() user: CurrentUserType,
  ) {
    // Ensure user has a pickup location
    if (!user.pickupLocationId) {
      throw new ForbiddenException({
        success: false,
        error: {
          code: 'NO_PICKUP_LOCATION',
          message:
            'Your account is not linked to a pickup location. Please contact support.',
        },
      });
    }

    const result = await this.adminOrdersService.getOrderById(
      user.pickupLocationId,
      orderId,
    );

    if (!result) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'ORDER_NOT_FOUND',
          message:
            'Order not found or does not belong to your pickup location',
        },
      });
    }

    return result;
  }

  @Patch(':orderId/status')
  @ApiOperation({
    summary: 'Update order status',
    description:
      'Updates the order status for orders belonging to the admin\'s pickup location',
  })
  @ApiResponse({
    status: 200,
    description: 'Order status updated successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - invalid status transition or missing reason',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - no pickup location assigned',
  })
  @ApiResponse({
    status: 404,
    description: 'Order not found or does not belong to this pickup location',
  })
  async updateOrderStatus(
    @Param('orderId') orderId: string,
    @Body() dto: AdminUpdateOrderStatusDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    // Ensure user has a pickup location
    if (!user.pickupLocationId) {
      throw new ForbiddenException({
        success: false,
        error: {
          code: 'NO_PICKUP_LOCATION',
          message:
            'Your account is not linked to a pickup location. Please contact support.',
        },
      });
    }

    return this.adminOrdersService.updateOrderStatus(
      user.pickupLocationId,
      orderId,
      dto,
      user.id,
    );
  }

  @Get('stats/overview')
  @ApiOperation({
    summary: 'Get order statistics',
    description:
      'Returns real-time order statistics for the admin\'s pickup location',
  })
  @ApiResponse({
    status: 200,
    description: 'Order statistics retrieved successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - no pickup location assigned',
  })
  async getOrderStats(@CurrentUser() user: CurrentUserType) {
    // Ensure user has a pickup location
    if (!user.pickupLocationId) {
      throw new ForbiddenException({
        success: false,
        error: {
          code: 'NO_PICKUP_LOCATION',
          message:
            'Your account is not linked to a pickup location. Please contact support.',
        },
      });
    }

    const stats = await this.adminOrdersService.getOrderStats(
      user.pickupLocationId,
    );

    return {
      success: true,
      data: stats,
    };
  }
}

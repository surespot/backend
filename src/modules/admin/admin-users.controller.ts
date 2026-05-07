import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Patch,
  Body,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { User, UserRole } from '../auth/schemas/user.schema';
import { AuthRepository } from '../auth/auth.repository';
import { OrdersRepository } from '../orders/orders.repository';
import { TransactionsService } from '../transactions/transactions.service';

class UpdateUserDto {
  @IsBoolean()
  @IsOptional()
  isDemo?: boolean;
}

@ApiTags('admin-users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/users')
export class AdminUsersController {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly ordersRepository: OrdersRepository,
    private readonly transactionsService: TransactionsService,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'List customers and riders (excludes admins, pickup admins, restaurant)',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    example: 20,
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['active', 'inactive'],
    description: 'Filter by user status',
  })
  @ApiResponse({ status: 200, description: 'Users retrieved successfully' })
  async listUsers(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
    @Query('status') status?: 'active' | 'inactive',
  ) {
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
    // role: { $in: [UserRole.USER, UserRole.RIDER] },

    const query: Record<string, unknown> = {
      deletedAt: { $exists: false },
      role: { $in: [UserRole.USER] },
    };

    if (status === 'active') {
      query.isActive = true;
    } else if (status === 'inactive') {
      query.isActive = false;
    }

    const [users, total] = await Promise.all([
      this.authRepository.findUsersWithPagination(query, pageNum, limitNum),
      this.authRepository.countUsers(query),
    ]);

    const totalPages = Math.ceil(total / limitNum);

    return {
      success: true,
      data: {
        users: users.map((u) => ({
          id: u._id.toString(),
          firstName: u.firstName,
          lastName: u.lastName,
          email: u.email,
          phone: u.phone,
          avatar: u.avatar ?? null,
          role: u.role,
          isActive: u.isActive,
          isDemo: u.isDemo ?? false,
          createdAt: u.createdAt,
        })),
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages,
          hasNext: pageNum < totalPages,
          hasPrev: pageNum > 1,
        },
      },
    };
  }

  @Get(':id/analytics')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get detailed user analytics' })
  @ApiResponse({
    status: 200,
    description: 'User analytics retrieved successfully',
  })
  async getUserAnalytics(@Param('id') userId: string) {
    const user = await this.authRepository.findUserById(userId);

    if (
      !user ||
      (user.role !== UserRole.USER && user.role !== UserRole.RIDER)
    ) {
      throw new NotFoundException('User not found');
    }

    // Get all orders for the user (without pagination)
    const ordersResult = await this.ordersRepository.findByUserId(userId, {
      page: 1,
      limit: 10000, // Get all orders for analytics
    });
    const orders = ordersResult.items;

    // Calculate total spent
    const totalSpent = orders
      .filter((o) => o.paymentStatus === 'paid')
      .reduce((sum, o) => sum + (o.total || 0), 0);

    // Get unique pickup locations
    const pickupLocationIds = [
      ...new Set(
        orders
          .map((o) => o.pickupLocationId?.toString())
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    // Get last 5 orders with full details
    const last5Orders = await this.ordersRepository.findRecentUserOrders(
      userId,
      5,
    );

    return {
      success: true,
      data: {
        user: {
          id: user._id.toString(),
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
          isActive: user.isActive,
          isDemo: user.isDemo ?? false,
          createdAt: user.createdAt,
        },
        analytics: {
          totalOrders: orders.length,
          totalSpent, // in kobo
          totalSpentFormatted: `₦${(totalSpent / 100).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          pickupLocationsCount: pickupLocationIds.length,
          pickupLocationIds,
        },
        recentOrders: last5Orders.map((order) => ({
          id: order._id.toString(),
          orderNumber: order.orderNumber,
          status: order.status,
          paymentStatus: order.paymentStatus,
          totalAmount: order.total || 0,
          totalAmountFormatted: `₦${((order.total || 0) / 100).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          pickupLocationId: order.pickupLocationId?.toString(),
          createdAt: order.createdAt,
          deliveredAt: order.deliveredAt,
        })),
      },
    };
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update user fields (isDemo, etc.)' })
  @ApiBody({ schema: { example: { isDemo: true } } })
  @ApiResponse({ status: 200, description: 'User updated successfully' })
  async updateUser(
    @Param('id') userId: string,
    @Body() dto: UpdateUserDto,
  ) {
    const user = await this.authRepository.findUserById(userId);

    if (
      !user ||
      (user.role !== UserRole.USER && user.role !== UserRole.RIDER)
    ) {
      throw new NotFoundException('User not found');
    }

    const updates: Partial<User> = {};
    if (typeof dto.isDemo === 'boolean') {
      updates.isDemo = dto.isDemo;
      if (dto.isDemo) {
        await this.authRepository.clearDemoFlagFromAllUsers();
      }
    }

    const updated = await this.authRepository.updateUser(userId, updates);

    return {
      success: true,
      data: {
        id: updated!._id.toString(),
        isDemo: updated!.isDemo ?? false,
      },
    };
  }
}

import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  NotFoundException,
  ConflictException,
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
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
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

class UpdateAdminProfileDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  @IsOptional()
  firstName?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  @IsOptional()
  lastName?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;
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
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search by first/last name, phone, or email',
  })
  @ApiQuery({
    name: 'role',
    required: false,
    enum: ['user', 'rider'],
    description: 'Filter by role (defaults to customers only)',
  })
  @ApiResponse({ status: 200, description: 'Users retrieved successfully' })
  async listUsers(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
    @Query('status') status?: 'active' | 'inactive',
    @Query('search') search?: string,
    @Query('role') role?: 'user' | 'rider',
  ) {
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));

    const query: Record<string, unknown> = {
      deletedAt: { $exists: false },
      role: role === 'rider' ? UserRole.RIDER : UserRole.USER,
    };

    if (status === 'active') {
      query.isActive = true;
    } else if (status === 'inactive') {
      query.isActive = false;
    }

    const trimmedSearch = search?.trim();
    if (trimmedSearch) {
      const escaped = trimmedSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      query.$or = [
        { firstName: regex },
        { lastName: regex },
        { phone: regex },
        { email: regex },
      ];
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

  @Get('admins')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List all admins and pickup admins' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiResponse({ status: 200, description: 'Admins retrieved successfully' })
  async listAdmins(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));

    const { users, total } = await this.authRepository.findAdminUsers(
      pageNum,
      limitNum,
    );

    const totalPages = Math.ceil(total / limitNum);

    return {
      success: true,
      data: {
        admins: users.map((u) => ({
          id: u._id.toString(),
          firstName: u.firstName,
          lastName: u.lastName,
          email: u.email,
          phone: u.phone,
          role: u.role,
          isActive: u.isActive,
          pickupLocationId: u.pickupLocationId?.toString() ?? null,
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

  @Get('admins/unassigned')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List admins and pickup admins without an assigned pickup location',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiResponse({ status: 200, description: 'Unassigned admins retrieved successfully' })
  async listUnassignedAdmins(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));

    const { users, total } =
      await this.authRepository.findAdminsWithoutPickupLocation(
        pageNum,
        limitNum,
      );

    const totalPages = Math.ceil(total / limitNum);

    return {
      success: true,
      data: {
        admins: users.map((u) => ({
          id: u._id.toString(),
          firstName: u.firstName,
          lastName: u.lastName,
          email: u.email,
          phone: u.phone,
          role: u.role,
          isActive: u.isActive,
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

  @Patch(':id/profile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update an admin or pickup admin profile (super admin only)' })
  @ApiBody({ type: UpdateAdminProfileDto })
  @ApiResponse({ status: 200, description: 'Admin profile updated successfully' })
  async updateAdminProfile(
    @Param('id') targetId: string,
    @Body() dto: UpdateAdminProfileDto,
  ) {
    const target = await this.authRepository.findUserById(targetId);

    if (
      !target ||
      (target.role !== UserRole.ADMIN && target.role !== UserRole.PICKUP_ADMIN)
    ) {
      throw new NotFoundException('Admin user not found');
    }

    if (dto.email && dto.email !== target.email) {
      const existing = await this.authRepository.findUserByEmail(dto.email);
      if (existing) {
        throw new ConflictException('Email is already in use');
      }
    }

    const updates: Partial<User> = {};
    if (dto.firstName !== undefined) updates.firstName = dto.firstName.trim();
    if (dto.lastName !== undefined) updates.lastName = dto.lastName.trim();
    if (dto.email !== undefined) updates.email = dto.email.trim().toLowerCase();
    if (dto.phone !== undefined) updates.phone = dto.phone.trim();

    const updated = await this.authRepository.updateUser(targetId, updates);

    return {
      success: true,
      message: 'Admin profile updated successfully',
      data: {
        id: updated!._id.toString(),
        firstName: updated!.firstName,
        lastName: updated!.lastName,
        email: updated!.email,
        phone: updated!.phone,
        role: updated!.role,
      },
    };
  }
}

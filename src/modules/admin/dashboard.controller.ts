import {
  Controller,
  Get,
  Query,
  UseGuards,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser as CurrentUserType } from '../auth/decorators/current-user.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../auth/schemas/user.schema';
import { DashboardService, DateRange } from './dashboard.service';
import { DashboardQueryDto, DashboardPeriod } from './dto/dashboard-query.dto';
import { DashboardOverviewResponseDto } from './dto/dashboard-response.dto';

@ApiTags('Admin Dashboard')
@Controller('admin/dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('overview')
  @Roles(UserRole.ADMIN, UserRole.PICKUP_ADMIN)
  @ApiOperation({
    summary: 'Get dashboard overview data',
    description:
      'Returns aggregated dashboard data for the admin\'s assigned pickup location including stats, profit, traffic, order breakdown, menu performance, and customer ratings.',
  })
  @ApiResponse({
    status: 200,
    description: 'Dashboard data retrieved successfully',
    type: DashboardOverviewResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - insufficient permissions or no pickup location assigned',
  })
  async getDashboardOverview(
    @Query() query: DashboardQueryDto,
    @CurrentUser() user: CurrentUserType,
  ): Promise<{
    success: boolean;
    data: DashboardOverviewResponseDto;
  }> {
    // All admins must have a pickup location assigned
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

    // Use the user's assigned pickup location ID
    const pickupLocationId = user.pickupLocationId;

    // Resolve date range
    const { dateRange, previousDateRange } = this.resolveDateRanges(query);

    // Fetch dashboard data
    const data = await this.dashboardService.getDashboardOverview(
      pickupLocationId,
      dateRange,
      previousDateRange,
    );

    return {
      success: true,
      data,
    };
  }

  /**
   * Resolve current and previous date ranges based on query params
   */
  private resolveDateRanges(query: DashboardQueryDto): {
    dateRange: DateRange;
    previousDateRange: DateRange;
  } {
    // Custom date range takes precedence
    if (query.from && query.to) {
      const start = new Date(query.from);
      const end = new Date(query.to);

      if (start > end) {
        throw new BadRequestException({
          success: false,
          error: {
            code: 'INVALID_DATE_RANGE',
            message: '"from" date must be before or equal to "to" date',
          },
        });
      }

      const durationMs = end.getTime() - start.getTime();
      const previousStart = new Date(start.getTime() - durationMs);
      const previousEnd = new Date(start.getTime() - 1);

      return {
        dateRange: { start, end },
        previousDateRange: { start: previousStart, end: previousEnd },
      };
    }

    // Use period-based date ranges
    const period = query.period || DashboardPeriod.TODAY;
    return this.getPeriodDateRanges(period);
  }

  /**
   * Get date ranges for predefined periods
   */
  private getPeriodDateRanges(period: DashboardPeriod): {
    dateRange: DateRange;
    previousDateRange: DateRange;
  } {
    const now = new Date();
    let start: Date;
    let end: Date;
    let previousStart: Date;
    let previousEnd: Date;

    switch (period) {
      case DashboardPeriod.TODAY:
        start = new Date(now);
        start.setHours(0, 0, 0, 0);
        end = new Date(now);
        end.setHours(23, 59, 59, 999);

        previousStart = new Date(start);
        previousStart.setDate(previousStart.getDate() - 1);
        previousEnd = new Date(end);
        previousEnd.setDate(previousEnd.getDate() - 1);
        break;

      case DashboardPeriod.SEVEN_DAYS:
        end = new Date(now);
        end.setHours(23, 59, 59, 999);
        start = new Date(end);
        start.setDate(start.getDate() - 6);
        start.setHours(0, 0, 0, 0);

        previousEnd = new Date(start);
        previousEnd.setDate(previousEnd.getDate() - 1);
        previousEnd.setHours(23, 59, 59, 999);
        previousStart = new Date(previousEnd);
        previousStart.setDate(previousStart.getDate() - 6);
        previousStart.setHours(0, 0, 0, 0);
        break;

      case DashboardPeriod.THIRTY_DAYS:
        end = new Date(now);
        end.setHours(23, 59, 59, 999);
        start = new Date(end);
        start.setDate(start.getDate() - 29);
        start.setHours(0, 0, 0, 0);

        previousEnd = new Date(start);
        previousEnd.setDate(previousEnd.getDate() - 1);
        previousEnd.setHours(23, 59, 59, 999);
        previousStart = new Date(previousEnd);
        previousStart.setDate(previousStart.getDate() - 29);
        previousStart.setHours(0, 0, 0, 0);
        break;

      default:
        // Default to today
        start = new Date(now);
        start.setHours(0, 0, 0, 0);
        end = new Date(now);
        end.setHours(23, 59, 59, 999);

        previousStart = new Date(start);
        previousStart.setDate(previousStart.getDate() - 1);
        previousEnd = new Date(end);
        previousEnd.setDate(previousEnd.getDate() - 1);
    }

    return {
      dateRange: { start, end },
      previousDateRange: { start: previousStart, end: previousEnd },
    };
  }
}

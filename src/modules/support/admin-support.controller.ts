import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/schemas/user.schema';
import { AdminSupportService } from './admin-support.service';
import { AdminGetSupportDto } from './dto/admin-get-support.dto';
import { UpdateSupportStatusDto } from './dto/update-support-status.dto';

@ApiTags('Admin Support')
@Controller('admin/support')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.PICKUP_ADMIN)
@ApiBearerAuth()
export class AdminSupportController {
  constructor(private readonly adminSupportService: AdminSupportService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List all support requests',
    description:
      'Returns paginated list of support requests with optional filters (submitterRole, status)',
  })
  @ApiResponse({
    status: 200,
    description: 'Support requests retrieved successfully',
  })
  async getAll(@Query() filter: AdminGetSupportDto) {
    const result = await this.adminSupportService.getAll(filter);
    return {
      success: true,
      data: {
        items: result.items.map((r) => {
          const user = r.userId as unknown as {
            firstName?: string;
            lastName?: string;
          };
          const userName =
            user?.firstName && user?.lastName
              ? `${user.firstName} ${user.lastName}`
              : 'Unknown';
          return {
            id: r._id.toString(),
            submitterRole: r.submitterRole,
            status: r.status,
            category: r.category,
            type: r.type,
            user: userName,
            orderId: r.orderId?.toString(),
            createdAt: r.createdAt?.toISOString(),
          };
        }),
        pagination: result.pagination,
      },
    };
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get support request details',
    description:
      'Returns full details including user info and order details (if linked)',
  })
  @ApiResponse({
    status: 200,
    description: 'Support request details retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Support request not found' })
  async getById(@Param('id') id: string) {
    const data = await this.adminSupportService.getById(id);
    return { success: true, data };
  }

  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update support request status' })
  @ApiResponse({ status: 200, description: 'Status updated successfully' })
  @ApiResponse({ status: 404, description: 'Support request not found' })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateSupportStatusDto,
  ) {
    const request = await this.adminSupportService.updateStatus(id, dto);
    return {
      success: true,
      message: 'Status updated successfully',
      data: {
        id: request._id.toString(),
        status: request.status,
      },
    };
  }

  @Post(':id/forward-to-developers')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Forward bug report to developers',
    description:
      'Sends an email to developers (BUG_REPORT_DEVELOPER_EMAILS) with the full bug report details including attachments. Only works for support requests with source bug_report.',
  })
  @ApiResponse({
    status: 200,
    description: 'Bug report forwarded successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Not a bug report or no developer emails configured',
  })
  @ApiResponse({ status: 404, description: 'Support request not found' })
  async forwardToDevelopers(@Param('id') id: string) {
    await this.adminSupportService.forwardBugReportToDevelopers(id);
    return {
      success: true,
      message: 'Bug report forwarded to developers successfully',
    };
  }
}

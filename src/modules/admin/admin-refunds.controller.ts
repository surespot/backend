import {
  Controller,
  Post,
  Param,
  Body,
  UseGuards,
  ParseIntPipe,
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
import { TransactionsService } from '../transactions/transactions.service';
import { RetryRefundDto } from './dto/retry-refund.dto';

@ApiTags('Admin Refunds')
@Controller('admin/refunds')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class AdminRefundsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post(':id/retry')
  @ApiOperation({
    summary: 'Retry refund with bank details',
    description:
      "Retry a refund with needs-attention status by providing the customer's bank account details. Use the refund ID from the refund.needs-attention webhook notification.",
  })
  @ApiResponse({
    status: 200,
    description: 'Refund retried successfully',
    schema: {
      example: {
        success: true,
        message: 'Refund retried and has been queued for processing',
        data: {
          id: 1234567,
          status: 'processing',
          amount: 20000,
          expected_at: '2025-10-13T16:02:18.000Z',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request or refund retry failed',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  async retryRefund(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RetryRefundDto,
  ) {
    const result = await this.transactionsService.retryRefundWithBankDetails(
      id,
      dto.refund_account_details,
    );

    return {
      success: result.success,
      message: 'Refund retried and has been queued for processing',
      data: result.data,
    };
  }
}

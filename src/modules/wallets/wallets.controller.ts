import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { WalletsService } from './wallets.service';
import { AddPaymentDetailsDto } from './dto/add-payment-details.dto';
import { InitiateWithdrawalDto } from './dto/initiate-withdrawal.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/schemas/user.schema';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RidersService } from '../riders/riders.service';
import { NotFoundException } from '@nestjs/common';

@ApiTags('wallets')
@Controller('wallets')
export class WalletsController {
  constructor(
    private readonly walletsService: WalletsService,
    private readonly ridersService: RidersService,
  ) {}

  // ============ RIDER ENDPOINTS ============

  @Get('me/balance')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.RIDER)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get wallet balance (Rider only)',
    description: 'Get the current wallet balance for the authenticated rider',
  })
  @ApiResponse({
    status: 200,
    description: 'Wallet balance retrieved successfully',
    schema: {
      example: {
        success: true,
        message: 'Wallet balance retrieved successfully',
        data: {
          walletBalance: 500000,
          formattedBalance: '₦5,000.00',
          currency: 'NGN',
          isVerified: true,
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Rider access required' })
  async getMyBalance(@CurrentUser() user: { id: string }) {
    const riderProfile = await this.ridersService.findProfileByUserId(user.id);
    if (!riderProfile) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'RIDER_PROFILE_NOT_FOUND',
          message: 'Rider profile not found',
        },
      });
    }

    const balance = await this.walletsService.getWalletBalance(
      riderProfile._id.toString(),
    );

    return {
      success: true,
      message: 'Wallet balance retrieved successfully',
      data: balance,
    };
  }

  @Get('me/transactions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.RIDER)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get wallet transaction history (Rider only)',
    description: 'Get transaction history for the authenticated rider with filtering and pagination',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (1-indexed)',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of transactions per page',
    example: 20,
  })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ['earned', 'withdrew', 'all'],
    description: 'Filter by transaction type',
    example: 'earned',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['completed', 'pending', 'failed', 'all'],
    description: 'Filter by transaction status',
    example: 'completed',
  })
  @ApiQuery({
    name: 'period',
    required: false,
    enum: ['this-month', 'last-month', 'this-year', 'all-time'],
    description: 'Filter by time period',
    example: 'this-month',
  })
  @ApiResponse({
    status: 200,
    description: 'Transaction history retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Rider access required' })
  async getMyTransactions(
    @CurrentUser() user: { id: string },
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('type') type?: 'earned' | 'withdrew' | 'all',
    @Query('status') status?: 'completed' | 'pending' | 'failed' | 'all',
    @Query('period') period?: 'this-month' | 'last-month' | 'this-year' | 'all-time',
  ) {
    const riderProfile = await this.ridersService.findProfileByUserId(user.id);
    if (!riderProfile) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'RIDER_PROFILE_NOT_FOUND',
          message: 'Rider profile not found',
        },
      });
    }

    const result = await this.walletsService.getWalletTransactionsWithFilters(
      riderProfile._id.toString(),
      {
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        type: type || 'all',
        status: status || 'all',
        period: period || 'all-time',
      },
    );

    return {
      success: true,
      message: 'Transaction history retrieved successfully',
      data: result,
    };
  }

  @Get('me/summary')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.RIDER)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get wallet summary/statistics (Rider only)',
    description: 'Get wallet summary with total earnings, withdrawals, and available balance for a period',
  })
  @ApiQuery({
    name: 'period',
    required: false,
    enum: ['this-month', 'last-month', 'this-year', 'all-time'],
    description: 'Time period for statistics',
    example: 'this-month',
  })
  @ApiResponse({
    status: 200,
    description: 'Wallet summary retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Rider access required' })
  async getMySummary(
    @CurrentUser() user: { id: string },
    @Query('period') period?: 'this-month' | 'last-month' | 'this-year' | 'all-time',
  ) {
    const riderProfile = await this.ridersService.findProfileByUserId(user.id);
    if (!riderProfile) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'RIDER_PROFILE_NOT_FOUND',
          message: 'Rider profile not found',
        },
      });
    }

    const summary = await this.walletsService.getWalletSummary(
      riderProfile._id.toString(),
      period || 'all-time',
    );

    return {
      success: true,
      message: 'Wallet summary retrieved successfully',
      data: summary,
    };
  }

  @Get('me/payment-details')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.RIDER)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get payment details (Rider only)',
    description: 'Get saved bank account details for withdrawals',
  })
  @ApiResponse({
    status: 200,
    description: 'Payment details retrieved successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Payment details not found',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Rider access required' })
  async getMyPaymentDetails(@CurrentUser() user: { id: string }) {
    const riderProfile = await this.ridersService.findProfileByUserId(user.id);
    if (!riderProfile) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'RIDER_PROFILE_NOT_FOUND',
          message: 'Rider profile not found',
        },
      });
    }

    const paymentDetails = await this.walletsService.getPaymentDetails(
      riderProfile._id.toString(),
    );

    if (!paymentDetails) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'PAYMENT_DETAILS_NOT_FOUND',
          message: 'Payment details not found. Please add bank account details first.',
        },
      });
    }

    return {
      success: true,
      message: 'Payment details retrieved successfully',
      data: paymentDetails,
    };
  }

  @Post('me/payment-details')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.RIDER)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Add payment details (Rider only)',
    description: 'Add bank account details for withdrawals',
  })
  @ApiResponse({
    status: 200,
    description: 'Payment details added successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Rider access required' })
  async addPaymentDetails(
    @CurrentUser() user: { id: string },
    @Body() dto: AddPaymentDetailsDto,
  ) {
    const riderProfile = await this.ridersService.findProfileByUserId(user.id);
    if (!riderProfile) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'RIDER_PROFILE_NOT_FOUND',
          message: 'Rider profile not found',
        },
      });
    }

    const result = await this.walletsService.createTransferRecipient(
      riderProfile._id.toString(),
      dto.accountNumber,
      dto.bankCode,
      dto.accountName,
    );

    return {
      success: true,
      message: 'Payment details added successfully',
      data: result,
    };
  }

  @Post('me/withdraw')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.RIDER)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Initiate withdrawal (Rider only)',
    description: 'Withdraw funds from wallet to bank account',
  })
  @ApiResponse({
    status: 200,
    description: 'Withdrawal initiated successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Rider access required' })
  async initiateWithdrawal(
    @CurrentUser() user: { id: string },
    @Body() dto: InitiateWithdrawalDto,
  ) {
    const riderProfile = await this.ridersService.findProfileByUserId(user.id);
    if (!riderProfile) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'RIDER_PROFILE_NOT_FOUND',
          message: 'Rider profile not found',
        },
      });
    }

    const result = await this.walletsService.initiateWithdrawal(
      riderProfile._id.toString(),
      dto.amount,
    );

    return {
      success: true,
      message: 'Withdrawal initiated successfully',
      data: result,
    };
  }

  // ============ ADMIN ENDPOINTS ============

  @Get('admin/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List all wallets (Admin only)',
    description: 'Get all rider wallets',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of wallets to return',
    example: 100,
  })
  @ApiResponse({
    status: 200,
    description: 'Wallets retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin access required' })
  async listAllWallets(@Query('limit') limit?: number) {
    const wallets = await this.walletsService.listAllWallets(
      limit ? Number(limit) : 100,
    );

    return {
      success: true,
      message: 'Wallets retrieved successfully',
      data: wallets,
    };
  }

  @Get('admin/rider/:riderProfileId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get wallet details for a rider (Admin only)',
    description: 'Get detailed wallet information for a specific rider',
  })
  @ApiResponse({
    status: 200,
    description: 'Wallet details retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin access required' })
  @ApiResponse({ status: 404, description: 'Wallet not found' })
  async getWalletDetails(@Param('riderProfileId') riderProfileId: string) {
    const wallet = await this.walletsService.getWalletDetails(riderProfileId);

    return {
      success: true,
      message: 'Wallet details retrieved successfully',
      data: wallet,
    };
  }

  @Post('admin/rider/:riderProfileId/payment-details')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Add payment details for a rider (Admin only)',
    description: 'Admin can add bank account details for a rider',
  })
  @ApiResponse({
    status: 200,
    description: 'Payment details added successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin access required' })
  async addPaymentDetailsForRider(
    @Param('riderProfileId') riderProfileId: string,
    @Body() dto: AddPaymentDetailsDto,
  ) {
    const result = await this.walletsService.createTransferRecipient(
      riderProfileId,
      dto.accountNumber,
      dto.bankCode,
      dto.accountName,
    );

    return {
      success: true,
      message: 'Payment details added successfully',
      data: result,
    };
  }
}

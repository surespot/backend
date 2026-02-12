import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Headers,
  Req,
  Get,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { TransactionsService } from './transactions.service';
import { InitializePaymentDto } from './dto/initialize-payment.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { Request } from 'express';

@ApiTags('payments')
@Controller('payments')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post('initialize')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Initialize Paystack payment transaction' })
  @ApiResponse({
    status: 200,
    description: 'Payment initialized successfully',
    schema: {
      example: {
        success: true,
        data: {
          transactionId: '507f1f77bcf86cd799439017',
          reference: 'TXN-1234567890-abc123',
          authorizationUrl: 'https://checkout.paystack.com/xxxxx',
          accessCode: 'xxxxx',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Payment initialization failed',
  })
  async initializePayment(
    @CurrentUser() user: { id: string; email?: string },
    @Body() dto: InitializePaymentDto,
  ) {
    return this.transactionsService.initializePayment(
      undefined, // orderId - not created yet
      user.id,
      dto.email,
      dto.amount,
      dto.paymentMethod || 'card',
      dto.metadata,
    );
  }

  @Post('verify')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify Paystack payment transaction' })
  @ApiResponse({
    status: 200,
    description: 'Payment verification result',
    schema: {
      example: {
        success: true,
        data: {
          success: true,
          transaction: {
            id: '507f1f77bcf86cd799439017',
            reference: 'TXN-1234567890-abc123',
            status: 'success',
            amount: 315000,
            formattedAmount: '₦3,150',
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Payment verification failed',
  })
  @ApiResponse({
    status: 404,
    description: 'Transaction not found',
  })
  async verifyPayment(@Body() dto: VerifyPaymentDto) {
    const result = await this.transactionsService.verifyPayment(dto.reference);
    return {
      success: true,
      data: result,
    };
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Paystack webhook endpoint (no auth required)' })
  @ApiResponse({
    status: 200,
    description: 'Webhook processed successfully',
  })
  async handleWebhook(
    @Req() req: Request,
    @Headers('x-paystack-signature') signature: string,
    @Body() body: { event?: string; data?: Record<string, unknown> },
  ) {
    const event = body?.event as string;
    const data = body?.data as Record<string, unknown>;

    if (!event || !data) {
      return {
        success: false,
        error: {
          code: 'INVALID_WEBHOOK',
          message: 'Invalid webhook payload',
        },
      };
    }

    // Verify webhook signature if provided
    if (signature) {
      const isValid = this.transactionsService.verifyWebhookSignature(
        JSON.stringify(body),
        signature,
      );

      if (!isValid) {
        return {
          success: false,
          error: {
            code: 'INVALID_SIGNATURE',
            message: 'Invalid webhook signature',
          },
        };
      }
    }

    await this.transactionsService.handleWebhook(event, data);

    return {
      success: true,
      message: 'Webhook processed successfully',
    };
  }

  @Get('banks')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List supported banks from Paystack' })
  @ApiQuery({
    name: 'country',
    required: false,
    description: 'Country code (default: nigeria)',
    example: 'nigeria',
  })
  @ApiQuery({
    name: 'currency',
    required: false,
    description: 'Currency code (default: NGN)',
    example: 'NGN',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    description: 'Account type (default: nuban)',
    example: 'nuban',
  })
  @ApiResponse({
    status: 200,
    description: 'Bank list retrieved successfully',
  })
  async listBanks(
    @Query('country') country?: string,
    @Query('currency') currency?: string,
    @Query('type') type?: string,
  ) {
    const banks = await this.transactionsService.listBanks({
      country,
      currency,
      type,
    });
    return {
      success: true,
      data: banks,
    };
  }

  @Get('banks/resolve')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify bank account details via Paystack' })
  @ApiQuery({
    name: 'accountNumber',
    required: true,
    description: 'Bank account number (e.g. 0123456789)',
    example: '0123456789',
  })
  @ApiQuery({
    name: 'bankCode',
    required: true,
    description: 'Paystack bank code (e.g. 058 for GTBank)',
    example: '058',
  })
  @ApiResponse({
    status: 200,
    description: 'Bank account verification result',
  })
  async verifyBankAccount(
    @Query('accountNumber') accountNumber: string,
    @Query('bankCode') bankCode: string,
  ) {
    const result = await this.transactionsService.verifyBankAccount({
      accountNumber,
      bankCode,
    });

    return {
      success: result.status === 'valid',
      data: result,
    };
  }
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsNumber,
  IsOptional,
  Min,
} from 'class-validator';

export class InitializePaymentDto {
  @ApiProperty({
    description: 'Customer email address',
    example: '[email protected]',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    description: 'Payment amount in kobo (100 kobo = 1 NGN)',
    example: 315000,
    minimum: 1,
  })
  @IsNumber()
  @Min(1)
  amount: number;

  @ApiPropertyOptional({
    description: 'Payment method',
    example: 'card',
    default: 'card',
  })
  @IsString()
  @IsOptional()
  paymentMethod?: string;

  @ApiPropertyOptional({
    description: 'Additional metadata to pass to Paystack',
    example: { cartId: '507f1f77bcf86cd799439017' },
  })
  @IsOptional()
  metadata?: Record<string, unknown>;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsNumber,
  Min,
  Max,
  ValidateIf,
} from 'class-validator';
import type { PromotionStatus, DiscountType } from '../types';

export class CreatePromotionDto {
  @ApiProperty({
    example: 'Black Friday Mega Sale',
    description: 'Human-readable name of the promotion',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    example: '2025-11-28T00:00:00.000Z',
    description: 'Start date/time of the promotion (ISO-8601)',
  })
  @IsDateString()
  activeFrom: string;

  @ApiProperty({
    example: '2025-11-29T00:00:00.000Z',
    description: 'End date/time of the promotion (ISO-8601)',
  })
  @IsDateString()
  activeTo: string;

  @ApiProperty({
    example: 'https://surespot.app/promotions/black-friday',
    description:
      'Link to navigate when the banner is tapped, can be deeplink or url',
  })
  @IsString()
  @IsNotEmpty()
  linkTo: string;

  @ApiPropertyOptional({
    example: 'BF2025',
    description: 'Optional discount code displayed on the banner',
  })
  @IsOptional()
  @IsString()
  discountCode?: string;

  @ApiPropertyOptional({
    enum: ['percentage', 'fixed_amount'],
    example: 'percentage',
    description: 'Type of discount: percentage or fixed_amount',
  })
  @IsOptional()
  @IsEnum(['percentage', 'fixed_amount'])
  discountType?: DiscountType;

  @ApiPropertyOptional({
    example: 20,
    description:
      'Discount value: percentage (0-100) for percentage type, or fixed amount in kobo for fixed_amount type',
  })
  @ValidateIf((o) => o.discountType !== undefined)
  @IsNumber()
  @Min(0)
  @ValidateIf((o) => o.discountType === 'percentage')
  @Max(100, { message: 'Percentage discount must be between 0 and 100' })
  discountValue?: number;

  @ApiPropertyOptional({
    example: 50000,
    description: 'Minimum order amount in kobo to qualify for the discount',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minOrderAmount?: number;

  @ApiPropertyOptional({
    example: 100000,
    description:
      'Maximum discount amount in kobo (only applicable for percentage discounts)',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxDiscountAmount?: number;

  @ApiPropertyOptional({
    enum: ['inactive', 'active', 'ended'],
    description:
      'Initial status of the promotion. Defaults to inactive if omitted.',
  })
  @IsOptional()
  @IsEnum(['inactive', 'active', 'ended'])
  status?: PromotionStatus;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsNumber,
  IsArray,
  Min,
  Max,
  ValidateIf,
} from 'class-validator';
import type { PromotionStatus, DiscountType } from '../types';
import { FoodCategory } from '../../food-items/schemas/food-item.schema';

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
    enum: [
      'percentage',
      'fixed_amount',
      'free_delivery',
      'free_category',
      'bogo',
    ],
    example: 'percentage',
    description: 'Type of discount',
  })
  @IsOptional()
  @IsEnum([
    'percentage',
    'fixed_amount',
    'free_delivery',
    'free_category',
    'bogo',
  ])
  discountType?: DiscountType;

  @ApiPropertyOptional({
    example: 20,
    description:
      'Discount value: percentage (0-100) for percentage type, or fixed amount in kobo for fixed_amount type',
  })
  @ValidateIf((o) => o.discountType !== undefined)
  @Type(() => Number)
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
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minOrderAmount?: number;

  @ApiPropertyOptional({
    example: 100000,
    description:
      'Maximum discount amount in kobo (only applicable for percentage discounts)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxDiscountAmount?: number;

  @ApiPropertyOptional({
    enum: Object.values(FoodCategory),
    description: 'Category for free_category or bogo (qualifying items)',
  })
  @IsOptional()
  @IsEnum(FoodCategory)
  targetCategory?: FoodCategory;

  @ApiPropertyOptional({
    example: ['507f1f77bcf86cd799439011'],
    description:
      'Specific food item IDs for bogo (alternative to targetCategory)',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetFoodItemIds?: string[];

  @ApiPropertyOptional({
    example: 2,
    description: 'Max free items from category (free_category only)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  maxFreeQuantity?: number;

  @ApiPropertyOptional({
    example: 2,
    description: 'Buy quantity to trigger BOGO (bogo only)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  buyQuantity?: number;

  @ApiPropertyOptional({
    example: 1,
    description: 'Free quantity per BOGO trigger (bogo only)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  getFreeQuantity?: number;

  @ApiPropertyOptional({
    example: 4,
    description: 'Cap on free units per order (bogo only)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxRedeemablePerOrder?: number;

  @ApiPropertyOptional({
    enum: ['inactive', 'active', 'ended'],
    description:
      'Initial status of the promotion. Defaults to inactive if omitted.',
  })
  @IsOptional()
  @IsEnum(['inactive', 'active', 'ended'])
  status?: PromotionStatus;
}

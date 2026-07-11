import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsArray,
  Max,
  Min,
  ValidateIf,
  Matches,
} from 'class-validator';
import type { DiscountType } from '../../promotions/types';
import { FoodCategory } from '../../food-items/schemas/food-item.schema';

export class CreateMarketerDto {
  @ApiProperty({ example: 'Jane Doe' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'jane@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ enum: ['percentage', 'fixed_amount', 'free_delivery', 'free_category', 'bogo'] })
  @IsEnum(['percentage', 'fixed_amount', 'free_delivery', 'free_category', 'bogo'])
  discountType: DiscountType;

  @ApiPropertyOptional({ example: 20, description: 'Discount value: percentage (0-100) or fixed amount in kobo' })
  @ValidateIf((o) => o.discountType !== 'free_delivery')
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @ValidateIf((o) => o.discountType === 'percentage')
  @Max(100, { message: 'Percentage discount must be between 0 and 100' })
  discountValue?: number;

  @ApiPropertyOptional({ example: 50000, description: 'Minimum order amount in kobo' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minOrderAmount?: number;

  @ApiPropertyOptional({ example: 100000, description: 'Maximum discount amount in kobo (for percentage discounts)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxDiscountAmount?: number;

  @ApiPropertyOptional({ enum: Object.values(FoodCategory) })
  @IsOptional()
  @IsEnum(FoodCategory)
  targetCategory?: FoodCategory;

  @ApiPropertyOptional({ example: ['507f1f77bcf86cd799439011'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetFoodItemIds?: string[];

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  maxFreeQuantity?: number;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  buyQuantity?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  getFreeQuantity?: number;

  @ApiPropertyOptional({ example: 4 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxRedeemablePerOrder?: number;

  @ApiPropertyOptional({ example: 'JANE2025', description: '8-character alphanumeric code. If omitted, one is auto-generated.' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9]{8}$/, { message: 'Code must be exactly 8 uppercase alphanumeric characters' })
  code?: string;

  @ApiPropertyOptional({ example: '0123456789', description: '10-digit bank account number (NUBAN)' })
  @IsOptional()
  @IsString()
  accountNumber?: string;

  @ApiPropertyOptional({ example: '058', description: 'Paystack bank code' })
  @IsOptional()
  @IsString()
  bankCode?: string;

  @ApiPropertyOptional({ example: 'Guaranty Trust Bank' })
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiPropertyOptional({ example: 'Jane Doe' })
  @IsOptional()
  @IsString()
  accountName?: string;
}

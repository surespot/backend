import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import type { DiscountType } from '../../promotions/types';
import { FoodCategory } from '../../food-items/schemas/food-item.schema';
import {
  RewardCampaignStatus,
  RewardTrigger,
} from '../schemas/reward-campaign.schema';

const DISCOUNT_TYPES = [
  'percentage',
  'fixed_amount',
  'free_delivery',
  'free_category',
  'bogo',
] as const;

export class RewardAccumulationDto {
  @ApiProperty({
    description:
      'false: a user earns this reward once. true: a user earns one for every qualifying action (e.g. every reviewed meal).',
    example: true,
  })
  @IsBoolean()
  enabled: boolean;

  @ApiPropertyOptional({
    description:
      'Most rewards one user can earn from this campaign. Leave empty for unlimited. Only used when accumulation is enabled.',
    example: 5,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxPerUser?: number;
}

export class CreateRewardCampaignDto {
  @ApiProperty({ example: 'Review & save 5%' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({
    example: 'Review a meal you ordered and get 5% off your next order.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    description: 'Image shown on the special rewards screen',
  })
  @IsOptional()
  @IsUrl()
  imageUrl?: string;

  @ApiProperty({
    enum: RewardTrigger,
    example: RewardTrigger.REVIEW,
    description: 'What a customer has to do to earn the reward',
  })
  @IsEnum(RewardTrigger)
  trigger: RewardTrigger;

  @ApiProperty({
    example: 'REVIEW5',
    description:
      'The code customers type at checkout. Letters, numbers, - and _ only. Must not clash with any promotion or marketer code.',
  })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{3,32}$/, {
    message: 'code must be 3-32 characters: letters, numbers, - or _',
  })
  code: string;

  @ApiPropertyOptional({
    enum: RewardCampaignStatus,
    default: RewardCampaignStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(RewardCampaignStatus)
  status?: RewardCampaignStatus;

  @ApiProperty({
    example: '2026-11-08T00:00:00.000Z',
    description: 'Rewards can be earned from this moment (ISO-8601)',
  })
  @IsDateString()
  earnFrom: string;

  @ApiProperty({
    example: '2026-12-08T00:00:00.000Z',
    description: 'Rewards can be earned until this moment (ISO-8601)',
  })
  @IsDateString()
  earnTo: string;

  @ApiPropertyOptional({
    example: 30,
    default: 30,
    description:
      'How many days an earned reward stays usable, from when it is granted',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  validityDays?: number;

  @ApiPropertyOptional({
    default: true,
    description:
      'true: an admin approves each qualifying action before the reward is granted. false: granted automatically (an admin can still revoke).',
  })
  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;

  @ApiPropertyOptional({ type: RewardAccumulationDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RewardAccumulationDto)
  accumulation?: RewardAccumulationDto;

  // ---- Benefit: same fields and meaning as a promotion ----

  @ApiProperty({ enum: DISCOUNT_TYPES, example: 'percentage' })
  @IsEnum(DISCOUNT_TYPES)
  discountType: DiscountType;

  @ApiPropertyOptional({
    example: 5,
    description:
      'Percentage (0-100) for percentage, or amount in kobo for fixed_amount',
  })
  @ValidateIf((o: CreateRewardCampaignDto) => o.discountValue !== undefined)
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discountValue?: number;

  @ApiPropertyOptional({
    example: 100000,
    description: 'Minimum order amount in kobo',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minOrderAmount?: number;

  @ApiPropertyOptional({
    example: 100000,
    description: 'Maximum discount in kobo (percentage only)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxDiscountAmount?: number;

  @ApiPropertyOptional({
    enum: Object.values(FoodCategory),
    description: 'Category for free_category or bogo',
  })
  @IsOptional()
  @IsEnum(FoodCategory)
  targetCategory?: FoodCategory;

  @ApiPropertyOptional({ description: 'Specific food item ids for bogo' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetFoodItemIds?: string[];

  @ApiPropertyOptional({ description: 'Max free items (free_category only)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  maxFreeQuantity?: number;

  @ApiPropertyOptional({
    description: 'Quantity to buy to trigger (bogo only)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  buyQuantity?: number;

  @ApiPropertyOptional({ description: 'Free quantity per trigger (bogo only)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  getFreeQuantity?: number;

  @ApiPropertyOptional({
    description: 'Cap on free units per order (bogo only)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxRedeemablePerOrder?: number;
}

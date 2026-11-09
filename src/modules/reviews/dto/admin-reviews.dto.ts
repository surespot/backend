import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ReviewModerationStatus } from '../../food-items/schemas/review.schema';

/** Which kind of review: one a customer left on a single item, or on a whole order. */
export enum ReviewKind {
  ITEMS = 'items',
  ORDERS = 'orders',
}

export class AdminGetReviewsDto {
  @ApiPropertyOptional({ enum: ReviewKind, default: ReviewKind.ITEMS })
  @IsOptional()
  @IsEnum(ReviewKind)
  type?: ReviewKind = ReviewKind.ITEMS;

  @ApiPropertyOptional({ enum: ReviewModerationStatus })
  @IsOptional()
  @IsEnum(ReviewModerationStatus)
  status?: ReviewModerationStatus;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class HideReviewDto {
  @ApiPropertyOptional({ example: 'Contains abusive language' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

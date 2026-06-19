import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsInt,
  Min,
  Max,
  IsEnum,
  IsString,
  IsBoolean,
  IsNumber,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { FoodCategory } from '../schemas/food-item.schema';

export enum SortBy {
  DEFAULT = 'default',
  PRICE = 'price',
  RATING = 'rating',
  POPULARITY = 'popularity',
  NEWEST = 'newest',
  NAME = 'name',
  FASTEST = 'fastest', // For Quick Bites - sorts by estimatedTime.min ASC
  RELEVANCE = 'relevance', // For search results
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export class GetFoodItemsFilterDto {
  @ApiPropertyOptional({
    description: 'Page number (1-indexed)',
    example: 1,
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Items per page',
    example: 20,
    default: 20,
    minimum: 1,
    maximum: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Filter by category',
    enum: FoodCategory,
    example: FoodCategory.FOOD,
  })
  @IsOptional()
  @IsEnum(FoodCategory)
  category?: FoodCategory;

  @ApiPropertyOptional({
    description: 'Comma-separated tags to filter by',
    example: 'RICE,CHICKEN',
  })
  @IsOptional()
  @IsString()
  tags?: string;

  @ApiPropertyOptional({
    description: 'Minimum price filter (in kobo)',
    example: 100000,
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({
    description: 'Maximum price filter (in kobo)',
    example: 500000,
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({
    description: 'Minimum average rating (0-5)',
    example: 4,
    minimum: 0,
    maximum: 5,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(5)
  minRating?: number;

  @ApiPropertyOptional({
    description: 'Filter by availability',
    example: true,
    default: true,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  isAvailable?: boolean = true;

  @ApiPropertyOptional({
    description: 'Filter popular items only',
    example: false,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  isPopular?: boolean;

  @ApiPropertyOptional({
    description: 'Sort field',
    enum: SortBy,
    example: SortBy.DEFAULT,
    default: SortBy.DEFAULT,
  })
  @IsOptional()
  @IsEnum(SortBy)
  sortBy?: SortBy = SortBy.DEFAULT;

  @ApiPropertyOptional({
    description: 'Sort order',
    enum: SortOrder,
    example: SortOrder.ASC,
    default: SortOrder.ASC,
  })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder = SortOrder.ASC;

  @ApiPropertyOptional({
    description: 'Search query (searches name, description, tags)',
    example: 'jollof',
  })
  @IsOptional()
  @IsString()
  search?: string;
}

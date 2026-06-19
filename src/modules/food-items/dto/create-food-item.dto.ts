import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsEnum,
  IsArray,
  IsBoolean,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { FoodCategory } from '../schemas/food-item.schema';

class EstimatedTimeDto {
  @ApiProperty({
    description: 'Minimum preparation time in minutes',
    example: 20,
  })
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      return isNaN(parsed) ? value : parsed;
    }
    return value;
  })
  @IsNumber()
  @Min(0)
  min: number;

  @ApiProperty({
    description: 'Maximum preparation time in minutes',
    example: 25,
  })
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      return isNaN(parsed) ? value : parsed;
    }
    return value;
  })
  @IsNumber()
  @Min(0)
  max: number;
}

export class CreateFoodItemDto {
  @ApiProperty({ description: 'Food item name', example: 'Jollof Rice' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({
    description: 'Food item description',
    example: 'Smoky jollof with grilled chicken wing spiced with local spices.',
  })
  @IsNotEmpty()
  @IsString()
  description: string;

  @ApiProperty({ description: 'URL-friendly slug', example: 'jollof-rice' })
  @IsNotEmpty()
  @IsString()
  slug: string;

  @ApiProperty({
    description: 'Price in kobo (smallest currency unit)',
    example: 150000,
  })
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      return isNaN(parsed) ? value : parsed;
    }
    return value;
  })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiPropertyOptional({
    description: 'Currency code',
    example: 'NGN',
    default: 'NGN',
  })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({
    description: 'Main image URL',
    example: 'https://cdn.surespot.app/images/jollof-rice.jpg',
  })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({
    description: 'Additional image URLs (comma-separated string)',
    type: String,
    example:
      'https://cdn.surespot.app/images/jollof-rice-2.jpg,https://cdn.surespot.app/images/jollof-rice-3.jpg',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value
        .split(',')
        .map((url) => url.trim())
        .filter((url) => url.length > 0);
    }
    if (Array.isArray(value)) {
      return value;
    }
    return value;
  })
  @IsArray()
  @IsString({ each: true })
  imageUrls?: string[];

  @ApiProperty({
    description: 'Food category',
    enum: FoodCategory,
    example: FoodCategory.FOOD,
  })
  @IsEnum(FoodCategory)
  category: FoodCategory;

  @ApiPropertyOptional({
    description: 'Tags for searching and filtering (comma-separated string)',
    type: String,
    example: 'RICE,CHICKEN,JOLLOF,SPICY',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);
    }
    if (Array.isArray(value)) {
      return value;
    }
    return value;
  })
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiProperty({
    description: 'Estimated preparation time',
    type: EstimatedTimeDto,
  })
  @ValidateNested()
  @Type(() => EstimatedTimeDto)
  estimatedTime: EstimatedTimeDto;

  @ApiPropertyOptional({
    description: 'Whether item is available for ordering',
    default: true,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      if (value === 'true' || value === '1') return true;
      if (value === 'false' || value === '0') return false;
    }
    return value;
  })
  @IsBoolean()
  isAvailable?: boolean;

  @ApiPropertyOptional({
    description: 'Whether item is active/published',
    default: true,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      if (value === 'true' || value === '1') return true;
      if (value === 'false' || value === '0') return false;
    }
    return value;
  })
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Array of extra IDs (comma-separated string or array)',
    type: String,
    example: '507f1f77bcf86cd799439012,507f1f77bcf86cd799439013',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value
        .split(',')
        .map((id) => id.trim())
        .filter((id) => id.length > 0);
    }
    if (Array.isArray(value)) {
      return value;
    }
    return value;
  })
  @IsArray()
  @IsString({ each: true })
  extras?: string[];

  @ApiPropertyOptional({
    description: 'Mark as popular item',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      if (value === 'true' || value === '1') return true;
      if (value === 'false' || value === '0') return false;
    }
    return value;
  })
  @IsBoolean()
  isPopular?: boolean;

  @ApiPropertyOptional({
    description: 'Sort order for display',
    default: 0,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      return isNaN(parsed) ? value : parsed;
    }
    return value;
  })
  @IsNumber()
  sortOrder?: number;
}

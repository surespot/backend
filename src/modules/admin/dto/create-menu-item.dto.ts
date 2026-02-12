import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsBoolean,
  IsArray,
  IsOptional,
  IsNotEmpty,
  Min,
  Max,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateMenuItemDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ description: 'Price in kobo' })
  @Transform(({ value }) => (typeof value === 'string' ? parseFloat(value) : value))
  @IsNumber()
  @Min(0)
  price: number;

  @ApiPropertyOptional({ description: 'true = extra, false/omit = food' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  extra?: boolean;

  @ApiPropertyOptional({ description: 'Prep time in minutes (5-45)', minimum: 5, maximum: 45 })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? parseInt(value, 10) : value))
  @IsNumber()
  @Min(5)
  @Max(45)
  prepTime?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: 'Category (food only)' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Extra IDs to attach (food only)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assignedExtras?: string[];

  @ApiPropertyOptional({ description: 'e.g. "1 piece" (extra only)' })
  @IsOptional()
  @IsString()
  quantity?: string;

  @ApiPropertyOptional({ description: 'Use when image not uploaded via multipart' })
  @IsOptional()
  @IsString()
  imageUrl?: string;
}

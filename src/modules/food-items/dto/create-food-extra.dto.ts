import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsBoolean,
  IsOptional,
  Min,
} from 'class-validator';

export class CreateFoodExtraDto {
  @ApiProperty({ description: 'Extra name', example: 'Extra chicken' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiPropertyOptional({
    description: 'Extra description',
    example: 'Additional grilled chicken pieces',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Image URL for the extra',
    example: 'https://res.cloudinary.com/demo/image/upload/v1234567890/extra.jpg',
  })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiProperty({
    description: 'Price in kobo (smallest currency unit)',
    example: 50000,
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
    description: 'Whether extra is available',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @ApiPropertyOptional({
    description: 'Extra category (e.g., "Protein", "Sauce", "Drinks")',
    example: 'Protein',
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    description: 'Sort order for display',
    default: 0,
  })
  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}

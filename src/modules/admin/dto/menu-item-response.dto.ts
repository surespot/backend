import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PricingType } from '../../food-items/schemas/food-item.schema';

export class MenuItemResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ description: 'Global base price in kobo' })
  price: number;

  @ApiPropertyOptional({ description: 'Location-specific price override in kobo; use this when present' })
  locationPrice?: number;

  @ApiProperty()
  description: string;

  @ApiProperty({ description: 'Image URL' })
  image: string;

  @ApiProperty({ description: 'true = extra, false = food' })
  extra: boolean;

  @ApiProperty()
  inStock: boolean;

  @ApiPropertyOptional()
  category?: string;

  @ApiPropertyOptional()
  tags?: string[];

  @ApiPropertyOptional({ description: 'Prep time in minutes (food only)' })
  prepTime?: number;

  @ApiPropertyOptional({ description: 'Assigned extra IDs (food only)' })
  assignedExtras?: string[];

  @ApiPropertyOptional({ description: 'Quantity or notes (extra only)' })
  quantity?: string;

  @ApiPropertyOptional({ enum: PricingType, description: 'per_portion or per_pack (food only)' })
  pricingType?: PricingType;

  @ApiPropertyOptional()
  reviews?: { averageRating?: number; ratingCount?: number };
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MenuItemResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ description: 'Price in kobo' })
  price: number;

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

  @ApiPropertyOptional()
  reviews?: { averageRating?: number; ratingCount?: number };
}

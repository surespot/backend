import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';

export class SetItemPriceDto {
  @ApiProperty({ description: 'Location-specific price in kobo', minimum: 0 })
  @IsInt()
  @Min(0)
  price: number;

  @ApiPropertyOptional({
    enum: ['food', 'extra'],
    description: 'Item type; auto-detect if omitted',
  })
  @IsOptional()
  @IsEnum(['food', 'extra'])
  itemType?: 'food' | 'extra';
}

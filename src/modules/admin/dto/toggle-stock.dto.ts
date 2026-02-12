import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';

export class ToggleStockDto {
  @ApiProperty({ description: 'Whether the item is in stock' })
  @IsBoolean()
  inStock: boolean;

  @ApiPropertyOptional({ enum: ['food', 'extra'], description: 'Item type; auto-detect if omitted' })
  @IsOptional()
  @IsEnum(['food', 'extra'])
  itemType?: 'food' | 'extra';
}

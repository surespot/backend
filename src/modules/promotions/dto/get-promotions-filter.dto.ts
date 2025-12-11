import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class GetPromotionsFilterDto {
  @ApiPropertyOptional({
    description: 'Filter promotions starting from this date (inclusive)',
    example: '2025-11-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    description: 'Filter promotions up to this date (inclusive)',
    example: '2025-12-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  to?: string;
}

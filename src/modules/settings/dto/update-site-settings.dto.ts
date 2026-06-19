import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsNumber, Min, Max } from 'class-validator';

export class UpdateSiteSettingsDto {
  @ApiPropertyOptional({
    description: 'Packaging fee in kobo added to orders with per-pack items',
    example: 30000,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  packagingFeeKobo?: number;

  @ApiPropertyOptional({
    description: 'Hour (WAT, 24h) after which new orders are rejected',
    example: 20,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(23)
  orderCutoffHour?: number;
}

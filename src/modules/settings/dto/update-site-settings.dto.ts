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
    description: 'Customer-facing delivery fee per km in kobo (e.g. 40000 = ₦400/km)',
    example: 40000,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  deliveryFeePerKmKobo?: number;

  @ApiPropertyOptional({
    description: 'Platform-funded base fee credited to the rider on every delivery, in kobo (e.g. 50000 = ₦500)',
    example: 50000,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  riderBaseFeeKobo?: number;

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

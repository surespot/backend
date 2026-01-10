import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNumber,
  Min,
  Max,
  MaxLength,
} from 'class-validator';

export class MarkOrderDeliveredDto {
  @ApiPropertyOptional({
    description: 'Optional delivery message',
    example: 'Order delivered successfully',
    maxLength: 500,
  })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  message?: string;

  @ApiPropertyOptional({
    description: 'Latitude coordinate at delivery location',
    example: 6.5244,
    minimum: -90,
    maximum: 90,
  })
  @IsNumber()
  @IsOptional()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({
    description: 'Longitude coordinate at delivery location',
    example: 3.3792,
    minimum: -180,
    maximum: 180,
  })
  @IsNumber()
  @IsOptional()
  @Min(-180)
  @Max(180)
  longitude?: number;
}

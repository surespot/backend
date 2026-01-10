import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  Min,
  Max,
} from 'class-validator';

export class UpdateRiderLocationDto {
  @ApiProperty({
    description: 'Street address',
    example: '123 Main Street',
  })
  @IsString()
  @IsNotEmpty()
  streetAddress: string;

  @ApiProperty({
    description: 'Latitude coordinate',
    example: 6.5244,
  })
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;

  @ApiProperty({
    description: 'Longitude coordinate',
    example: 3.3792,
  })
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;

  @ApiPropertyOptional({
    description: 'State',
    example: 'Lagos',
  })
  @IsString()
  @IsOptional()
  state?: string;

  @ApiProperty({
    description: 'Country',
    example: 'Nigeria',
    default: 'Nigeria',
  })
  @IsString()
  @IsNotEmpty()
  country: string;

  @ApiPropertyOptional({
    description: 'Region ID',
    example: '507f1f77bcf86cd799439011',
  })
  @IsString()
  @IsOptional()
  regionId?: string;
}

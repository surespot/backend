import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  Min,
  Max,
  IsLongitude,
  IsLatitude,
} from 'class-validator';

export class UpdateSavedLocationDto {
  @ApiProperty({
    example: 'Home',
    description: 'Label for the saved location',
    required: false,
  })
  @IsString()
  @IsOptional()
  label?: string;

  @ApiProperty({
    example: '123 Main Street',
    description: 'Street address',
    required: false,
  })
  @IsString()
  @IsOptional()
  streetAddress?: string;

  @ApiProperty({
    example: 6.5244,
    description: 'Latitude coordinate',
    minimum: -90,
    maximum: 90,
    required: false,
  })
  @IsNumber()
  @IsLatitude()
  @Min(-90)
  @Max(90)
  @IsOptional()
  latitude?: number;

  @ApiProperty({
    example: 3.3792,
    description: 'Longitude coordinate',
    minimum: -180,
    maximum: 180,
    required: false,
  })
  @IsNumber()
  @IsLongitude()
  @Min(-180)
  @Max(180)
  @IsOptional()
  longitude?: number;

  @ApiProperty({
    example: 'Lagos',
    description: 'State or province',
    required: false,
  })
  @IsString()
  @IsOptional()
  state?: string;

  @ApiProperty({
    example: 'Nigeria',
    description: 'Country name',
    required: false,
  })
  @IsString()
  @IsOptional()
  country?: string;

  @ApiProperty({
    example: 'region_123',
    description: 'Region identifier',
    required: false,
  })
  @IsString()
  @IsOptional()
  regionId?: string;
}

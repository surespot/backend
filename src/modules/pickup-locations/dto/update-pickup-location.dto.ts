import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNumber,
  Min,
  Max,
  IsLongitude,
  IsLatitude,
  IsBoolean,
  IsMongoId,
} from 'class-validator';

export class UpdatePickupLocationDto {
  @ApiProperty({
    example: 'Surespot, Iba, Ojo',
    description: 'Pickup location name',
    required: false,
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({
    example: '123 Main Street, Iba, Ojo, Lagos',
    description: 'Full address of the pickup location',
    required: false,
  })
  @IsString()
  @IsOptional()
  address?: string;

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
    example: '507f1f77bcf86cd799439011',
    description: 'Region ID',
    required: false,
  })
  @IsString()
  @IsMongoId()
  @IsOptional()
  regionId?: string;

  @ApiProperty({
    example: true,
    description: 'Whether the pickup location is active',
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

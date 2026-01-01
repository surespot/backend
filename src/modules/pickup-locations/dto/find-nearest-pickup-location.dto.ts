import { ApiProperty } from '@nestjs/swagger';
import {
  IsNumber,
  IsNotEmpty,
  Min,
  Max,
  IsLongitude,
  IsLatitude,
} from 'class-validator';
import { Type } from 'class-transformer';

export class FindNearestPickupLocationDto {
  @ApiProperty({
    example: 6.5244,
    description: 'Latitude coordinate',
    minimum: -90,
    maximum: 90,
  })
  @Type(() => Number)
  @IsNumber()
  @IsLatitude()
  @Min(-90)
  @Max(90)
  @IsNotEmpty()
  latitude: number;

  @ApiProperty({
    example: 3.3792,
    description: 'Longitude coordinate',
    minimum: -180,
    maximum: 180,
  })
  @Type(() => Number)
  @IsNumber()
  @IsLongitude()
  @Min(-180)
  @Max(180)
  @IsNotEmpty()
  longitude: number;
}

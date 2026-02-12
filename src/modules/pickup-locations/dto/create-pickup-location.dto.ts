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
  IsBoolean,
  IsMongoId,
  IsEmail,
} from 'class-validator';

export class CreatePickupLocationDto {
  @ApiProperty({
    example: 'Surespot, Iba, Ojo',
    description: 'Pickup location name',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    example: '123 Main Street, Iba, Ojo, Lagos',
    description: 'Full address of the pickup location',
  })
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiProperty({
    example: 6.5244,
    description: 'Latitude coordinate',
    minimum: -90,
    maximum: 90,
  })
  @IsNumber()
  @IsLatitude()
  @Min(-90)
  @Max(90)
  latitude: number;

  @ApiProperty({
    example: 3.3792,
    description: 'Longitude coordinate',
    minimum: -180,
    maximum: 180,
  })
  @IsNumber()
  @IsLongitude()
  @Min(-180)
  @Max(180)
  longitude: number;

  @ApiProperty({
    example: '507f1f77bcf86cd799439011',
    description: 'Region ID',
  })
  @IsString()
  @IsMongoId()
  @IsNotEmpty()
  regionId: string;

  @ApiProperty({
    example: true,
    description: 'Whether the pickup location is active',
    required: false,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiProperty({
    example: 'Ada',
    description: 'First name of the pickup location admin user',
  })
  @IsString()
  @IsNotEmpty()
  adminFirstName: string;

  @ApiProperty({
    example: 'Okafor',
    description: 'Last name of the pickup location admin user',
  })
  @IsString()
  @IsNotEmpty()
  adminLastName: string;

  @ApiProperty({
    example: 'pickup-admin@surespot.app',
    description: 'Email address for the pickup location admin dashboard user',
  })
  @IsEmail()
  @IsNotEmpty()
  adminEmail: string;

  @ApiProperty({
    example: '+2349012345678',
    description:
      'Optional phone number for the pickup location admin (for contact only)',
    required: false,
  })
  @IsString()
  @IsOptional()
  adminPhone?: string;
}

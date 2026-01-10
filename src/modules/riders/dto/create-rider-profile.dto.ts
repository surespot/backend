import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsEmail,
  IsOptional,
  IsDateString,
  IsMongoId,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  Min,
  Max,
  IsInt,
  IsPhoneNumber,
} from 'class-validator';

export class CreateRiderProfileDto {
  @ApiProperty({
    description: 'First name of the rider',
    example: 'John',
  })
  @IsString()
  firstName: string;

  @ApiProperty({
    description: 'Last name of the rider',
    example: 'Doe',
  })
  @IsString()
  lastName: string;

  @ApiProperty({
    description: 'Phone number of the rider',
    example: '+2348012345678',
  })
  @IsString()
  @IsPhoneNumber()
  phone: string;

  @ApiPropertyOptional({
    description: 'Email address of the rider',
    example: 'john.doe@example.com',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    description: 'Date of birth (ISO 8601 format)',
    example: '1990-05-15',
  })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional({
    description: 'Address of the rider',
    example: '123 Main Street, Lagos',
  })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({
    description: 'National Identification Number (NIN)',
    example: '12345678901',
  })
  @IsOptional()
  @IsString()
  nin?: string;

  @ApiProperty({
    description: 'Region ID for the rider work area',
    example: '507f1f77bcf86cd799439011',
  })
  @IsMongoId()
  regionId: string;

  @ApiPropertyOptional({
    description:
      'Work schedule as array of day numbers (0=Sunday, 1=Monday, etc.)',
    example: [1, 2, 3, 4, 5, 6],
    type: [Number],
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  schedule?: number[];
}

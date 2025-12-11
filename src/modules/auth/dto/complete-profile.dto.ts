import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsDateString,
  IsOptional,
} from 'class-validator';

export class CompleteProfileDto {
  @ApiProperty({
    example: 'Sure',
    description: 'User first name',
  })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({
    example: 'Spot',
    description: 'User last name',
  })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({
    example: '1995-05-17',
    description: 'User birthday in ISO 8601 format (YYYY-MM-DD)',
  })
  @IsDateString()
  birthday: string;

  @ApiProperty({
    example: '+2349014226320',
    description: 'User phone number (optional - only for phone signup users)',
    required: false,
  })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({
    example: 'user@example.com',
    description: 'User email address (optional - only for email signup users)',
    required: false,
  })
  @IsString()
  @IsOptional()
  email?: string;
}

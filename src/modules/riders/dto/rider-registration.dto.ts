import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  Length,
  Matches,
  IsArray,
  IsOptional,
  ArrayMinSize,
  ArrayMaxSize,
  IsInt,
  Min,
  Max,
} from 'class-validator';

export class InitiateRiderRegistrationDto {
  @ApiProperty({
    description: '16-digit registration code received from the store',
    example: '1234567890123456',
  })
  @IsString()
  @Length(16, 16, { message: 'Registration code must be exactly 16 digits' })
  @Matches(/^\d{16}$/, {
    message: 'Registration code must contain only digits',
  })
  registrationCode: string;

  @ApiProperty({
    description: 'First name (must match profile)',
    example: 'John',
  })
  @IsString()
  firstName: string;

  @ApiProperty({
    description: 'Last name (must match profile)',
    example: 'Doe',
  })
  @IsString()
  lastName: string;
}

export class CompleteRiderRegistrationDto {
  @ApiProperty({
    description: '16-digit registration code',
    example: '1234567890123456',
  })
  @IsString()
  @Length(16, 16, { message: 'Registration code must be exactly 16 digits' })
  @Matches(/^\d{16}$/, {
    message: 'Registration code must contain only digits',
  })
  registrationCode: string;

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

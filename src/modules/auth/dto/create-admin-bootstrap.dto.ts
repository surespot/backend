import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class CreateAdminBootstrapDto {
  @ApiProperty({ example: 'Admin', description: 'Admin first name' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'User', description: 'Admin last name' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ example: 'admin@surespot.app', description: 'Admin email' })
  @IsEmail()
  email: string;

  @ApiProperty({
    example: '+2349012345678',
    description: 'Admin phone (optional)',
    required: false,
  })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({
    example: 'Sup3rSecret!',
    description:
      'Password must be at least 8 characters with uppercase, lowercase, number and special character',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
    message:
      'Password must contain at least 1 uppercase, 1 lowercase, 1 number and 1 special character',
  })
  password: string;

  @ApiProperty({
    example: 'Sup3rSecret!',
    description: 'Must match password field',
  })
  @IsString()
  @IsNotEmpty()
  confirmPassword: string;
}

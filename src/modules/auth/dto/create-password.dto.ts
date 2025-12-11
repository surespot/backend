import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MinLength, Matches } from 'class-validator';

export class CreatePasswordDto {
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

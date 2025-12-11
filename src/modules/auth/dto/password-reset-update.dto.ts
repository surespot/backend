import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MinLength, Matches } from 'class-validator';

export class PasswordResetUpdateDto {
  @ApiProperty({
    example: 'NewSup3rSecret!',
    description:
      'New password (must be different from old password and meet strength requirements)',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
    message:
      'Password must contain at least 1 uppercase, 1 lowercase, 1 number and 1 special character',
  })
  newPassword: string;

  @ApiProperty({
    example: 'NewSup3rSecret!',
    description: 'Must match newPassword field',
  })
  @IsString()
  @IsNotEmpty()
  confirmPassword: string;
}

import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, Length, Matches } from 'class-validator';

export class VerifyOtpDto {
  @ApiProperty({
    example: '+2349014226320',
    description: 'User phone number with country code',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+\d{1,3}\d{7,14}$/, {
    message: 'Phone number must be in international format',
  })
  phone: string;

  @ApiProperty({
    example: '574328',
    description: '6-digit OTP code',
  })
  @IsString()
  @IsNotEmpty()
  @Length(6, 6, { message: 'OTP must be exactly 6 digits' })
  @Matches(/^\d{6}$/, { message: 'OTP must contain only digits' })
  otp: string;
}

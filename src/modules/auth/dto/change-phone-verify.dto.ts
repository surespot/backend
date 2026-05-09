import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, Matches, Length } from 'class-validator';

export class ChangePhoneVerifyDto {
  @ApiProperty({
    example: '+2349014226320',
    description: 'The new phone number the OTP was sent to',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+\d{1,3}\d{7,14}$/, {
    message:
      'Phone number must be in international format (e.g., +2349014226320)',
  })
  newPhone: string;

  @ApiProperty({ example: '123456', description: 'OTP sent to the new number' })
  @IsString()
  @IsNotEmpty()
  @Length(6, 6, { message: 'OTP must be 6 digits' })
  otp: string;
}

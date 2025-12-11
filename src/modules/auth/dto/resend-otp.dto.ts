import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, Matches } from 'class-validator';

export class ResendOtpDto {
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
}

import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, Matches, IsOptional } from 'class-validator';

export class SendOtpDto {
  @ApiProperty({
    example: '+2349014226320',
    description: 'User phone number with country code',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+\d{1,3}\d{7,14}$/, {
    message:
      'Phone number must be in international format (e.g., +2349014226320)',
  })
  phone: string;

  @ApiProperty({
    example: '+234',
    description: 'Country code',
  })
  @IsOptional()
  countryCode: string;
}

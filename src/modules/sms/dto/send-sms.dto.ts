import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class SendSmsDto {
  @ApiProperty({
    example: 'SureSpot',
    description: 'Sender ID (max 11 characters)',
  })
  @IsString()
  @IsNotEmpty()
  from: string;

  @ApiProperty({
    example: '2347037770033',
    description: 'Phone number without + sign (e.g., 2347037770033)',
  })
  @IsString()
  @IsNotEmpty()
  to: string;

  @ApiProperty({
    example: 'Your OTP code is 123456',
    description: 'SMS message body',
  })
  @IsString()
  @IsNotEmpty()
  body: string;
}

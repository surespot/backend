import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class SendSmsDto {
  @ApiPropertyOptional({
    example: 'N-Alert',
    description: 'Sender ID (max 11 characters). Defaults to SMS_SENDER_ID env var.',
  })
  @IsOptional()
  @IsString()
  from?: string;

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

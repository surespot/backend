import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsIn } from 'class-validator';

export class RegisterPushTokenDto {
  @ApiProperty({
    example: 'f7a8b...device-token',
    description: 'Raw FCM (Android) or APNS (iOS) device push token',
  })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({
    example: 'android',
    enum: ['ios', 'android'],
    description: 'Platform the token was issued on',
  })
  @IsString()
  @IsIn(['ios', 'android'])
  platform: 'ios' | 'android';
}

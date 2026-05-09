import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, Matches } from 'class-validator';

export class ChangePhoneRequestDto {
  @ApiProperty({
    example: '+2349014226320',
    description: 'New phone number in international format',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+\d{1,3}\d{7,14}$/, {
    message:
      'Phone number must be in international format (e.g., +2349014226320)',
  })
  newPhone: string;
}

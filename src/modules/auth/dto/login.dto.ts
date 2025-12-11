import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    example: '+2349014226320',
    description: 'User phone number or email address',
    examples: {
      phone: {
        summary: 'Phone login',
        value: '+2349014226320',
      },
      email: {
        summary: 'Email login',
        value: 'user@example.com',
      },
    },
  })
  @IsString()
  @IsNotEmpty()
  identifier: string;

  @ApiProperty({
    example: 'Sup3rSecret!',
    description: 'User password',
  })
  @IsString()
  @IsNotEmpty()
  password: string;
}

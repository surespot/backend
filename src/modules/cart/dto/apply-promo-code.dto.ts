import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MaxLength, MinLength } from 'class-validator';

export class ApplyPromoCodeDto {
  @ApiProperty({
    description: 'Promo code to apply (case-insensitive)',
    example: 'TGIF224',
    minLength: 2,
    maxLength: 50,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(50)
  code: string;
}

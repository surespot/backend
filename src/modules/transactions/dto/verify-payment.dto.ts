import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class VerifyPaymentDto {
  @ApiProperty({
    description: 'Paystack transaction reference',
    example: 'TXN-1234567890-abc123',
  })
  @IsString()
  @IsNotEmpty()
  reference: string;
}

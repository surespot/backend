import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class AcceptOrderDto {
  @ApiProperty({
    description: 'Order ID to accept',
    example: '507f1f77bcf86cd799439011',
  })
  @IsString()
  @IsNotEmpty()
  orderId: string;
}

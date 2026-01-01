import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min, Max } from 'class-validator';

export class UpdateCartItemQuantityDto {
  @ApiProperty({
    description: 'New quantity (0 to remove item)',
    example: 2,
    minimum: 0,
    maximum: 99,
  })
  @IsNumber()
  @Min(0)
  @Max(99)
  quantity: number;
}

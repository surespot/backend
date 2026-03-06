import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateReviewDto {
  @ApiProperty({
    description: 'Rating from 1 to 5',
    example: 5,
    minimum: 1,
    maximum: 5,
  })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiProperty({
    description: 'Optional comment (max 500 characters)',
    example: 'Honestly did not expect it to be this good. Proper flavor.',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;

  @ApiProperty({
    description: 'Order ID when reviewing from order flow (optional)',
    example: '507f1f77bcf86cd799439011',
    required: false,
  })
  @IsOptional()
  @IsString()
  orderId?: string;
}

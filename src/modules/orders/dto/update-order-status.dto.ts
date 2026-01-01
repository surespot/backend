import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsNumber,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { DeliveryStatus } from '../schemas/order-delivery-status.schema';

export class UpdateOrderStatusDto {
  @ApiProperty({
    description: 'New delivery status',
    enum: DeliveryStatus,
    example: DeliveryStatus.PREPARING,
  })
  @IsEnum(DeliveryStatus)
  @IsNotEmpty()
  status: DeliveryStatus;

  @ApiPropertyOptional({
    description: 'Optional status message',
    example: 'Food is being prepared',
    maxLength: 500,
  })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  message?: string;

  @ApiPropertyOptional({
    description: 'Latitude coordinate (for rider location tracking)',
    example: 6.5244,
  })
  @IsNumber()
  @IsOptional()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({
    description: 'Longitude coordinate (for rider location tracking)',
    example: 3.3792,
  })
  @IsNumber()
  @IsOptional()
  @Min(-180)
  @Max(180)
  longitude?: number;
}

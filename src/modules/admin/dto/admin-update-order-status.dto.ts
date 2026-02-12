import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export enum AdminOrderStatus {
  PENDING = 'Pending',
  CONFIRMED = 'Confirmed',
  PREPARING = 'Preparing',
  READY = 'Ready',
  PICKED_UP = 'PickedUp',
  DELIVERED = 'Delivered',
  CANCELLED = 'Cancelled',
}

export class AdminUpdateOrderStatusDto {
  @ApiProperty({
    description: 'New order status',
    enum: AdminOrderStatus,
    example: AdminOrderStatus.PREPARING,
  })
  @IsEnum(AdminOrderStatus)
  status: AdminOrderStatus;

  @ApiPropertyOptional({
    description: 'Optional reason for status change (required for cancellations)',
    example: 'Customer requested cancellation',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}

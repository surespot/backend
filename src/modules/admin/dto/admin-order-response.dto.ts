import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AdminOrderRowDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  id: string;

  @ApiProperty({ example: 'ORD-2026-000123' })
  orderNo: string;

  @ApiProperty({ example: 'Oladinde Jacobs' })
  customerName: string;

  @ApiPropertyOptional({
    example: 'https://cdn.surespot.app/avatars/user.jpg',
  })
  customerAvatarUrl?: string;

  @ApiPropertyOptional({ example: '43 min' })
  timeRemaining?: string;

  @ApiProperty({ example: 4 })
  itemsCount: number;

  @ApiProperty({ example: 'Delivery', enum: ['Delivery', 'Pickup'] })
  type: 'Delivery' | 'Pickup';

  @ApiProperty({
    example: 'Pending',
    enum: [
      'Pending',
      'Confirmed',
      'Preparing',
      'Ready',
      'Picked Up',
      'Delivered',
      'Cancelled',
    ],
  })
  status: string;

  @ApiProperty({ example: 675000 })
  amount: number;

  @ApiPropertyOptional({ example: '507f1f77bcf86cd799439011' })
  assignedRiderId?: string | null;
}

export class AdminOrderItemDto {
  @ApiProperty({ example: '1' })
  id: string;

  @ApiProperty({ example: 'Jollof Rice' })
  name: string;

  @ApiProperty({ example: 'Smoky jollof with grilled chicken' })
  description: string;

  @ApiProperty({ example: 150000 })
  price: number;

  @ApiProperty({ example: 1 })
  qty: number;

  @ApiProperty({ example: 'https://cdn.surespot.app/images/jollof-rice.jpg' })
  imageUrl: string;

  @ApiProperty({ example: 'food', enum: ['food', 'extra'] })
  category: 'food' | 'extra';
}

export class AdminOrderDetailsDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  id: string;

  @ApiProperty({ example: 'ORD-2026-000123' })
  orderNo: string;

  @ApiProperty({ example: 'Delivery', enum: ['Delivery', 'Pickup'] })
  type: 'Delivery' | 'Pickup';

  @ApiProperty({
    example: 'Preparing',
    enum: [
      'Pending',
      'Confirmed',
      'Preparing',
      'Ready',
      'Picked Up',
      'Delivered',
      'Cancelled',
    ],
  })
  status: string;

  @ApiPropertyOptional({ example: '507f1f77bcf86cd799439011' })
  assignedRiderId?: string | null;

  @ApiProperty({ example: 'Oladinde Jacobs' })
  customerName: string;

  @ApiPropertyOptional({
    example: 'https://cdn.surespot.app/avatars/user.jpg',
  })
  customerAvatarUrl?: string;

  @ApiProperty({ example: '+234 8012345678' })
  customerPhone: string;

  @ApiPropertyOptional({ example: '12, Ayelori Street, Ikeja, Lagos' })
  deliveryAddress?: string;

  @ApiProperty({ example: '2026-02-10T08:33:00Z' })
  createdAt: string;

  @ApiProperty({ example: '2026-02-10T09:04:00Z' })
  expectedDelivery: string;

  @ApiProperty({ type: [AdminOrderItemDto] })
  items: AdminOrderItemDto[];

  @ApiProperty({ example: 480000 })
  subtotal: number;

  @ApiProperty({ example: 30000 })
  extras: number;

  @ApiProperty({ example: 0 })
  discount: number;

  @ApiProperty({ example: 80000 })
  deliveryFee: number;

  @ApiProperty({ example: 590000 })
  total: number;

  @ApiPropertyOptional({ example: 'Chidi Nwosu' })
  riderName?: string;

  @ApiPropertyOptional({ example: '+234 8098765432' })
  riderPhone?: string;

  @ApiPropertyOptional({
    example: '1234',
    description: '4-digit delivery confirmation code (only for door-delivery orders)',
  })
  deliveryConfirmationCode?: string;
}

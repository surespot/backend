import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsEnum,
  IsNumber,
  Min,
  Max,
  IsString,
  Matches,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { OrderStatus } from '../../orders/schemas/order.schema';

export enum AdminOrderSortBy {
  CREATED_AT = 'createdAt',
}

export enum SortDirection {
  ASC = 'asc',
  DESC = 'desc',
}

export class AdminGetOrdersDto {
  @ApiPropertyOptional({
    description: 'Page number (1-indexed)',
    example: 1,
    minimum: 1,
    default: 1,
  })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Number of items per page',
    example: 20,
    minimum: 1,
    maximum: 100,
    default: 20,
  })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    description:
      'Filter by order status(es). Can be a single status or comma-separated list (e.g. "pending,confirmed")',
    example: 'pending',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value : undefined))
  status?: string;

  @ApiPropertyOptional({
    description: 'Filter by start date (YYYY-MM-DD)',
    example: '2026-02-01',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'from date must be in YYYY-MM-DD format',
  })
  from?: string;

  @ApiPropertyOptional({
    description: 'Filter by end date (YYYY-MM-DD)',
    example: '2026-02-10',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'to date must be in YYYY-MM-DD format',
  })
  to?: string;

  @ApiPropertyOptional({
    description: 'Sort field',
    enum: AdminOrderSortBy,
    default: AdminOrderSortBy.CREATED_AT,
  })
  @IsOptional()
  @IsEnum(AdminOrderSortBy)
  sort?: AdminOrderSortBy = AdminOrderSortBy.CREATED_AT;

  @ApiPropertyOptional({
    description: 'Sort direction',
    enum: SortDirection,
    default: SortDirection.DESC,
  })
  @IsOptional()
  @IsEnum(SortDirection)
  direction?: SortDirection = SortDirection.DESC;

  @ApiPropertyOptional({
    description: 'Search by order number or customer name/phone',
    example: 'ORD-2026',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter by customer user ID',
    example: '507f1f77bcf86cd799439011',
  })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({
    description: 'Filter by assigned rider profile ID',
    example: '507f1f77bcf86cd799439012',
  })
  @IsOptional()
  @IsString()
  riderId?: string;
}

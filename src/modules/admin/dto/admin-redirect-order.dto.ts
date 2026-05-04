import { IsString, IsNotEmpty, IsOptional, IsMongoId } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AdminRedirectOrderDto {
  @ApiProperty({ description: 'Target pickup location ID to redirect the order to' })
  @IsMongoId()
  @IsNotEmpty()
  targetPickupLocationId: string;

  @ApiProperty({ description: 'Optional reason for redirecting the order', required: false })
  @IsString()
  @IsOptional()
  reason?: string;
}

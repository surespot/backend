import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsMongoId,
  IsEnum,
  IsNumber,
  ValidateNested,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DeliveryType } from '../schemas/order.schema';

class InlineDeliveryAddressDto {
  @ApiProperty({
    description: 'Full address string',
    example: "Crown's road, Ojo, Lagos",
  })
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiPropertyOptional({
    description: 'Street address',
    example: "Crown's road",
  })
  @IsString()
  @IsOptional()
  street?: string;

  @ApiPropertyOptional({
    description: 'City',
    example: 'Lagos',
  })
  @IsString()
  @IsOptional()
  city?: string;

  @ApiPropertyOptional({
    description: 'State',
    example: 'Lagos',
  })
  @IsString()
  @IsOptional()
  state?: string;

  @ApiPropertyOptional({
    description: 'Country',
    example: 'Nigeria',
    default: 'Nigeria',
  })
  @IsString()
  @IsOptional()
  country?: string;

  @ApiPropertyOptional({
    description: 'Latitude coordinate',
    example: 6.5244,
  })
  @IsNumber()
  @IsOptional()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({
    description: 'Longitude coordinate',
    example: 3.3792,
  })
  @IsNumber()
  @IsOptional()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @ApiPropertyOptional({
    description: 'Delivery instructions',
    example: 'Please call when you arrive',
  })
  @IsString()
  @IsOptional()
  instructions?: string;

  @ApiPropertyOptional({
    description: 'Contact phone number',
    example: '+2348012345678',
  })
  @IsString()
  @IsOptional()
  contactPhone?: string;
}

export class ValidateCheckoutDto {
  @ApiProperty({
    description: 'Delivery type',
    enum: DeliveryType,
    example: DeliveryType.DOOR_DELIVERY,
  })
  @IsEnum(DeliveryType)
  @IsNotEmpty()
  deliveryType: DeliveryType;

  @ApiPropertyOptional({
    description: 'Saved location ID for delivery (for door-delivery)',
    example: '507f1f77bcf86cd799439017',
  })
  @IsMongoId()
  @IsOptional()
  deliveryAddressId?: string;

  @ApiPropertyOptional({
    description: 'Inline delivery address (alternative to deliveryAddressId)',
    type: InlineDeliveryAddressDto,
  })
  @ValidateNested()
  @Type(() => InlineDeliveryAddressDto)
  @IsOptional()
  deliveryAddress?: InlineDeliveryAddressDto;

  @ApiPropertyOptional({
    description: 'Pickup location ID (for pickup)',
    example: '507f1f77bcf86cd799439018',
  })
  @IsMongoId()
  @IsOptional()
  pickupLocationId?: string;

  @ApiPropertyOptional({
    description: 'Promo code to apply',
    example: 'TGIF224',
  })
  @IsString()
  @IsOptional()
  promoCode?: string;
}

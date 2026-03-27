import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsMongoId,
} from 'class-validator';

export enum NewsletterAudience {
  RIDERS = 'riders',
  CUSTOMERS = 'customers',
  PICKUP_LOCATIONS = 'pickup-locations',
  REGIONS = 'regions',
}

export class SendNewsletterDto {
  @ApiProperty({
    enum: NewsletterAudience,
    description:
      'Audience: riders (all), customers (all), pickup-locations (customers who ordered from a pickup location), regions (riders in a region)',
  })
  @IsEnum(NewsletterAudience)
  audience: NewsletterAudience;

  @ApiPropertyOptional({
    description:
      'Required for pickup-locations: ID of the pickup location. Recipients = customers who have ordered from this location.',
  })
  @IsOptional()
  @IsMongoId()
  pickupLocationId?: string;

  @ApiPropertyOptional({
    description:
      'Required for regions: ID of the region. Recipients = riders in this region.',
  })
  @IsOptional()
  @IsMongoId()
  regionId?: string;

  @ApiProperty({ example: 'New Menu Items This Week!' })
  @IsString()
  @IsNotEmpty()
  subject: string;

  @ApiProperty({
    example: '<p>We have added exciting new dishes to our menu. Check them out!</p>',
    description: 'HTML body content (after the greeting).',
  })
  @IsString()
  @IsNotEmpty()
  body: string;
}

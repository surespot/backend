import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsArray,
  IsOptional,
  IsMongoId,
} from 'class-validator';
import { NewsletterAudienceType } from '../schemas/newsletter.schema';

export class CreateNewsletterDto {
  @ApiProperty({
    description: 'Email subject',
    example: 'Exclusive Offers This Week',
  })
  @IsString()
  @IsNotEmpty()
  subject: string;

  @ApiProperty({
    description: 'Email body (HTML)',
    example: '<p>Check out our <strong>new menu items</strong>!</p>',
  })
  @IsString()
  @IsNotEmpty()
  body: string;

  @ApiProperty({
    description: 'Target audience type',
    enum: NewsletterAudienceType,
    example: NewsletterAudienceType.ALL_CUSTOMERS,
  })
  @IsEnum(NewsletterAudienceType)
  audience: NewsletterAudienceType;

  @ApiPropertyOptional({
    description: 'Pickup location IDs (for pickup-locations audience)',
    type: [String],
    example: ['507f1f77bcf86cd799439011'],
  })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  targetPickupLocationIds?: string[];

  @ApiPropertyOptional({
    description: 'Region IDs (for regions audience)',
    type: [String],
    example: ['507f1f77bcf86cd799439012'],
  })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  targetRegionIds?: string[];
}

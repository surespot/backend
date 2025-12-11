import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import type { PromotionStatus } from '../types';

export class CreatePromotionDto {
  @ApiProperty({
    example: 'Black Friday Mega Sale',
    description: 'Human-readable name of the promotion',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    example: '2025-11-28T00:00:00.000Z',
    description: 'Start date/time of the promotion (ISO-8601)',
  })
  @IsDateString()
  activeFrom: string;

  @ApiProperty({
    example: '2025-11-29T00:00:00.000Z',
    description: 'End date/time of the promotion (ISO-8601)',
  })
  @IsDateString()
  activeTo: string;

  @ApiProperty({
    example: 'https://surespot.app/promotions/black-friday',
    description: 'Link to navigate when the banner is tapped, can be deeplink or url',
  })
  @IsString()
  @IsNotEmpty()
  linkTo: string;

  @ApiPropertyOptional({
    example: 'BF2025',
    description: 'Optional discount code displayed on the banner',
  })
  @IsOptional()
  @IsString()
  discountCode?: string;

  @ApiPropertyOptional({
    enum: ['inactive', 'active', 'ended'],
    description:
      'Initial status of the promotion. Defaults to inactive if omitted.',
  })
  @IsOptional()
  @IsEnum(['inactive', 'active', 'ended'])
  status?: PromotionStatus;
}

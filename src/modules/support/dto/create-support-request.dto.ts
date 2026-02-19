import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsMongoId,
  IsEnum,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { SupportRequestSource } from '../schemas/support-request.schema';

/** Transform empty string to undefined for optional multipart form fields */
const emptyToUndefined = ({ value }: { value: unknown }) =>
  value === '' || value === undefined ? undefined : value;

export class CreateSupportRequestDto {
  @ApiProperty({
    description: 'Source of the support request',
    enum: SupportRequestSource,
  })
  @IsEnum(SupportRequestSource)
  source: SupportRequestSource;

  @ApiProperty({
    description: 'Category (e.g. order_disputes, delivery_problems, bug, account_verification)',
    example: 'order_disputes',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  category: string;

  @ApiProperty({
    description: 'Complaint/sub-type (e.g. order_cancelled, missing_items)',
    example: 'order_cancelled',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  type: string;

  @ApiPropertyOptional({
    description: 'Order ID when the complaint is order-related',
    example: '507f1f77bcf86cd799439011',
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsMongoId()
  orderId?: string;

  @ApiPropertyOptional({
    description: 'Short title (used for bug reports)',
    example: 'App crashes on checkout',
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiProperty({
    description: 'Detailed description of the issue',
    example: 'I ordered the economy pack and the order got cancelled without any explanation.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  description: string;

  @ApiProperty({
    description: 'Contact phone number for follow-up',
    example: '09123478220',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  contactPhone: string;

  @ApiPropertyOptional({
    description: 'Steps to reproduce (for bug reports)',
    example: '1. Open app\n2. Go to checkout\n3. Tap pay',
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(1000)
  stepsToReproduce?: string;

  @ApiPropertyOptional({
    description: 'App area affected (for bug reports)',
    example: 'Checkout',
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(100)
  areaAffected?: string;

  @ApiPropertyOptional({
    description: 'Issue type for bugs (e.g. app_crash, feature_not_working)',
    example: 'app_crash',
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(50)
  issueType?: string;
}

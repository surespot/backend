import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNumber,
  Min,
  Max,
  MaxLength,
  IsNotEmpty,
  Matches,
  Length,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class MarkOrderDeliveredDto {
  @ApiProperty({
    description: '4-digit delivery confirmation code provided by customer',
    example: '1234',
    pattern: '^[0-9]{4}$',
  })
  @Transform(({ value }) => (value != null ? String(value).trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'confirmationCode is required' })
  @Length(4, 4, { message: 'confirmationCode must be exactly 4 digits' })
  @Matches(/^[0-9]{4}$/, {
    message: 'confirmationCode must be exactly 4 digits',
  })
  confirmationCode: string;

  @ApiPropertyOptional({
    description: 'Optional delivery message',
    example: 'Order delivered successfully',
    maxLength: 500,
  })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  message?: string;

  @ApiPropertyOptional({
    description: 'Latitude coordinate at delivery location',
    example: 6.5244,
    minimum: -90,
    maximum: 90,
  })
  @IsNumber()
  @IsOptional()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({
    description: 'Longitude coordinate at delivery location',
    example: 3.3792,
    minimum: -180,
    maximum: 180,
  })
  @IsNumber()
  @IsOptional()
  @Min(-180)
  @Max(180)
  longitude?: number;
}

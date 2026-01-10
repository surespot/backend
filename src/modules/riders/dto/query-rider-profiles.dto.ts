import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsEnum,
  IsMongoId,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RiderStatus } from '../schemas/rider-profile.schema';

export class QueryRiderProfilesDto {
  @ApiPropertyOptional({
    description: 'Filter by rider status',
    enum: RiderStatus,
    example: RiderStatus.PENDING,
  })
  @IsOptional()
  @IsEnum(RiderStatus)
  status?: RiderStatus;

  @ApiPropertyOptional({
    description: 'Filter by region ID',
    example: '507f1f77bcf86cd799439011',
  })
  @IsOptional()
  @IsMongoId()
  regionId?: string;

  @ApiPropertyOptional({
    description: 'Page number (1-indexed)',
    example: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Number of items per page',
    example: 20,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

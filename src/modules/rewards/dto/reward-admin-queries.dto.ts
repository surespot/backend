import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { RewardGrantStatus } from '../schemas/reward-grant.schema';

export class GetRewardGrantsDto {
  @ApiPropertyOptional({ enum: RewardGrantStatus })
  @IsOptional()
  @IsEnum(RewardGrantStatus)
  status?: RewardGrantStatus;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class RevokeRewardDto {
  @ApiPropertyOptional({ example: 'Review was not genuine' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

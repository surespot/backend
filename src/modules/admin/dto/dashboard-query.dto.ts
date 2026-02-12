import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export enum DashboardPeriod {
  TODAY = 'today',
  SEVEN_DAYS = '7d',
  THIRTY_DAYS = '30d',
}

export class DashboardQueryDto {
  @ApiProperty({
    example: 'today',
    description:
      'Time period for dashboard data. Defaults to "today" if not provided.',
    enum: DashboardPeriod,
    required: false,
  })
  @IsOptional()
  @IsEnum(DashboardPeriod)
  period?: DashboardPeriod;

  @ApiProperty({
    example: '2026-02-01',
    description:
      'Custom start date (YYYY-MM-DD). Overrides period if provided with "to".',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'from date must be in YYYY-MM-DD format',
  })
  from?: string;

  @ApiProperty({
    example: '2026-02-10',
    description:
      'Custom end date (YYYY-MM-DD). Overrides period if provided with "from".',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'to date must be in YYYY-MM-DD format',
  })
  to?: string;
}

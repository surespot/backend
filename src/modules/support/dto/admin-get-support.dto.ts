import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsEnum, IsArray, IsNumber, Min, Max } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { SubmitterRole, SupportRequestStatus } from '../schemas/support-request.schema';

export class AdminGetSupportDto {
  @ApiPropertyOptional({
    description: 'Page number (1-indexed)',
    example: 1,
    minimum: 1,
    default: 1,
  })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Number of items per page',
    example: 20,
    minimum: 1,
    maximum: 100,
    default: 20,
  })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Filter by submitter role (customers vs riders)',
    enum: SubmitterRole,
  })
  @IsOptional()
  @IsEnum(SubmitterRole)
  submitterRole?: SubmitterRole;

  @ApiPropertyOptional({
    description: 'Filter by status (comma-separated for multiple, e.g. status=pending,in_progress)',
    example: 'pending,in_progress',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value == null || value === '') return undefined;
    const str = typeof value === 'string' ? value : String(value);
    return str.split(',').map((s) => s.trim()).filter(Boolean);
  })
  @IsArray()
  @IsEnum(SupportRequestStatus, { each: true })
  status?: SupportRequestStatus[];
}

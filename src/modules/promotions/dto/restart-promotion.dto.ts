import { ApiProperty } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';

export class RestartPromotionDto {
  @ApiProperty({
    example: '2026-03-01T00:00:00.000Z',
    description: 'New start date/time (ISO-8601)',
  })
  @IsDateString()
  activeFrom: string;

  @ApiProperty({
    example: '2026-03-31T23:59:59.000Z',
    description: 'New end date/time (ISO-8601)',
  })
  @IsDateString()
  activeTo: string;
}

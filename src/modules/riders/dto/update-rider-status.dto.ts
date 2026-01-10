import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { RiderStatus } from '../schemas/rider-profile.schema';

export class UpdateRiderStatusDto {
  @ApiProperty({
    description: 'New status for the rider profile',
    enum: RiderStatus,
    example: RiderStatus.ACTIVE,
  })
  @IsEnum(RiderStatus)
  status: RiderStatus;
}

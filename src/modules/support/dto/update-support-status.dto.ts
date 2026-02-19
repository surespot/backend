import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { SupportRequestStatus } from '../schemas/support-request.schema';

export class UpdateSupportStatusDto {
  @ApiProperty({
    description: 'New status for the support request',
    enum: SupportRequestStatus,
  })
  @IsEnum(SupportRequestStatus)
  status: SupportRequestStatus;
}

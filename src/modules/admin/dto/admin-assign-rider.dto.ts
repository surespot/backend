import { IsMongoId } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AdminAssignRiderDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011', description: 'Rider profile ID to assign' })
  @IsMongoId()
  riderProfileId: string;
}

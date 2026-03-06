import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId, IsNotEmpty } from 'class-validator';

export class AssignPickupLocationSelfDto {
  @ApiProperty({
    example: '507f1f77bcf86cd799439011',
    description: 'ID of the unlinked pickup location to assign to yourself',
  })
  @IsMongoId()
  @IsNotEmpty()
  pickupLocationId: string;
}

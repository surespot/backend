import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GeocodeDto {
  @ApiProperty({ example: '123 Broad Street, Lagos Island, Lagos' })
  @IsString()
  @IsNotEmpty()
  address: string;
}

import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min, Max } from 'class-validator';

export class JoinWaitlistDto {
  @ApiProperty({ example: 6.5244 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;

  @ApiProperty({ example: 3.3792 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;
}

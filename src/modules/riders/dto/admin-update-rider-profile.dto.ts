import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsDateString,
  IsMongoId,
  IsPhoneNumber,
  IsEnum,
} from 'class-validator';
import { VehicleType } from '../schemas/rider-profile.schema';

export class AdminUpdateRiderProfileDto {
  @ApiPropertyOptional({ example: 'John' })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({ example: 'Doe' })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({ example: '+2348012345678' })
  @IsOptional()
  @IsPhoneNumber()
  phone?: string;

  @ApiPropertyOptional({ example: '1990-05-15' })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ example: '507f1f77bcf86cd799439011' })
  @IsOptional()
  @IsMongoId()
  regionId?: string;

  @ApiPropertyOptional({ enum: VehicleType, example: VehicleType.MOTORCYCLE })
  @IsOptional()
  @IsEnum(VehicleType)
  vehicleType?: VehicleType;
}

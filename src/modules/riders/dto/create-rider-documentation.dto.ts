import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsMongoId,
  ValidateNested,
  IsPhoneNumber,
} from 'class-validator';
import { Type } from 'class-transformer';

export class DocumentInfoDto {
  @ApiProperty({
    description: 'Name/label of the document',
    example: 'Government ID',
  })
  @IsString()
  name: string;

  @ApiPropertyOptional({
    description: 'URL of the uploaded document',
    example:
      'https://res.cloudinary.com/surespot/image/upload/v1234567890/document.jpg',
  })
  @IsOptional()
  @IsString()
  url?: string;
}

export class EmergencyContactDto {
  @ApiProperty({
    description: 'Name of the emergency contact',
    example: 'Jane Doe',
  })
  @IsString()
  name: string;

  @ApiProperty({
    description: 'Phone number of the emergency contact',
    example: '+2348087654321',
  })
  @IsString()
  @IsPhoneNumber()
  phone: string;

  @ApiPropertyOptional({
    description: 'Relationship to the rider',
    example: 'Spouse',
  })
  @IsOptional()
  @IsString()
  relationship?: string;
}

export class CreateRiderDocumentationDto {
  @ApiProperty({
    description: 'ID of the rider profile',
    example: '507f1f77bcf86cd799439011',
  })
  @IsMongoId()
  riderProfileId: string;

  @ApiPropertyOptional({
    description: 'Government-issued ID document',
    type: DocumentInfoDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => DocumentInfoDto)
  governmentId?: DocumentInfoDto;

  @ApiPropertyOptional({
    description: 'Proof of address document',
    type: DocumentInfoDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => DocumentInfoDto)
  proofOfAddress?: DocumentInfoDto;

  @ApiPropertyOptional({
    description: 'Passport-style photograph',
    type: DocumentInfoDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => DocumentInfoDto)
  passportPhotograph?: DocumentInfoDto;

  @ApiPropertyOptional({
    description: 'Bank account details document',
    type: DocumentInfoDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => DocumentInfoDto)
  bankAccountDetails?: DocumentInfoDto;

  @ApiPropertyOptional({
    description: 'Vehicle documentation',
    type: DocumentInfoDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => DocumentInfoDto)
  vehicleDocumentation?: DocumentInfoDto;

  @ApiPropertyOptional({
    description: 'Emergency contact information',
    type: EmergencyContactDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => EmergencyContactDto)
  emergencyContact?: EmergencyContactDto;
}

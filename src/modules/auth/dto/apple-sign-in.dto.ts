import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsObject,
  ValidateNested,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';

class FullNameDto {
  @ApiProperty({ example: 'John', required: false })
  @IsOptional()
  @IsString()
  givenName?: string;

  @ApiProperty({ example: 'Doe', required: false })
  @IsOptional()
  @IsString()
  familyName?: string;
}

export class AppleSignInDto {
  @ApiProperty({
    description:
      'Identity token from Apple Sign In (expo-apple-authentication)',
    example: 'eyJraWQiOiJlWGF1bm1MIiwiYWxnIjoiUlMyNTYifQ...',
  })
  @IsString()
  @IsNotEmpty()
  identityToken: string;

  @ApiProperty({
    description:
      'Full name from Apple. Only provided on first sign-in; send when available.',
    required: false,
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => FullNameDto)
  fullName?: { givenName?: string; familyName?: string };
}

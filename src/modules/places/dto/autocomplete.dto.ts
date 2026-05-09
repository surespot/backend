import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AutocompleteDto {
  @ApiProperty({ example: '12 Lagos Island' })
  @IsString()
  @IsNotEmpty()
  input: string;
}

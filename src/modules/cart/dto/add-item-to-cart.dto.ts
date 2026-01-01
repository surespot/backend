import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsMongoId,
  IsArray,
  ValidateNested,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

class CartExtraDto {
  @ApiProperty({
    description: 'Food extra ID',
    example: '507f1f77bcf86cd799439012',
  })
  @IsMongoId()
  @IsNotEmpty()
  foodExtraId: string;

  @ApiPropertyOptional({
    description: 'Quantity of this extra (default: 1)',
    example: 1,
    minimum: 1,
    default: 1,
  })
  @IsNumber()
  @IsOptional()
  @Min(1)
  quantity?: number;
}

export class AddItemToCartDto {
  @ApiProperty({
    description: 'Food item ID to add to cart',
    example: '507f1f77bcf86cd799439011',
  })
  @IsMongoId()
  @IsNotEmpty()
  foodItemId: string;

  @ApiPropertyOptional({
    description: 'Quantity to add (default: 1)',
    example: 1,
    minimum: 1,
    maximum: 99,
    default: 1,
  })
  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(99)
  quantity?: number;

  @ApiPropertyOptional({
    description: 'Array of extras to add with this item',
    type: [CartExtraDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CartExtraDto)
  @IsOptional()
  extras?: CartExtraDto[];
}

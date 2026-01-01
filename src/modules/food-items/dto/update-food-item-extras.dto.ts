import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString, IsNotEmpty, ArrayMinSize } from 'class-validator';

export class UpdateFoodItemExtrasDto {
  @ApiProperty({
    description:
      'Array of extra IDs (ObjectId strings) to link to the food item',
    type: [String],
    example: ['507f1f77bcf86cd799439012', '507f1f77bcf86cd799439013'],
  })
  @IsArray()
  @ArrayMinSize(0)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  extras: string[];
}

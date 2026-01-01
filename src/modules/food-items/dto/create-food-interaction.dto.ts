import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';
import { InteractionType } from '../schemas/food-interaction.schema';

export class CreateFoodInteractionDto {
  @ApiProperty({
    description: 'Interaction type',
    enum: InteractionType,
    example: InteractionType.LIKE,
  })
  @IsNotEmpty()
  @IsEnum(InteractionType)
  interactionType: InteractionType;
}

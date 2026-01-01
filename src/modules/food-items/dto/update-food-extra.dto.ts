import { PartialType } from '@nestjs/swagger';
import { CreateFoodExtraDto } from './create-food-extra.dto';

export class UpdateFoodExtraDto extends PartialType(CreateFoodExtraDto) {}

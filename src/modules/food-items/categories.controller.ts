import {
  Controller,
  Get,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { FoodItemsService } from './food-items.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Transform } from 'class-transformer';
import { IsOptional, IsBoolean } from 'class-validator';

class GetCategoriesQueryDto {
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  includeCount?: boolean = false;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  includeImage?: boolean = false;
}

@ApiTags('categories')
@Controller('categories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class CategoriesController {
  constructor(private readonly foodItemsService: FoodItemsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all food categories' })
  @ApiQuery({
    name: 'includeCount',
    required: false,
    type: Boolean,
    description: 'Include item count per category',
    example: false,
  })
  @ApiQuery({
    name: 'includeImage',
    required: false,
    type: Boolean,
    description: 'Include category image URL',
    example: false,
  })
  @ApiResponse({
    status: 200,
    description: 'Categories retrieved successfully',
    schema: {
      example: {
        success: true,
        data: {
          categories: [
            {
              name: 'Food',
              slug: 'food',
              displayName: 'Food',
              description: 'Main dishes and meals',
              imageUrl: 'https://cdn.surespot.app/categories/food.png',
              itemCount: 25,
              sortOrder: 1,
            },
            {
              name: 'Protein',
              slug: 'protein',
              displayName: 'Protein',
              description: 'Protein-rich dishes',
              imageUrl: 'https://cdn.surespot.app/categories/protein.png',
              itemCount: 15,
              sortOrder: 2,
            },
            {
              name: 'Side Meal',
              slug: 'side-meal',
              displayName: 'Side Meal',
              description: 'Side dishes and accompaniments',
              imageUrl: 'https://cdn.surespot.app/categories/sidemeal.png',
              itemCount: 12,
              sortOrder: 3,
            },
            {
              name: 'Drinks',
              slug: 'drinks',
              displayName: 'Drinks',
              description: 'Beverages and drinks',
              imageUrl: 'https://cdn.surespot.app/categories/drinks.png',
              itemCount: 18,
              sortOrder: 4,
            },
            {
              name: 'Economy',
              slug: 'economy',
              displayName: 'Economy',
              description: 'Budget-friendly options',
              imageUrl: 'https://cdn.surespot.app/categories/economy.png',
              itemCount: 20,
              sortOrder: 5,
            },
          ],
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
  })
  async getCategories(@Query() query: GetCategoriesQueryDto) {
    const { includeCount = false, includeImage = false } = query;
    return this.foodItemsService.getCategories(includeCount, includeImage);
  }
}

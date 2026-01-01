import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { FoodItemsService } from './food-items.service';
import { CreateFoodExtraDto } from './dto/create-food-extra.dto';
import { UpdateFoodExtraDto } from './dto/update-food-extra.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/schemas/user.schema';

@ApiTags('food-extras')
@Controller('food-extras')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class FoodExtrasController {
  constructor(private readonly foodItemsService: FoodItemsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Create a new food extra (Admin only)' })
  @ApiResponse({
    status: 201,
    description: 'Food extra created successfully',
    schema: {
      example: {
        success: true,
        message: 'Food extra created successfully',
        data: {
          id: '507f1f77bcf86cd799439012',
          name: 'Extra chicken',
          description: 'Additional grilled chicken pieces',
          price: 50000,
          formattedPrice: '₦500',
          currency: 'NGN',
          isAvailable: true,
          category: 'Protein',
        },
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  async create(@Body() dto: CreateFoodExtraDto) {
    return this.foodItemsService.createExtra(dto);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all food extras' })
  @ApiResponse({
    status: 200,
    description: 'Food extras retrieved successfully',
    schema: {
      example: {
        success: true,
        data: {
          extras: [
            {
              id: '507f1f77bcf86cd799439012',
              name: 'Extra chicken',
              description: 'Additional grilled chicken pieces',
              price: 50000,
              formattedPrice: '₦500',
              currency: 'NGN',
              isAvailable: true,
              category: 'Protein',
            },
            {
              id: '507f1f77bcf86cd799439013',
              name: 'Extra sauce',
              description: 'Additional spicy sauce',
              price: 0,
              formattedPrice: 'Free',
              currency: 'NGN',
              isAvailable: true,
              category: 'Sauce',
            },
          ],
        },
      },
    },
  })
  async findAll() {
    return this.foodItemsService.findAllExtras();
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get food extra by ID' })
  @ApiParam({
    name: 'id',
    description: 'Food extra ID',
    example: '507f1f77bcf86cd799439012',
  })
  @ApiResponse({
    status: 200,
    description: 'Food extra retrieved successfully',
    schema: {
      example: {
        success: true,
        data: {
          id: '507f1f77bcf86cd799439012',
          name: 'Extra chicken',
          description: 'Additional grilled chicken pieces',
          price: 50000,
          formattedPrice: '₦500',
          currency: 'NGN',
          isAvailable: true,
          category: 'Protein',
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Food extra not found',
  })
  async findOne(@Param('id') id: string) {
    return this.foodItemsService.findExtraById(id);
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update a food extra (Admin only)' })
  @ApiParam({
    name: 'id',
    description: 'Food extra ID',
    example: '507f1f77bcf86cd799439012',
  })
  @ApiResponse({
    status: 200,
    description: 'Food extra updated successfully',
    schema: {
      example: {
        success: true,
        message: 'Food extra updated successfully',
        data: {
          id: '507f1f77bcf86cd799439012',
          name: 'Extra chicken (Large)',
          price: 60000,
          formattedPrice: '₦600',
          currency: 'NGN',
          isAvailable: true,
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Food extra not found',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  async update(@Param('id') id: string, @Body() dto: UpdateFoodExtraDto) {
    return this.foodItemsService.updateExtra(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Delete a food extra (Admin only)' })
  @ApiParam({
    name: 'id',
    description: 'Food extra ID',
    example: '507f1f77bcf86cd799439012',
  })
  @ApiResponse({
    status: 200,
    description: 'Food extra deleted successfully',
    schema: {
      example: {
        success: true,
        message: 'Food extra deleted successfully',
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Food extra not found',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  async delete(@Param('id') id: string) {
    return this.foodItemsService.deleteExtra(id);
  }
}

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { FoodItemsService } from './food-items.service';
import { GetFoodItemsFilterDto } from './dto/get-food-items-filter.dto';
import { SearchFoodItemsDto } from './dto/search-food-items.dto';
import { CreateFoodItemDto } from './dto/create-food-item.dto';
import { UpdateFoodItemDto } from './dto/update-food-item.dto';
import { UpdateFoodItemExtrasDto } from './dto/update-food-item-extras.dto';
import { CreateFoodInteractionDto } from './dto/create-food-interaction.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/schemas/user.schema';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Transform } from 'class-transformer';
import { IsOptional, IsBoolean, IsInt, Min, Max } from 'class-validator';

class ProductDetailsQueryDto {
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  includeExtras?: boolean = true;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  includeRelated?: boolean = true;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  relatedLimit?: number = 3;
}

class GetLikedFoodItemsDto {
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;
}

class GetViewedFoodItemsDto {
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;
}

@ApiTags('food-items')
@Controller('food-items')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class FoodItemsController {
  constructor(private readonly foodItemsService: FoodItemsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get all food items with filtering and pagination',
  })
  @ApiResponse({
    status: 200,
    description: 'Food items retrieved successfully',
    schema: {
      example: {
        success: true,
        data: {
          items: [
            {
              id: '507f1f77bcf86cd799439011',
              name: 'Jollof Rice',
              description:
                'Smoky jollof with grilled chicken wing spiced with local spices.',
              slug: 'jollof-rice',
              price: 150000,
              formattedPrice: '₦1,500',
              currency: 'NGN',
              imageUrl: 'https://cdn.surespot.app/images/jollof-rice.jpg',
              imageUrls: ['https://cdn.surespot.app/images/jollof-rice-2.jpg'],
              category: 'Food',
              tags: ['RICE', 'CHICKEN', 'JOLLOF', 'SPICY'],
              averageRating: 4.8,
              ratingCount: 245,
              estimatedTime: { min: 20, max: 25 },
              eta: '20-25 mins',
              isAvailable: true,
              isActive: true,
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
              ],
              viewCount: 1250,
              orderCount: 89,
              isPopular: true,
              createdAt: '2024-01-15T10:00:00.000Z',
              updatedAt: '2024-01-20T14:30:00.000Z',
            },
          ],
          pagination: {
            page: 1,
            limit: 20,
            total: 45,
            totalPages: 3,
            hasNext: true,
            hasPrev: false,
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
  })
  async findAll(
    @Query() filter: GetFoodItemsFilterDto,
    @CurrentUser() user?: { id: string },
  ) {
    return this.foodItemsService.findAll(filter, user?.id);
  }

  @Get('search')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Search food items with advanced filtering' })
  @ApiResponse({
    status: 200,
    description: 'Search results retrieved successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
  })
  async search(
    @Query() searchDto: SearchFoodItemsDto,
    @CurrentUser() user?: { id: string },
  ) {
    return this.foodItemsService.search(searchDto, user?.id);
  }

  @Get('liked')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get all liked food items for the authenticated user',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (1-indexed)',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (max: 50)',
    example: 20,
  })
  @ApiResponse({
    status: 200,
    description: 'Liked food items retrieved successfully',
    schema: {
      example: {
        success: true,
        data: {
          items: [
            {
              id: '507f1f77bcf86cd799439011',
              name: 'Jollof Rice',
              description: 'Smoky jollof with grilled chicken wing...',
              slug: 'jollof-rice',
              price: 150000,
              formattedPrice: '₦1,500',
              currency: 'NGN',
              imageUrl: 'https://cdn.surespot.app/images/jollof-rice.jpg',
              category: 'Food',
              tags: ['RICE', 'CHICKEN', 'JOLLOF'],
              averageRating: 4.8,
              ratingCount: 245,
              estimatedTime: { min: 20, max: 25 },
              eta: '20-25 mins',
              isAvailable: true,
              userInteractions: {
                isViewed: true,
                isLiked: true,
              },
            },
          ],
          pagination: {
            page: 1,
            limit: 20,
            total: 5,
            totalPages: 1,
            hasNext: false,
            hasPrev: false,
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
  })
  async getLikedFoodItems(
    @Query() query: GetLikedFoodItemsDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.foodItemsService.getLikedFoodItems(
      user.id,
      query.page || 1,
      query.limit || 20,
    );
  }

  @Get('viewed')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get recently viewed food items for the authenticated user',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (1-indexed)',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (max: 50)',
    example: 20,
  })
  @ApiResponse({
    status: 200,
    description: 'Recently viewed food items retrieved successfully',
    schema: {
      example: {
        success: true,
        data: {
          items: [
            {
              id: '507f1f77bcf86cd799439011',
              name: 'Jollof Rice',
              description: 'Smoky jollof with grilled chicken wing...',
              slug: 'jollof-rice',
              price: 150000,
              formattedPrice: '₦1,500',
              currency: 'NGN',
              imageUrl: 'https://cdn.surespot.app/images/jollof-rice.jpg',
              category: 'Food',
              tags: ['RICE', 'CHICKEN', 'JOLLOF'],
              averageRating: 4.8,
              ratingCount: 245,
              estimatedTime: { min: 20, max: 25 },
              eta: '20-25 mins',
              isAvailable: true,
              userInteractions: {
                isViewed: true,
                isLiked: false,
              },
            },
          ],
          pagination: {
            page: 1,
            limit: 20,
            total: 15,
            totalPages: 1,
            hasNext: false,
            hasPrev: false,
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
  })
  async getViewedFoodItems(
    @Query() query: GetViewedFoodItemsDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.foodItemsService.getViewedFoodItems(
      user.id,
      query.page || 1,
      query.limit || 20,
    );
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get food item details by ID or slug' })
  @ApiParam({
    name: 'id',
    description: 'Food item ID (MongoDB ObjectId) or slug',
    example: '507f1f77bcf86cd799439011',
  })
  @ApiQuery({
    name: 'includeExtras',
    required: false,
    type: Boolean,
    description: 'Include populated extras array',
    example: true,
  })
  @ApiQuery({
    name: 'includeRelated',
    required: false,
    type: Boolean,
    description: 'Include related items',
    example: true,
  })
  @ApiQuery({
    name: 'relatedLimit',
    required: false,
    type: Number,
    description: 'Number of related items to return',
    example: 3,
  })
  @ApiResponse({
    status: 200,
    description: 'Food item retrieved successfully',
    schema: {
      example: {
        success: true,
        data: {
          id: '507f1f77bcf86cd799439011',
          name: 'Jollof Rice',
          description:
            'Smoky jollof with grilled chicken wing spiced with local spices.',
          slug: 'jollof-rice',
          price: 150000,
          formattedPrice: '₦1,500',
          currency: 'NGN',
          imageUrl: 'https://cdn.surespot.app/images/jollof-rice.jpg',
          imageUrls: [
            'https://cdn.surespot.app/images/jollof-rice-2.jpg',
            'https://cdn.surespot.app/images/jollof-rice-3.jpg',
          ],
          category: 'Food',
          tags: ['RICE', 'CHICKEN', 'JOLLOF', 'SPICY'],
          averageRating: 4.8,
          ratingCount: 245,
          estimatedTime: { min: 20, max: 25 },
          eta: '20-25 mins',
          isAvailable: true,
          isActive: true,
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
          ],
          relatedItems: [
            {
              id: '507f1f77bcf86cd799439014',
              name: 'Fried Rice',
              description: 'Mixed vegetables fried rice with chicken',
              slug: 'fried-rice',
              price: 160000,
              formattedPrice: '₦1,600',
              currency: 'NGN',
              imageUrl: 'https://cdn.surespot.app/images/fried-rice.jpg',
              category: 'Food',
              tags: ['RICE', 'CHICKEN', 'VEGETABLES'],
              averageRating: 4.7,
              ratingCount: 189,
              estimatedTime: { min: 20, max: 25 },
              eta: '20-25 mins',
              isAvailable: true,
            },
          ],
          viewCount: 1250,
          orderCount: 89,
          isPopular: true,
          createdAt: '2024-01-15T10:00:00.000Z',
          updatedAt: '2024-01-20T14:30:00.000Z',
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Food item not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
  })
  async findOne(
    @Param('id') id: string,
    @Query() query: ProductDetailsQueryDto,
    @CurrentUser() user?: { id: string },
  ) {
    const {
      includeExtras = true,
      includeRelated = true,
      relatedLimit = 3,
    } = query;
    // Always populate extras when fetching a single item
    return this.foodItemsService.findOne(
      id,
      true, // Always include extras for single item fetch
      includeRelated,
      relatedLimit,
      user?.id,
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Create a new food item with image upload (Admin only)',
  })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('image'))
  @ApiBody({
    description: 'Food item details with image file',
    schema: {
      type: 'object',
      properties: {
        image: {
          type: 'string',
          format: 'binary',
          description:
            'Food item image file (JPEG, PNG, or WebP). Optional if imageUrl is provided.',
        },
        imageUrl: {
          type: 'string',
          example: 'https://cdn.surespot.app/images/jollof-rice.jpg',
          description: 'Main image URL. Optional if image file is provided.',
        },
        name: { type: 'string', example: 'Jollof Rice' },
        description: {
          type: 'string',
          example:
            'Smoky jollof with grilled chicken wing spiced with local spices.',
        },
        slug: { type: 'string', example: 'jollof-rice' },
        price: {
          type: 'string',
          example: '150000',
          description: 'Price in kobo (string)',
        },
        currency: { type: 'string', example: 'NGN', default: 'NGN' },
        imageUrls: {
          type: 'string',
          example:
            'https://example.com/image1.jpg,https://example.com/image2.jpg',
          description: 'Comma-separated additional image URLs',
        },
        category: {
          type: 'string',
          enum: ['Food', 'Protein', 'Side Meal', 'Drinks', 'Economy'],
          example: 'Food',
        },
        tags: {
          type: 'string',
          example: 'RICE,CHICKEN,JOLLOF,SPICY',
          description: 'Comma-separated tags',
        },
        'estimatedTime[min]': {
          type: 'string',
          example: '20',
          description: 'Minimum prep time in minutes (string)',
        },
        'estimatedTime[max]': {
          type: 'string',
          example: '25',
          description: 'Maximum prep time in minutes (string)',
        },
        isAvailable: {
          type: 'string',
          example: 'true',
          description: 'Boolean as string: "true" or "false"',
        },
        isActive: {
          type: 'string',
          example: 'true',
          description: 'Boolean as string: "true" or "false"',
        },
        extras: {
          type: 'string',
          example: '507f1f77bcf86cd799439012,507f1f77bcf86cd799439013',
          description: 'Comma-separated extra IDs',
        },
        isPopular: {
          type: 'string',
          example: 'false',
          description: 'Boolean as string: "true" or "false"',
        },
        sortOrder: {
          type: 'string',
          example: '0',
          description: 'Sort order as string',
        },
      },
      required: [
        'name',
        'description',
        'slug',
        'price',
        'category',
        'estimatedTime[min]',
        'estimatedTime[max]',
      ],
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Food item created successfully',
    schema: {
      example: {
        success: true,
        message: 'Food item created successfully',
        data: {
          id: '507f1f77bcf86cd799439011',
          name: 'Jollof Rice',
          slug: 'jollof-rice',
          price: 150000,
          formattedPrice: '₦1,500',
          currency: 'NGN',
          imageUrl:
            'https://res.cloudinary.com/surespot/image/upload/v1234567890/surespot/food-item.jpg',
          category: 'Food',
          isAvailable: true,
          isActive: true,
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Image required or invalid image type',
  })
  @ApiResponse({
    status: 409,
    description: 'Slug already exists',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  async create(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CreateFoodItemDto,
  ) {
    return this.foodItemsService.createWithImage(file, dto);
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update a food item (Admin only)' })
  @ApiParam({
    name: 'id',
    description: 'Food item ID',
    example: '507f1f77bcf86cd799439011',
  })
  @ApiResponse({
    status: 200,
    description: 'Food item updated successfully',
    schema: {
      example: {
        success: true,
        message: 'Food item updated successfully',
        data: {
          id: '507f1f77bcf86cd799439011',
          name: 'Jollof Rice (Updated)',
          slug: 'jollof-rice',
          price: 160000,
          formattedPrice: '₦1,600',
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Food item not found',
  })
  @ApiResponse({
    status: 409,
    description: 'Slug already exists',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  async update(@Param('id') id: string, @Body() dto: UpdateFoodItemDto) {
    return this.foodItemsService.update(id, dto);
  }

  @Put(':id/extras')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Link extras to a food item (Admin only)' })
  @ApiParam({
    name: 'id',
    description: 'Food item ID',
    example: '507f1f77bcf86cd799439011',
  })
  @ApiResponse({
    status: 200,
    description: 'Food item extras updated successfully',
    schema: {
      example: {
        success: true,
        message: 'Food item extras updated successfully',
        data: {
          id: '507f1f77bcf86cd799439011',
          name: 'Jollof Rice',
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
          ],
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Food item not found',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid extra IDs or extras not found',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  async updateExtras(
    @Param('id') id: string,
    @Body() dto: UpdateFoodItemExtrasDto,
  ) {
    return this.foodItemsService.updateExtras(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Delete a food item (Admin only)' })
  @ApiParam({
    name: 'id',
    description: 'Food item ID',
    example: '507f1f77bcf86cd799439011',
  })
  @ApiResponse({
    status: 200,
    description: 'Food item deleted successfully',
    schema: {
      example: {
        success: true,
        message: 'Food item deleted successfully',
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Food item not found',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  async delete(@Param('id') id: string) {
    return this.foodItemsService.delete(id);
  }

  @Post(':id/interactions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Toggle interaction (VIEW or LIKE) on a food item' })
  @ApiParam({
    name: 'id',
    description: 'Food item ID',
    example: '507f1f77bcf86cd799439011',
  })
  @ApiResponse({
    status: 200,
    description: 'Interaction toggled successfully',
    schema: {
      example: {
        success: true,
        message: 'Interaction created successfully',
        data: {
          foodItemId: '507f1f77bcf86cd799439011',
          interactionType: 'LIKE',
          isActive: true,
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Food item not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
  })
  async toggleInteraction(
    @Param('id') id: string,
    @Body() dto: CreateFoodInteractionDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.foodItemsService.toggleInteraction(id, user.id, dto);
  }
}

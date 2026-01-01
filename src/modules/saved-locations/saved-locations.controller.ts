import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { SavedLocationsService } from './saved-locations.service';
import { CreateSavedLocationDto } from './dto/create-saved-location.dto';
import { UpdateSavedLocationDto } from './dto/update-saved-location.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('saved-locations')
@Controller('saved-locations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class SavedLocationsController {
  constructor(private readonly savedLocationsService: SavedLocationsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new saved location' })
  @ApiResponse({
    status: 201,
    description: 'Location created successfully',
    schema: {
      example: {
        success: true,
        message: 'Location saved successfully',
        data: {
          id: '507f1f77bcf86cd799439011',
          userId: '507f1f77bcf86cd799439012',
          label: 'Home',
          streetAddress: '123 Main Street',
          latitude: 6.5244,
          longitude: 3.3792,
          state: 'Lagos',
          country: 'Nigeria',
          regionId: 'region_123',
          createdAt: '2025-11-27T22:00:00.000Z',
          updatedAt: '2025-11-27T22:00:00.000Z',
        },
      },
    },
  })
  @ApiResponse({
    status: 409,
    description: 'Location with this label already exists',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
  })
  async create(
    @CurrentUser() user: CurrentUser,
    @Body() dto: CreateSavedLocationDto,
  ) {
    return this.savedLocationsService.create(user.id, dto);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all saved locations for the current user' })
  @ApiResponse({
    status: 200,
    description: 'Locations retrieved successfully',
    schema: {
      example: {
        success: true,
        message: 'Locations retrieved successfully',
        data: {
          locations: [
            {
              id: '507f1f77bcf86cd799439011',
              userId: '507f1f77bcf86cd799439012',
              label: 'Home',
              streetAddress: '123 Main Street',
              latitude: 6.5244,
              longitude: 3.3792,
              state: 'Lagos',
              country: 'Nigeria',
              regionId: 'region_123',
              createdAt: '2025-11-27T22:00:00.000Z',
              updatedAt: '2025-11-27T22:00:00.000Z',
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
  async findAll(@CurrentUser() user: CurrentUser) {
    return this.savedLocationsService.findAll(user.id);
  }

  @Get('active')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get the active saved location for the current user',
  })
  @ApiResponse({
    status: 200,
    description: 'Active location retrieved successfully',
    schema: {
      example: {
        success: true,
        message: 'Active location retrieved successfully',
        data: {
          id: '507f1f77bcf86cd799439011',
          userId: '507f1f77bcf86cd799439012',
          label: 'Home',
          streetAddress: '123 Main Street',
          latitude: 6.5244,
          longitude: 3.3792,
          state: 'Lagos',
          country: 'Nigeria',
          regionId: 'region_123',
          isActive: true,
          createdAt: '2025-11-27T22:00:00.000Z',
          updatedAt: '2025-11-27T22:00:00.000Z',
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'No active location found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
  })
  async findActive(@CurrentUser() user: CurrentUser) {
    return this.savedLocationsService.findActive(user.id);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get a specific saved location by ID' })
  @ApiResponse({
    status: 200,
    description: 'Location retrieved successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Location not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
  })
  async findOne(@CurrentUser() user: CurrentUser, @Param('id') id: string) {
    return this.savedLocationsService.findOne(id, user.id);
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a saved location' })
  @ApiResponse({
    status: 200,
    description: 'Location updated successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Location not found',
  })
  @ApiResponse({
    status: 409,
    description: 'Location with this label already exists',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
  })
  async update(
    @CurrentUser() user: CurrentUser,
    @Param('id') id: string,
    @Body() dto: UpdateSavedLocationDto,
  ) {
    return this.savedLocationsService.update(id, user.id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a saved location' })
  @ApiResponse({
    status: 200,
    description: 'Location deleted successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Location not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
  })
  async delete(@CurrentUser() user: CurrentUser, @Param('id') id: string) {
    return this.savedLocationsService.delete(id, user.id);
  }
}

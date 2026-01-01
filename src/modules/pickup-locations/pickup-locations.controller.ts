import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
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
} from '@nestjs/swagger';
import { PickupLocationsService } from './pickup-locations.service';
import { CreatePickupLocationDto } from './dto/create-pickup-location.dto';
import { UpdatePickupLocationDto } from './dto/update-pickup-location.dto';
import { FindNearestPickupLocationDto } from './dto/find-nearest-pickup-location.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/schemas/user.schema';

@ApiTags('pickup-locations')
@Controller('pickup-locations')
export class PickupLocationsController {
  constructor(
    private readonly pickupLocationsService: PickupLocationsService,
  ) {}

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new pickup location (Admin only)' })
  @ApiResponse({
    status: 201,
    description: 'Pickup location created successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  async create(@Body() dto: CreatePickupLocationDto) {
    return this.pickupLocationsService.create(dto);
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all pickup locations (Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Pickup locations retrieved successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  async findAll() {
    return this.pickupLocationsService.findAll();
  }

  @Get('nearest')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Find nearest active pickup location (Public - requires coordinates)',
  })
  @ApiResponse({
    status: 200,
    description: 'Nearest pickup location retrieved successfully',
    schema: {
      example: {
        success: true,
        message: 'Nearest pickup location retrieved successfully',
        data: {
          id: '507f1f77bcf86cd799439011',
          name: 'Surespot, Iba, Ojo',
          address: '123 Main Street, Iba, Ojo, Lagos',
          latitude: 6.5244,
          longitude: 3.3792,
          regionId: '507f1f77bcf86cd799439012',
          regionName: 'Lagos Mainland',
          isActive: true,
          createdAt: '2024-01-15T10:00:00.000Z',
          updatedAt: '2024-01-15T10:00:00.000Z',
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'No active pickup location found nearby',
  })
  async findNearest(@Query() dto: FindNearestPickupLocationDto) {
    return this.pickupLocationsService.findNearest(dto);
  }

  @Get(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get a specific pickup location by ID (Admin only)',
  })
  @ApiResponse({
    status: 200,
    description: 'Pickup location retrieved successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Pickup location not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  async findOne(@Param('id') id: string) {
    return this.pickupLocationsService.findOne(id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a pickup location (Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Pickup location updated successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Pickup location not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  async update(@Param('id') id: string, @Body() dto: UpdatePickupLocationDto) {
    return this.pickupLocationsService.update(id, dto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a pickup location (Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Pickup location deleted successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Pickup location not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  async delete(@Param('id') id: string) {
    return this.pickupLocationsService.delete(id);
  }
}

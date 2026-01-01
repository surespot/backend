import {
  Controller,
  Get,
  Post,
  Patch,
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
import { RegionsService } from './regions.service';
import { CreateRegionDto } from './dto/create-region.dto';
import { UpdateRegionDto } from './dto/update-region.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/schemas/user.schema';

@ApiTags('regions')
@Controller('regions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class RegionsController {
  constructor(private readonly regionsService: RegionsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new region (Admin only)' })
  @ApiResponse({
    status: 201,
    description: 'Region created successfully',
    schema: {
      example: {
        success: true,
        message: 'Region created successfully',
        data: {
          id: '507f1f77bcf86cd799439011',
          name: 'Lagos Mainland',
          description:
            'Mainland region covering Lagos Island and surrounding areas',
          isActive: true,
          createdAt: '2024-01-15T10:00:00.000Z',
          updatedAt: '2024-01-15T10:00:00.000Z',
        },
      },
    },
  })
  @ApiResponse({
    status: 409,
    description: 'Region with this name already exists',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  async create(@Body() dto: CreateRegionDto) {
    return this.regionsService.create(dto);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all regions (Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Regions retrieved successfully',
    schema: {
      example: {
        success: true,
        message: 'Regions retrieved successfully',
        data: {
          regions: [
            {
              id: '507f1f77bcf86cd799439011',
              name: 'Lagos Mainland',
              description:
                'Mainland region covering Lagos Island and surrounding areas',
              isActive: true,
              createdAt: '2024-01-15T10:00:00.000Z',
              updatedAt: '2024-01-15T10:00:00.000Z',
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
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  async findAll() {
    return this.regionsService.findAll();
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get a specific region by ID (Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Region retrieved successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Region not found',
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
    return this.regionsService.findOne(id);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a region (Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Region updated successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Region not found',
  })
  @ApiResponse({
    status: 409,
    description: 'Region with this name already exists',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  async update(@Param('id') id: string, @Body() dto: UpdateRegionDto) {
    return this.regionsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a region (Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Region deleted successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Region not found',
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
    return this.regionsService.delete(id);
  }
}

import {
  Controller,
  Get,
  Put,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { RiderLocationService } from './rider-location.service';
import { UpdateRiderLocationDto } from './dto/update-rider-location.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/schemas/user.schema';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RidersService } from './riders.service';

@ApiTags('riders')
@Controller('riders/location')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.RIDER)
export class RiderLocationController {
  constructor(
    private readonly riderLocationService: RiderLocationService,
    private readonly ridersService: RidersService,
  ) {}

  @Put()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update rider location (polling endpoint)' })
  @ApiResponse({
    status: 200,
    description: 'Rider location updated successfully',
    schema: {
      example: {
        success: true,
        message: 'Rider location updated successfully',
        data: {
          id: '507f1f77bcf86cd799439011',
          riderProfileId: '507f1f77bcf86cd799439012',
          streetAddress: '123 Main Street',
          latitude: 6.5244,
          longitude: 3.3792,
          state: 'Lagos',
          country: 'Nigeria',
          regionId: 'region_123',
          lastUpdated: '2025-11-27T22:00:00.000Z',
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Rider profile not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Rider access required',
  })
  async updateLocation(
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateRiderLocationDto,
  ) {
    // Get rider profile ID from user
    const profile = await this.ridersService.findProfileByUserId(user.id);
    if (!profile) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'RIDER_PROFILE_NOT_FOUND',
          message: 'Rider profile not found for this user',
        },
      });
    }

    return this.riderLocationService.updateLocation(
      profile._id.toString(),
      dto,
    );
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get current rider location' })
  @ApiResponse({
    status: 200,
    description: 'Rider location retrieved successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Rider location not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Rider access required',
  })
  async getLocation(@CurrentUser() user: { id: string }) {
    // Get rider profile ID from user
    const profile = await this.ridersService.findProfileByUserId(user.id);
    if (!profile) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'RIDER_PROFILE_NOT_FOUND',
          message: 'Rider profile not found for this user',
        },
      });
    }

    return this.riderLocationService.getLocation(profile._id.toString());
  }
}

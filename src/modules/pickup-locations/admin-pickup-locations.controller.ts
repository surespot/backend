import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/schemas/user.schema';
import { PickupLocationsService } from './pickup-locations.service';
import { CreatePickupLocationForAdminDto } from './dto/create-pickup-location-for-admin.dto';

@ApiTags('Admin Pickup Locations')
@Controller('admin/pickup-locations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class AdminPickupLocationsController {
  constructor(private readonly pickupLocationsService: PickupLocationsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a pickup location without assigning it to anyone',
    description:
      'Creates a new pickup location with no admin attached. Use POST /admin/users/:userId/pickup-location/:pickupLocationId to assign it later.',
  })
  @ApiResponse({ status: 201, description: 'Pickup location created successfully' })
  @ApiResponse({ status: 404, description: 'Region not found' })
  async createPickupLocation(@Body() dto: CreatePickupLocationForAdminDto) {
    return this.pickupLocationsService.createStandalone(dto);
  }
}

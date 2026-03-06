import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  ForbiddenException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../auth/schemas/user.schema';
import { PickupLocationsService } from './pickup-locations.service';
import { AssignPickupLocationSelfDto } from './dto/assign-pickup-location-self.dto';
import { CreatePickupLocationForAdminDto } from './dto/create-pickup-location-for-admin.dto';

type CurrentUserType = {
  id: string;
  role: string;
  pickupLocationId?: string;
};

@ApiTags('Admin Onboarding')
@Controller('admin/onboarding')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.PICKUP_ADMIN)
@ApiBearerAuth()
export class AdminOnboardingController {
  constructor(
    private readonly pickupLocationsService: PickupLocationsService,
  ) {}

  private ensureNoPickupLocation(user: CurrentUserType): void {
    if (user.pickupLocationId) {
      throw new ForbiddenException({
        success: false,
        error: {
          code: 'ALREADY_HAS_PICKUP_LOCATION',
          message:
            'Your account is already linked to a pickup location. Onboarding is complete.',
        },
      });
    }
  }

  @Get('unlinked-pickup-locations')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List unlinked pickup locations',
    description:
      'Returns pickup locations that have no admin assigned. For new admins to choose one during onboarding. Only available when admin has no pickup location yet.',
  })
  @ApiResponse({ status: 200, description: 'Unlinked pickup locations list' })
  @ApiResponse({
    status: 403,
    description: 'Admin already has a pickup location assigned',
  })
  async getUnlinkedPickupLocations(@CurrentUser() user: CurrentUserType) {
    this.ensureNoPickupLocation(user);
    return this.pickupLocationsService.findUnlinkedPickupLocations();
  }

  @Post('assign-pickup-location')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Assign an unlinked pickup location to yourself',
    description:
      'Assign an existing unlinked pickup location to your admin account. Only available when admin has no pickup location yet.',
  })
  @ApiResponse({
    status: 200,
    description: 'Pickup location assigned successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'Admin already has a pickup location assigned',
  })
  @ApiResponse({
    status: 404,
    description: 'Pickup location not found or already assigned',
  })
  @ApiResponse({
    status: 409,
    description: 'Pickup location already assigned to another user',
  })
  async assignPickupLocationToSelf(
    @CurrentUser() user: CurrentUserType,
    @Body() dto: AssignPickupLocationSelfDto,
  ) {
    this.ensureNoPickupLocation(user);
    return this.pickupLocationsService.assignExistingPickupLocationToUser(
      dto.pickupLocationId,
      user.id,
    );
  }

  @Post('create-pickup-location')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new pickup location and assign to yourself',
    description:
      'Create a new pickup location and link it to your admin account. Only available when admin has no pickup location yet. Requires an existing region (use GET /regions to list regions).',
  })
  @ApiResponse({
    status: 201,
    description: 'Pickup location created and assigned successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'Admin already has a pickup location assigned',
  })
  @ApiResponse({ status: 404, description: 'Region not found' })
  async createPickupLocationForSelf(
    @CurrentUser() user: CurrentUserType,
    @Body() dto: CreatePickupLocationForAdminDto,
  ) {
    this.ensureNoPickupLocation(user);
    return this.pickupLocationsService.createForExistingAdmin(user.id, dto);
  }
}

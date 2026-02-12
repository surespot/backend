import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/schemas/user.schema';
import { PickupLocationsService } from './pickup-locations.service';
import { CreatePickupLocationForAdminDto } from './dto/create-pickup-location-for-admin.dto';

@ApiTags('admin-users')
@Controller('admin/users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminUsersController {
  constructor(
    private readonly pickupLocationsService: PickupLocationsService,
  ) {}

  @Post(':userId/pickup-location')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Create a pickup location and attach it to an existing admin user (Super admin only)',
  })
  @ApiParam({
    name: 'userId',
    description: 'ID of the admin user to attach the pickup location to',
    example: '507f1f77bcf86cd799439011',
  })
  @ApiResponse({
    status: 201,
    description:
      'Pickup location created and attached to admin user successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid admin role or validation error',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Super admin access required',
  })
  @ApiResponse({
    status: 404,
    description: 'Admin user or region not found',
  })
  @ApiResponse({
    status: 409,
    description: 'Admin already has a pickup location attached',
  })
  async createPickupLocationForAdmin(
    @Param('userId') userId: string,
    @Body() dto: CreatePickupLocationForAdminDto,
  ) {
    return this.pickupLocationsService.createForExistingAdmin(userId, dto);
  }

  @Post(':userId/pickup-location/:pickupLocationId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Assign an existing pickup location to an existing user (Super admin only)',
  })
  @ApiParam({
    name: 'userId',
    description:
      'ID of the user to assign the pickup location to. Non-admin users will be promoted to pickup admin.',
    example: '507f1f77bcf86cd799439011',
  })
  @ApiParam({
    name: 'pickupLocationId',
    description: 'ID of the existing pickup location to assign',
    example: '507f1f77bcf86cd799439012',
  })
  @ApiResponse({
    status: 200,
    description: 'Pickup location assigned to user successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Super admin access required',
  })
  @ApiResponse({
    status: 404,
    description: 'User or pickup location not found',
  })
  @ApiResponse({
    status: 409,
    description: 'Pickup location already assigned to another user',
  })
  async assignExistingPickupLocationToUser(
    @Param('userId') userId: string,
    @Param('pickupLocationId') pickupLocationId: string,
  ) {
    return this.pickupLocationsService.assignExistingPickupLocationToUser(
      pickupLocationId,
      userId,
    );
  }
}

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../auth/schemas/user.schema';
import { RewardsAdminService } from './rewards-admin.service';
import { CreateRewardCampaignDto } from './dto/create-reward-campaign.dto';
import { UpdateRewardCampaignDto } from './dto/update-reward-campaign.dto';
import {
  GetRewardGrantsDto,
  RevokeRewardDto,
} from './dto/reward-admin-queries.dto';

@ApiTags('Admin Rewards')
@Controller('admin/rewards')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminRewardsController {
  constructor(private readonly adminService: RewardsAdminService) {}

  @Post('campaigns')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a special reward campaign' })
  createCampaign(
    @Body() dto: CreateRewardCampaignDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.adminService.createCampaign(dto, user.id);
  }

  @Get('campaigns')
  @ApiOperation({
    summary: 'List reward campaigns with earned/redeemed counts',
  })
  listCampaigns() {
    return this.adminService.listCampaigns();
  }

  @Get('campaigns/:id')
  @ApiOperation({ summary: 'Get one reward campaign' })
  getCampaign(@Param('id') id: string) {
    return this.adminService.getCampaign(id);
  }

  @Patch('campaigns/:id')
  @ApiOperation({
    summary: 'Update a reward campaign',
    description:
      'Send `null` for an optional benefit field to clear it. Changing the benefit affects rewards already earned but not yet used. Set status to "disabled" to stop the campaign and make all unused rewards stop working.',
  })
  updateCampaign(
    @Param('id') id: string,
    @Body() dto: UpdateRewardCampaignDto,
  ) {
    return this.adminService.updateCampaign(id, dto);
  }

  @Get('campaigns/:id/grants')
  @ApiOperation({ summary: 'Who has earned this reward' })
  listGrants(@Param('id') id: string, @Query() query: GetRewardGrantsDto) {
    return this.adminService.listGrants(id, query);
  }

  @Post('grants/:grantId/revoke')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Revoke a user's earned reward",
    description:
      'Only works on rewards not yet used. A revoked reward still counts toward the campaign limit, so the user cannot simply re-earn it.',
  })
  revokeGrant(
    @Param('grantId') grantId: string,
    @Body() dto: RevokeRewardDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.adminService.revokeGrant(grantId, user.id, dto.reason);
  }
}

import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../auth/schemas/user.schema';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { NotificationCampaignService } from '../notification-campaigns/notification-campaign.service';
import { CreateNotificationCampaignDto } from '../notification-campaigns/dto/create-notification-campaign.dto';
import { PreviewNotificationCampaignDto } from '../notification-campaigns/dto/preview-notification-campaign.dto';

@ApiTags('admin-notification-campaigns')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/notification-campaigns')
export class AdminNotificationCampaignsController {
  constructor(private readonly campaignService: NotificationCampaignService) {}

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resolve targeting criteria into a recipient count',
  })
  @ApiResponse({ status: 200, description: 'Preview computed' })
  async preview(@Body() dto: PreviewNotificationCampaignDto) {
    const preview = await this.campaignService.preview(dto);

    return {
      success: true,
      data: { preview },
    };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create notification campaign draft' })
  @ApiResponse({ status: 201, description: 'Notification campaign created' })
  async create(
    @Body() dto: CreateNotificationCampaignDto,
    @CurrentUser() user: { id: string },
  ) {
    const campaign = await this.campaignService.create(dto, user.id);

    return {
      success: true,
      message: 'Notification campaign created',
      data: { campaign },
    };
  }

  @Post(':id/send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send notification campaign to target audience' })
  @ApiResponse({
    status: 200,
    description: 'Notification campaign queued for sending',
  })
  async send(@Param('id') id: string) {
    await this.campaignService.send(id);

    return {
      success: true,
      message: 'Notification campaign queued for sending',
    };
  }

  @Get()
  @ApiOperation({ summary: 'List all notification campaigns' })
  @ApiResponse({ status: 200, description: 'Notification campaigns retrieved' })
  async findAll() {
    const campaigns = await this.campaignService.findAll();

    return {
      success: true,
      data: { campaigns },
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get notification campaign by ID' })
  @ApiResponse({ status: 200, description: 'Notification campaign retrieved' })
  async findOne(@Param('id') id: string) {
    const campaign = await this.campaignService.findById(id);

    return {
      success: true,
      data: { campaign },
    };
  }
}

import {
  Controller,
  Post,
  Body,
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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/schemas/user.schema';
import { AdminNewsletterService } from './admin-newsletter.service';
import { SendNewsletterDto } from './dto/send-newsletter.dto';

@ApiTags('Admin Newsletter')
@Controller('admin/newsletter')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class AdminNewsletterController {
  constructor(private readonly adminNewsletterService: AdminNewsletterService) {}

  @Post('send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send newsletter to an audience',
    description:
      'Sends a newsletter email to the selected audience. Template includes a greeting. Audiences: riders (all), customers (all), pickup-locations (customers who ordered from a pickup location - requires pickupLocationId), regions (riders in a region - requires regionId).',
  })
  @ApiResponse({ status: 200, description: 'Newsletter sent successfully' })
  @ApiResponse({ status: 400, description: 'Invalid audience or missing required fields' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin only' })
  @ApiResponse({ status: 404, description: 'Pickup location or region not found' })
  async sendNewsletter(@Body() dto: SendNewsletterDto) {
    return this.adminNewsletterService.sendNewsletter(dto);
  }
}

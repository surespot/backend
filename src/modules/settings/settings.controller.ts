import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import { UpdateSiteSettingsDto } from './dto/update-site-settings.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/schemas/user.schema';

@ApiTags('Settings')
@Controller('admin/settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  async get() {
    const settings = await this.settingsService.get();
    return {
      success: true,
      data: {
        packagingFeeKobo: settings.packagingFeeKobo,
        packagingFeeNaira: settings.packagingFeeKobo / 100,
        orderCutoffHour: settings.orderCutoffHour,
      },
    };
  }

  @Patch()
  async update(@Body() dto: UpdateSiteSettingsDto) {
    const settings = await this.settingsService.update(dto);
    return {
      success: true,
      data: {
        packagingFeeKobo: settings.packagingFeeKobo,
        packagingFeeNaira: settings.packagingFeeKobo / 100,
        orderCutoffHour: settings.orderCutoffHour,
      },
    };
  }
}

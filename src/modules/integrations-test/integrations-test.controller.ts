import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PublicInDevelopment } from '../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/schemas/user.schema';
import { IntegrationsTestService } from './integrations-test.service';

@ApiTags('Integrations Test')
@Controller('integrations-test')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class IntegrationsTestController {
  constructor(
    private readonly integrationsTestService: IntegrationsTestService,
  ) {}

  @Get()
  @PublicInDevelopment()
  @ApiOperation({
    summary: 'Test external integrations',
    description:
      'Runs connectivity checks for Paystack, SMS, Storage (Cloudinary/S3), Redis, and Mail. No charges or real messages sent. In NODE_ENV=development this route is public; otherwise admin JWT required.',
  })
  async checkAll() {
    const results = await this.integrationsTestService.checkAll();
    return {
      success: true,
      results,
      summary: {
        total: results.length,
        ok: results.filter((r) => r.ok).length,
        configured: results.filter((r) => r.configured).length,
      },
    };
  }

  @Get('places')
  @PublicInDevelopment()
  @ApiOperation({
    summary: 'Test Google Places integration',
    description:
      'Runs a read-only Google Places autocomplete probe and returns a sanitized pass/fail message. In NODE_ENV=development this route is public; otherwise admin JWT required.',
  })
  async checkPlaces() {
    const result = await this.integrationsTestService.checkPlaces();
    return { success: result.ok, result };
  }
}

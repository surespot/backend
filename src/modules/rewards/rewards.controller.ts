import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RewardsCustomerService } from './rewards-customer.service';

@ApiTags('rewards')
@Controller('rewards')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class RewardsController {
  constructor(private readonly customerService: RewardsCustomerService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Special rewards: what I can earn and what I have earned',
    description:
      'Backs the "special rewards" screen. `available` lists campaigns that can be earned right now (no code shown). `mine` lists rewards the user has earned with the code to enter at checkout via the normal promoCode field.',
  })
  @ApiResponse({ status: 200, description: 'Special rewards retrieved' })
  async getOverview(@CurrentUser() user: { id: string }) {
    return this.customerService.getOverview(user.id);
  }
}

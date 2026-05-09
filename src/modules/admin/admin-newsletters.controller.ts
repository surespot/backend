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
import { NewsletterService } from '../mail/newsletter.service';
import { CreateNewsletterDto } from '../mail/dto/create-newsletter.dto';

@ApiTags('admin-newsletters')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/newsletters')
export class AdminNewslettersController {
  constructor(private readonly newsletterService: NewsletterService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create newsletter draft' })
  @ApiResponse({ status: 201, description: 'Newsletter created' })
  async create(
    @Body() dto: CreateNewsletterDto,
    @CurrentUser() user: { id: string },
  ) {
    const newsletter = await this.newsletterService.create(
      dto.subject,
      dto.body,
      dto.audience,
      dto.targetPickupLocationIds,
      dto.targetRegionIds,
      user.id,
    );

    return {
      success: true,
      message: 'Newsletter created',
      data: { newsletter },
    };
  }

  @Post(':id/send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send newsletter to target audience' })
  @ApiResponse({ status: 200, description: 'Newsletter queued for sending' })
  async send(@Param('id') id: string) {
    await this.newsletterService.send(id);

    return {
      success: true,
      message: 'Newsletter queued for sending',
    };
  }

  @Get()
  @ApiOperation({ summary: 'List all newsletters' })
  @ApiResponse({ status: 200, description: 'Newsletters retrieved' })
  async findAll() {
    const newsletters = await this.newsletterService.findAll();

    return {
      success: true,
      data: { newsletters },
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get newsletter by ID' })
  @ApiResponse({ status: 200, description: 'Newsletter retrieved' })
  async findOne(@Param('id') id: string) {
    const newsletter = await this.newsletterService.findById(id);

    return {
      success: true,
      data: { newsletter },
    };
  }
}

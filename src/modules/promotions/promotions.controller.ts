import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { PromotionsService } from './promotions.service';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';
import { GetPromotionsFilterDto } from './dto/get-promotions-filter.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/schemas/user.schema';

@ApiTags('promotions')
@Controller('promotions')
export class PromotionsController {
  constructor(private readonly promotionsService: PromotionsService) {}

  @Post()
  @ApiBearerAuth()
  // @UseGuards(JwtAuthGuard, RolesGuard)
  @UseGuards(JwtAuthGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new promotion with image' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('image'))
  @ApiBody({
    description: 'Promotion details and image file',
    schema: {
      type: 'object',
      properties: {
        image: {
          type: 'string',
          format: 'binary',
        },
        name: { type: 'string' },
        activeFrom: { type: 'string', format: 'date-time' },
        activeTo: { type: 'string', format: 'date-time' },
        linkTo: { type: 'string' },
        discountCode: { type: 'string' },
        status: {
          type: 'string',
          enum: ['inactive', 'active', 'ended'],
        },
      },
      required: ['image', 'name', 'activeFrom', 'activeTo', 'linkTo'],
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Promotion created successfully',
  })
  async create(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CreatePromotionDto,
  ) {
    return this.promotionsService.createWithImage(file, dto);
  }

  @Get('active')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all active promotions for authenticated users' })
  @ApiResponse({
    status: 200,
    description: 'Active promotions retrieved successfully',
  })
  async getActive() {
    return this.promotionsService.getActive();
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all promotions with optional date filter' })
  @ApiResponse({
    status: 200,
    description: 'Promotions retrieved successfully',
  })
  async getAll(@Query() filter: GetPromotionsFilterDto) {
    return this.promotionsService.getAll(filter);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a promotion' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('image'))
  @ApiBody({
    description: 'Promotion fields to update and optional new image file',
    schema: {
      type: 'object',
      properties: {
        image: {
          type: 'string',
          format: 'binary',
        },
        name: { type: 'string' },
        activeFrom: { type: 'string', format: 'date-time' },
        activeTo: { type: 'string', format: 'date-time' },
        linkTo: { type: 'string' },
        discountCode: { type: 'string' },
        status: {
          type: 'string',
          enum: ['inactive', 'active', 'ended'],
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Promotion updated successfully',
  })
  async update(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UpdatePromotionDto,
  ) {
    return this.promotionsService.update(id, dto, file);
  }

  @Post(':id/start')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start a promotion (set status to active)' })
  @ApiResponse({
    status: 200,
    description: 'Promotion started successfully',
  })
  async start(@Param('id') id: string) {
    return this.promotionsService.start(id);
  }

  @Post(':id/end')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'End a promotion (set status to ended)' })
  @ApiResponse({
    status: 200,
    description: 'Promotion ended successfully',
  })
  async end(@Param('id') id: string) {
    return this.promotionsService.end(id);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a promotion' })
  @ApiResponse({
    status: 200,
    description: 'Promotion deleted successfully',
  })
  async delete(@Param('id') id: string) {
    return this.promotionsService.delete(id);
  }
}

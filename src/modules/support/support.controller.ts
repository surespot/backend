import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { SupportService } from './support.service';
import { CreateSupportRequestDto } from './dto/create-support-request.dto';
import { GetSupportRequestsFilterDto } from './dto/get-support-requests-filter.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../auth/schemas/user.schema';

type CurrentUserType = {
  id: string;
  role: string;
};

@ApiTags('support')
@Controller('support')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.USER, UserRole.RIDER)
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Post('requests')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FilesInterceptor('attachments', 3))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Submit a support request',
    description:
      'Submit form data and optional file attachments (max 3) in one multipart request',
  })
  @ApiBody({
    description: 'Support request form fields and optional attachments',
    schema: {
      type: 'object',
      required: ['source', 'category', 'type', 'description', 'contactPhone'],
      properties: {
        source: { type: 'string', enum: ['service_issue', 'bug_report', 'contact_support'] },
        category: { type: 'string', example: 'order_disputes' },
        type: { type: 'string', example: 'order_cancelled' },
        orderId: { type: 'string', example: '507f1f77bcf86cd799439011' },
        title: { type: 'string', example: 'Order cancelled without refund' },
        description: { type: 'string', example: 'I ordered the economy pack...' },
        contactPhone: { type: 'string', example: '09123478220' },
        stepsToReproduce: { type: 'string', example: '1. Open app\n2. Go to checkout' },
        areaAffected: { type: 'string', example: 'Checkout' },
        issueType: { type: 'string', example: 'app_crash' },
        attachments: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          description: 'Supporting documents (max 3)',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Support request created successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error or order not found',
  })
  @ApiResponse({
    status: 403,
    description: 'Only customers and riders can submit support requests',
  })
  async create(
    @CurrentUser() user: CurrentUserType,
    @Body() dto: CreateSupportRequestDto,
    @UploadedFiles() attachments?: Express.Multer.File[],
  ) {
    const request = await this.supportService.submit(
      user.id,
      user.role,
      dto,
      attachments ?? [],
    );
    return {
      success: true,
      message: 'Support request submitted successfully',
      data: {
        id: request._id.toString(),
        status: request.status,
        createdAt: request.createdAt?.toISOString(),
      },
    };
  }

  @Post('upload')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Upload supporting document; returns URL to include in support request',
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
      required: ['file'],
    },
  })
  @ApiOperation({ summary: 'Upload attachment for support request' })
  @ApiResponse({
    status: 200,
    description: 'File uploaded; returns { url }',
  })
  @ApiResponse({ status: 400, description: 'File required' })
  async upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'FILE_REQUIRED',
          message: 'File is required',
        },
      });
    }
    const { url } = await this.supportService.upload(file);
    return { success: true, data: { url } };
  }

  @Get('requests')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List own support requests' })
  @ApiResponse({
    status: 200,
    description: 'Support requests retrieved successfully',
  })
  async list(
    @CurrentUser() user: CurrentUserType,
    @Query() filter: GetSupportRequestsFilterDto,
  ) {
    const result = await this.supportService.listOwn(user.id, filter);
    return {
      success: true,
      data: {
        items: result.items.map((r) => ({
          id: r._id.toString(),
          submitterRole: r.submitterRole,
          status: r.status,
          source: r.source,
          category: r.category,
          type: r.type,
          description: r.description,
          orderId: r.orderId?.toString(),
          createdAt: r.createdAt?.toISOString(),
        })),
        pagination: result.pagination,
      },
    };
  }

  @Get('requests/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get own support request details' })
  @ApiResponse({
    status: 200,
    description: 'Support request retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Support request not found' })
  async getById(
    @CurrentUser() user: CurrentUserType,
    @Param('id') id: string,
  ) {
    const request = await this.supportService.getOwnById(id, user.id);
    return {
      success: true,
      data: {
        id: request._id.toString(),
        submitterRole: request.submitterRole,
        status: request.status,
        source: request.source,
        category: request.category,
        type: request.type,
        title: request.title,
        description: request.description,
        contactPhone: request.contactPhone,
        attachments: request.attachments,
        orderId: request.orderId?.toString(),
        stepsToReproduce: request.stepsToReproduce,
        areaAffected: request.areaAffected,
        issueType: request.issueType,
        createdAt: request.createdAt?.toISOString(),
      },
    };
  }
}

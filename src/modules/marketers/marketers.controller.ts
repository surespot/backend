import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
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
import { MarketersService } from './marketers.service';
import { CreateMarketerDto } from './dto/create-marketer.dto';
import { UpdateMarketerDto } from './dto/update-marketer.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/schemas/user.schema';

@ApiTags('marketers')
@Controller('marketers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class MarketersController {
  constructor(private readonly marketersService: MarketersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new affiliate marketer' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('profilePicture'))
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name', 'email', 'discountType', 'profilePicture'],
      properties: {
        profilePicture: { type: 'string', format: 'binary' },
        name: { type: 'string' },
        email: { type: 'string' },
        discountType: { type: 'string', enum: ['percentage', 'fixed_amount', 'free_delivery', 'free_category', 'bogo'] },
        discountValue: { type: 'number' },
        minOrderAmount: { type: 'number' },
        maxDiscountAmount: { type: 'number' },
        code: { type: 'string', description: '8-char alphanumeric code. Omit to auto-generate.' },
        accountNumber: { type: 'string' },
        bankCode: { type: 'string' },
        bankName: { type: 'string' },
        accountName: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Marketer created successfully' })
  async create(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CreateMarketerDto,
  ) {
    return this.marketersService.create(file, dto);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List all marketers sorted by performance' })
  async findAll() {
    return this.marketersService.findAll();
  }

  @Get('generate-code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate a unique 8-character affiliate code' })
  @ApiResponse({ status: 200, description: 'Returns a unique code string' })
  async generateCode() {
    const code = await this.marketersService.generateUniqueCode();
    return { success: true, data: { code } };
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get a marketer by ID' })
  async findOne(@Param('id') id: string) {
    return this.marketersService.findById(id);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a marketer' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('profilePicture'))
  async update(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UpdateMarketerDto,
  ) {
    return this.marketersService.update(id, dto, file);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a marketer' })
  async remove(@Param('id') id: string) {
    return this.marketersService.delete(id);
  }
}

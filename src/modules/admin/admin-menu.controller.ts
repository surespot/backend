import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ForbiddenException,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../auth/schemas/user.schema';
import { AdminMenuService } from './admin-menu.service';
import { GetMenuItemsDto } from './dto/get-menu-items.dto';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';
import { ToggleStockDto } from './dto/toggle-stock.dto';

type CurrentUserType = {
  id: string;
  role: string;
  email?: string;
  phone?: string;
  pickupLocationId?: string;
};

@ApiTags('Admin Menu')
@Controller('admin/menu')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.PICKUP_ADMIN)
@ApiBearerAuth()
export class AdminMenuController {
  constructor(private readonly adminMenuService: AdminMenuService) {}

  private ensurePickupLocation(user: CurrentUserType): string {
    if (!user.pickupLocationId) {
      throw new ForbiddenException({
        success: false,
        error: {
          code: 'NO_PICKUP_LOCATION',
          message:
            'Your account is not linked to a pickup location. Please contact support.',
        },
      });
    }
    return user.pickupLocationId;
  }

  @Get('items')
  @ApiOperation({ summary: 'List menu items (food + extras) for the location' })
  @ApiResponse({ status: 200, description: 'Menu items retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - no pickup location' })
  async getMenuItems(
    @CurrentUser() user: CurrentUserType,
    @Query() filters: GetMenuItemsDto,
  ) {
    const pickupLocationId = this.ensurePickupLocation(user);
    return this.adminMenuService.getMenuItems(pickupLocationId, filters);
  }

  @Get('items/:id')
  @ApiOperation({ summary: 'Get single menu item detail' })
  @ApiResponse({ status: 200, description: 'Menu item retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - no pickup location' })
  @ApiResponse({ status: 404, description: 'Menu item not found' })
  async getMenuItem(
    @CurrentUser() user: CurrentUserType,
    @Param('id') itemId: string,
  ) {
    const pickupLocationId = this.ensurePickupLocation(user);
    return this.adminMenuService.getMenuItem(pickupLocationId, itemId);
  }

  @Post('items')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('image'))
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiBody({
    description: 'Create food or extra; use multipart with image file or JSON with imageUrl',
    schema: {
      type: 'object',
      properties: {
        image: { type: 'string', format: 'binary' },
        name: { type: 'string' },
        description: { type: 'string' },
        price: { type: 'number' },
        extra: { type: 'boolean' },
        prepTime: { type: 'number' },
        tags: { type: 'array', items: { type: 'string' } },
        category: { type: 'string' },
        assignedExtras: { type: 'array', items: { type: 'string' } },
        quantity: { type: 'string' },
        imageUrl: { type: 'string' },
      },
    },
  })
  @ApiOperation({ summary: 'Create food or extra (super admin only)' })
  @ApiResponse({ status: 201, description: 'Menu item created successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async createMenuItem(
    @CurrentUser() user: CurrentUserType,
    @Body() dto: CreateMenuItemDto,
    @UploadedFile() image?: Express.Multer.File,
  ) {
    const pickupLocationId = this.ensurePickupLocation(user);
    return this.adminMenuService.createMenuItem(pickupLocationId, dto, image);
  }

  @Patch('items/:id')
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('image'))
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiOperation({ summary: 'Update menu item (super admin only)' })
  @ApiResponse({ status: 200, description: 'Menu item updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Menu item not found' })
  async updateMenuItem(
    @CurrentUser() user: CurrentUserType,
    @Param('id') itemId: string,
    @Body() dto: UpdateMenuItemDto,
    @UploadedFile() image?: Express.Multer.File,
  ) {
    const pickupLocationId = this.ensurePickupLocation(user);
    return this.adminMenuService.updateMenuItem(
      pickupLocationId,
      itemId,
      dto,
      image,
    );
  }

  @Delete('items/:id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete menu item (super admin only)' })
  @ApiResponse({ status: 200, description: 'Menu item deleted successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Menu item not found' })
  async deleteMenuItem(
    @CurrentUser() user: CurrentUserType,
    @Param('id') itemId: string,
  ) {
    const pickupLocationId = this.ensurePickupLocation(user);
    return this.adminMenuService.deleteMenuItem(pickupLocationId, itemId);
  }

  @Patch('items/:id/stock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Toggle in-stock status (pickup admin or super admin)' })
  @ApiResponse({ status: 200, description: 'Stock status updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Menu item not found' })
  async toggleStock(
    @CurrentUser() user: CurrentUserType,
    @Param('id') itemId: string,
    @Body() dto: ToggleStockDto,
  ) {
    const pickupLocationId = this.ensurePickupLocation(user);
    return this.adminMenuService.toggleStock(
      pickupLocationId,
      itemId,
      dto.inStock,
      dto.itemType,
    );
  }

  @Get('categories')
  @ApiOperation({ summary: 'List categories for menu (id, label, image)' })
  @ApiResponse({ status: 200, description: 'Categories retrieved successfully' })
  async getCategories() {
    return this.adminMenuService.getCategories();
  }

  @Get('extras')
  @ApiOperation({ summary: 'List extras for assignment to food items' })
  @ApiResponse({ status: 200, description: 'Extras retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - no pickup location' })
  async getExtras(@CurrentUser() user: CurrentUserType) {
    const pickupLocationId = this.ensurePickupLocation(user);
    return this.adminMenuService.getExtrasForAssignment(pickupLocationId);
  }

  @Post('upload')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('image'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Upload image for menu item; returns URL to use in create/update',
    schema: {
      type: 'object',
      properties: {
        image: { type: 'string', format: 'binary' },
      },
      required: ['image'],
    },
  })
  @ApiOperation({
    summary: 'Upload menu item image',
    description:
      'Upload an image and get back a URL. Use this URL in POST/PATCH menu items (imageUrl).',
  })
  @ApiResponse({ status: 200, description: 'Image uploaded; returns { url }' })
  @ApiResponse({ status: 400, description: 'Invalid image type' })
  async uploadImage(@UploadedFile() image: Express.Multer.File) {
    if (!image) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'IMAGE_REQUIRED',
          message: 'Image file is required',
        },
      });
    }
    return this.adminMenuService.uploadMenuImage(image);
  }
}

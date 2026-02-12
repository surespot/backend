import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { FoodItemsService } from '../food-items/food-items.service';
import { FoodItemsRepository } from '../food-items/food-items.repository';
import { FoodCategory } from '../food-items/schemas/food-item.schema';
import { CreateFoodItemDto } from '../food-items/dto/create-food-item.dto';
import { CreateFoodExtraDto } from '../food-items/dto/create-food-extra.dto';
import { UpdateFoodExtraDto } from '../food-items/dto/update-food-extra.dto';
import { AdminMenuRepository } from './admin-menu.repository';
import { CloudinaryService } from '../../common/cloudinary/cloudinary.service';
import { GetMenuItemsDto } from './dto/get-menu-items.dto';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';
import type { MenuItemResponseDto } from './dto/menu-item-response.dto';
import type { FoodItemDocument } from '../food-items/schemas/food-item.schema';
import type { FoodExtraDocument } from '../food-items/schemas/food-extra.schema';
import { GetFoodItemsFilterDto, SortBy, SortOrder } from '../food-items/dto/get-food-items-filter.dto';

@Injectable()
export class AdminMenuService {
  constructor(
    private readonly foodItemsService: FoodItemsService,
    private readonly foodItemsRepository: FoodItemsRepository,
    private readonly adminMenuRepository: AdminMenuRepository,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  private slugify(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
  }

  private async generateUniqueSlug(baseSlug: string): Promise<string> {
    let slug = baseSlug || 'item';
    let exists = await this.foodItemsRepository.checkSlugExists(slug);
    let suffix = 1;
    while (exists) {
      slug = `${baseSlug}-${suffix}`;
      exists = await this.foodItemsRepository.checkSlugExists(slug);
      suffix++;
    }
    return slug;
  }

  private toMenuItemResponse(
    item: FoodItemDocument | FoodExtraDocument,
    extra: boolean,
    inStock: boolean,
  ): MenuItemResponseDto {
    if (extra) {
      const e = item as FoodExtraDocument;
      return {
        id: e._id.toString(),
        name: e.name,
        price: e.price,
        description: e.description ?? '',
        image: e.imageUrl ?? '',
        extra: true,
        inStock,
        quantity: e.description ?? undefined,
        reviews: undefined,
      };
    }
    const f = item as FoodItemDocument;
    const extras = (f.extras as Types.ObjectId[] | undefined) ?? [];
    return {
      id: f._id.toString(),
      name: f.name,
      price: f.price,
      description: f.description,
      image: f.imageUrl,
      extra: false,
      inStock,
      category: f.category,
      tags: f.tags,
      prepTime: f.estimatedTime?.max,
      assignedExtras: extras.map((id) => id.toString()),
      reviews: {
        averageRating: f.averageRating,
        ratingCount: f.ratingCount,
      },
    };
  }

  async getMenuItems(
    pickupLocationId: string,
    filters: GetMenuItemsDto,
  ): Promise<{ success: true; data: { items: MenuItemResponseDto[] } }> {
    const type = filters.type ?? 'all';
    const category = filters.category;
    const search = filters.search?.toLowerCase();
    const inStockFilter = filters.inStock;

    const foodFilter: GetFoodItemsFilterDto = {
      page: 1,
      limit: 500,
      sortBy: SortBy.DEFAULT,
      sortOrder: SortOrder.ASC,
    };
    if (category) foodFilter.category = category as FoodCategory;

    const foodResult =
      type !== 'extra'
        ? await this.foodItemsRepository.findAll(foodFilter)
        : { items: [], pagination: { total: 0 } };
    const extras =
      type !== 'food'
        ? await this.foodItemsRepository.findAllExtras()
        : [];

    const stockItems: Array<{ itemId: string; itemType: 'food' | 'extra' }> = [
      ...foodResult.items.map((f) => ({ itemId: f._id.toString(), itemType: 'food' as const })),
      ...extras.map((e) => ({ itemId: e._id.toString(), itemType: 'extra' as const })),
    ];
    const stockMap = await this.adminMenuRepository.getStockStatusBatch(
      pickupLocationId,
      stockItems.map((s) => ({ itemId: s.itemId, itemType: s.itemType, name: '' })),
    );

    const list: MenuItemResponseDto[] = [];

    for (const f of foodResult.items) {
      const id = f._id.toString();
      const inStock = stockMap.get(id) ?? true;
      if (inStockFilter !== undefined && inStock !== inStockFilter) continue;
      if (search && !f.name.toLowerCase().includes(search) && !f.description?.toLowerCase().includes(search)) continue;
      list.push(this.toMenuItemResponse(f, false, inStock));
    }
    for (const e of extras) {
      const id = e._id.toString();
      const inStock = stockMap.get(id) ?? true;
      if (inStockFilter !== undefined && inStock !== inStockFilter) continue;
      if (search && !e.name.toLowerCase().includes(search) && !(e.description ?? '').toLowerCase().includes(search)) continue;
      list.push(this.toMenuItemResponse(e, true, inStock));
    }

    return { success: true, data: { items: list } };
  }

  async getMenuItem(
    pickupLocationId: string,
    itemId: string,
  ): Promise<{ success: true; data: MenuItemResponseDto }> {
    let item: FoodItemDocument | FoodExtraDocument | null =
      await this.foodItemsRepository.findById(itemId, true);
    let itemType: 'food' | 'extra' = 'food';
    if (!item) {
      item = await this.foodItemsRepository.findExtraById(itemId);
      itemType = 'extra';
    }
    if (!item) {
      throw new NotFoundException({
        success: false,
        error: { code: 'MENU_ITEM_NOT_FOUND', message: 'Menu item not found' },
      });
    }
    const inStock = await this.adminMenuRepository.getStockStatus(
      pickupLocationId,
      itemId,
      itemType,
    );
    const dto = this.toMenuItemResponse(item, itemType === 'extra', inStock);
    return { success: true, data: dto };
  }

  async createMenuItem(
    _pickupLocationId: string,
    dto: CreateMenuItemDto,
    file?: Express.Multer.File,
  ): Promise<{ success: true; data: MenuItemResponseDto }> {
    if (dto.extra) {
      let imageUrl = dto.imageUrl;
      if (file) {
        const uploadResult = await this.cloudinaryService.uploadImage(file);
        imageUrl = (uploadResult as { secure_url: string }).secure_url;
      }
      const createExtra: CreateFoodExtraDto = {
        name: dto.name,
        description: dto.quantity ?? dto.description,
        price: dto.price,
        isAvailable: true,
        imageUrl,
      };
      const result = await this.foodItemsService.createExtra(createExtra);
      const id = (result.data as { id: string }).id;
      return this.getMenuItem(_pickupLocationId, id);
    }

    const baseSlug = this.slugify(dto.name);
    const slug = await this.generateUniqueSlug(baseSlug);
    const prepTime = dto.prepTime ?? 30;
    const createDto: CreateFoodItemDto = {
      name: dto.name,
      description: dto.description,
      slug,
      price: dto.price,
      category: (dto.category as FoodCategory) ?? FoodCategory.FOOD,
      tags: dto.tags ?? [],
      estimatedTime: { min: Math.max(5, prepTime - 5), max: prepTime },
      extras: dto.assignedExtras ?? [],
      imageUrl: dto.imageUrl,
    };
    const result = await this.foodItemsService.createWithImage(file, createDto);
    const id = (result.data as { id: string }).id;
    return this.getMenuItem(_pickupLocationId, id);
  }

  async updateMenuItem(
    pickupLocationId: string,
    itemId: string,
    dto: UpdateMenuItemDto,
    file?: Express.Multer.File,
  ): Promise<{ success: true; data: MenuItemResponseDto }> {
    let food = await this.foodItemsRepository.findById(itemId, false);
    if (food) {
      const updateData: any = {};
      if (dto.name !== undefined) updateData.name = dto.name;
      if (dto.description !== undefined) updateData.description = dto.description;
      if (dto.price !== undefined) updateData.price = dto.price;
      if (dto.category !== undefined) updateData.category = dto.category;
      if (dto.tags !== undefined) updateData.tags = dto.tags;
      if (dto.prepTime !== undefined) {
        updateData.estimatedTime = {
          min: Math.max(5, dto.prepTime - 5),
          max: dto.prepTime,
        };
      }
      if (dto.imageUrl !== undefined) updateData.imageUrl = dto.imageUrl;
      if (Object.keys(updateData).length > 0) {
        await this.foodItemsRepository.update(itemId, updateData);
      }
      if (dto.assignedExtras !== undefined) {
        await this.foodItemsRepository.updateExtras(
          itemId,
          dto.assignedExtras.map((id) => new Types.ObjectId(id)),
        );
      }
      const updated = await this.foodItemsRepository.findById(itemId, true);
      const inStock = await this.adminMenuRepository.getStockStatus(
        pickupLocationId,
        itemId,
        'food',
      );
      return {
        success: true,
        data: this.toMenuItemResponse(updated!, false, inStock),
      };
    }

    const extra = await this.foodItemsRepository.findExtraById(itemId);
    if (extra) {
      const updateExtraDto: UpdateFoodExtraDto = {};
      if (dto.name !== undefined) updateExtraDto.name = dto.name;
      if (dto.description !== undefined) updateExtraDto.description = dto.description;
      if (dto.quantity !== undefined) updateExtraDto.description = dto.quantity;
      if (dto.price !== undefined) updateExtraDto.price = dto.price;
      if (dto.imageUrl !== undefined) updateExtraDto.imageUrl = dto.imageUrl;
      if (file) {
        const uploadResult = await this.cloudinaryService.uploadImage(file);
        updateExtraDto.imageUrl = (uploadResult as { secure_url: string }).secure_url;
      }
      if (Object.keys(updateExtraDto).length > 0) {
        await this.foodItemsService.updateExtra(itemId, updateExtraDto);
      }
      const updated = await this.foodItemsRepository.findExtraById(itemId);
      const inStock = await this.adminMenuRepository.getStockStatus(
        pickupLocationId,
        itemId,
        'extra',
      );
      return {
        success: true,
        data: this.toMenuItemResponse(updated!, true, inStock),
      };
    }

    throw new NotFoundException({
      success: false,
      error: { code: 'MENU_ITEM_NOT_FOUND', message: 'Menu item not found' },
    });
  }

  async deleteMenuItem(
    pickupLocationId: string,
    itemId: string,
  ): Promise<{ success: true; message: string }> {
    const food = await this.foodItemsRepository.findById(itemId, false);
    if (food) {
      await this.foodItemsRepository.delete(itemId);
      await this.adminMenuRepository.deleteStockStatus(pickupLocationId, itemId, 'food');
      return { success: true, message: 'Food item deleted successfully' };
    }
    const extra = await this.foodItemsRepository.findExtraById(itemId);
    if (extra) {
      await this.foodItemsRepository.deleteExtra(itemId);
      await this.adminMenuRepository.deleteStockStatus(pickupLocationId, itemId, 'extra');
      return { success: true, message: 'Food extra deleted successfully' };
    }
    throw new NotFoundException({
      success: false,
      error: { code: 'MENU_ITEM_NOT_FOUND', message: 'Menu item not found' },
    });
  }

  async toggleStock(
    pickupLocationId: string,
    itemId: string,
    inStock: boolean,
    itemType?: 'food' | 'extra',
  ): Promise<{ success: true; data: MenuItemResponseDto }> {
    let type = itemType;
    if (!type) {
      const food = await this.foodItemsRepository.findById(itemId, false);
      type = food ? 'food' : 'extra';
    }
    await this.adminMenuRepository.setStockStatus(
      pickupLocationId,
      itemId,
      type,
      inStock,
    );
    return this.getMenuItem(pickupLocationId, itemId);
  }

  async getCategories(): Promise<{
    success: true;
    data: { categories: Array<{ id: string; label: string; image?: string }> };
  }> {
    const result = await this.foodItemsService.getCategories(true, true);
    const categories = (result.data as { categories: Array<{ name: string; slug: string; displayName: string; imageUrl?: string }> }).categories;
    return {
      success: true,
      data: {
        categories: categories.map((c) => ({
          id: c.slug,
          label: c.displayName,
          image: c.imageUrl,
        })),
      },
    };
  }

  async getExtrasForAssignment(
    _pickupLocationId: string,
  ): Promise<{
    success: true;
    data: Array<{ id: string; name: string; price: number }>;
  }> {
    const extras = await this.foodItemsRepository.findAllExtras();
    return {
      success: true,
      data: extras.map((e) => ({
        id: e._id.toString(),
        name: e.name,
        price: e.price,
      })),
    };
  }

  /**
   * Upload an image for a menu item (food or extra). Returns the Cloudinary URL.
   * Fits the same shape as food-items (single image URL for display).
   */
  async uploadMenuImage(
    file: Express.Multer.File,
  ): Promise<{ success: true; data: { url: string } }> {
    const allowedTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
    ];
    if (!file || !allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'INVALID_IMAGE_TYPE',
          message: 'Image must be JPEG, JPG, PNG, or WebP',
        },
      });
    }
    const result = await this.cloudinaryService.uploadImage(file);
    const url = (result as { secure_url: string }).secure_url;
    return { success: true, data: { url } };
  }
}

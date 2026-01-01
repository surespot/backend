import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { FoodItemsRepository } from './food-items.repository';
import { GetFoodItemsFilterDto } from './dto/get-food-items-filter.dto';
import { SearchFoodItemsDto, SearchFilter } from './dto/search-food-items.dto';
import { CreateFoodItemDto } from './dto/create-food-item.dto';
import { UpdateFoodItemDto } from './dto/update-food-item.dto';
import { UpdateFoodItemExtrasDto } from './dto/update-food-item-extras.dto';
import { CreateFoodExtraDto } from './dto/create-food-extra.dto';
import { UpdateFoodExtraDto } from './dto/update-food-extra.dto';
import { FoodItemDocument } from './schemas/food-item.schema';
import { FoodExtraDocument } from './schemas/food-extra.schema';
import { FoodCategory } from './schemas/food-item.schema';
import { InteractionType } from './schemas/food-interaction.schema';
import { CreateFoodInteractionDto } from './dto/create-food-interaction.dto';
import { CloudinaryService } from '../../common/cloudinary/cloudinary.service';
import { OrdersRepository } from '../orders/orders.repository';
import { Types } from 'mongoose';

export interface FoodItemResponse {
  id: string;
  name: string;
  description: string;
  slug: string;
  price: number;
  formattedPrice: string;
  currency: string;
  imageUrl: string;
  imageUrls: string[];
  category: string;
  tags: string[];
  averageRating: number;
  ratingCount: number;
  estimatedTime: {
    min: number;
    max: number;
  };
  eta: string;
  isAvailable: boolean;
  isActive: boolean;
  extras?: FoodExtraResponse[];
  relatedItems?: FoodItemResponse[];
  viewCount?: number;
  orderCount?: number;
  isPopular?: boolean;
  userInteractions?: {
    isViewed: boolean;
    isLiked: boolean;
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface FoodExtraResponse {
  id: string;
  name: string;
  description?: string;
  price: number;
  formattedPrice: string;
  currency: string;
  isAvailable: boolean;
  category?: string;
}

export interface CategoryResponse {
  name: string;
  slug: string;
  displayName: string;
  description?: string;
  imageUrl?: string;
  itemCount?: number;
  sortOrder?: number;
}

@Injectable()
export class FoodItemsService {
  constructor(
    private readonly foodItemsRepository: FoodItemsRepository,
    private readonly cloudinaryService: CloudinaryService,
    private readonly ordersRepository: OrdersRepository,
  ) {}

  private formatPrice(price: number, currency: string = 'NGN'): string {
    if (price === 0) return 'Free';
    const amount = price / 100;
    return `₦${amount.toLocaleString('en-NG')}`;
  }

  private formatEta(min: number, max: number): string {
    return `${min}-${max} mins`;
  }

  private toFoodExtraResponse(extra: FoodExtraDocument): FoodExtraResponse {
    return {
      id: extra._id.toString(),
      name: extra.name,
      description: extra.description,
      price: extra.price,
      formattedPrice: this.formatPrice(extra.price, extra.currency),
      currency: extra.currency,
      isAvailable: extra.isAvailable,
      category: extra.category,
    };
  }

  private toFoodItemResponse(
    item: FoodItemDocument,
    includeExtras = false,
    userInteractions?: { isViewed: boolean; isLiked: boolean },
  ): FoodItemResponse {
    const response: FoodItemResponse = {
      id: item._id.toString(),
      name: item.name,
      description: item.description,
      slug: item.slug,
      price: item.price,
      formattedPrice: this.formatPrice(item.price, item.currency),
      currency: item.currency,
      imageUrl: item.imageUrl,
      imageUrls: item.imageUrls || [],
      category: item.category,
      tags: item.tags,
      averageRating: item.averageRating,
      ratingCount: item.ratingCount,
      estimatedTime: item.estimatedTime,
      eta: this.formatEta(item.estimatedTime.min, item.estimatedTime.max),
      isAvailable: item.isAvailable,
      isActive: item.isActive,
      viewCount: item.viewCount,
      orderCount: item.orderCount,
      isPopular: item.isPopular,
      createdAt: item.createdAt?.toISOString(),
      updatedAt: item.updatedAt?.toISOString(),
    };

    // Add user interactions if provided
    if (userInteractions) {
      response.userInteractions = {
        isViewed: userInteractions.isViewed,
        isLiked: userInteractions.isLiked,
      };
    }

    // Populate extras if requested and available
    if (includeExtras && item.extras && Array.isArray(item.extras)) {
      response.extras = item.extras.map((extra: any) =>
        this.toFoodExtraResponse(extra),
      );
    }

    return response;
  }

  async findAll(filter: GetFoodItemsFilterDto, userId?: string) {
    const result = await this.foodItemsRepository.findAll(filter);

    // Get user interactions if userId provided
    let userInteractionsMap: Map<string, Set<string>> | null = null;
    if (userId) {
      const itemIds = result.items.map((item) => item._id);
      userInteractionsMap =
        await this.foodItemsRepository.getUserInteractionsForItems(
          userId,
          itemIds,
        );
    }

    return {
      success: true,
      data: {
        items: result.items.map((item) => {
          const itemId = item._id.toString();
          const interactions = userInteractionsMap?.get(itemId);
          return this.toFoodItemResponse(item, true, {
            isViewed: interactions?.has(InteractionType.VIEW) ?? false,
            isLiked: interactions?.has(InteractionType.LIKE) ?? false,
          });
        }),
        pagination: result.pagination,
      },
    };
  }

  async findOne(
    id: string,
    includeExtras = true,
    includeRelated = true,
    relatedLimit = 3,
    userId?: string,
  ) {
    const item = await this.foodItemsRepository.findById(id, includeExtras);

    if (!item) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'FOOD_ITEM_NOT_FOUND',
          message: 'Food item not found',
        },
      });
    }

    // Get user interactions if userId provided
    let userInteractions: { isViewed: boolean; isLiked: boolean } | undefined;
    if (userId) {
      const interactions =
        await this.foodItemsRepository.getUserInteractionsForItems(userId, [
          item._id,
        ]);
      const itemInteractions = interactions.get(item._id.toString());
      userInteractions = {
        isViewed: itemInteractions?.has(InteractionType.VIEW) ?? false,
        isLiked: itemInteractions?.has(InteractionType.LIKE) ?? false,
      };
    }

    const response = this.toFoodItemResponse(
      item,
      includeExtras,
      userInteractions,
    );

    // Get related items if requested
    if (includeRelated) {
      const relatedItems = await this.foodItemsRepository.findRelated(
        item._id.toString(),
        relatedLimit,
      );

      // Get user interactions for related items if userId provided
      let relatedInteractionsMap: Map<string, Set<string>> | null = null;
      if (userId) {
        const relatedIds = relatedItems.map((relatedItem) => relatedItem._id);
        relatedInteractionsMap =
          await this.foodItemsRepository.getUserInteractionsForItems(
            userId,
            relatedIds,
          );
      }

      response.relatedItems = relatedItems.map((relatedItem) => {
        const relatedId = relatedItem._id.toString();
        const relatedInteractions = relatedInteractionsMap?.get(relatedId);
        return this.toFoodItemResponse(relatedItem, false, {
          isViewed: relatedInteractions?.has(InteractionType.VIEW) ?? false,
          isLiked: relatedInteractions?.has(InteractionType.LIKE) ?? false,
        });
      });
    }

    // Increment view count (fire and forget)
    this.foodItemsRepository
      .incrementViewCount(item._id.toString())
      .catch(() => {
        // Silently ignore errors
      });

    // Create VIEW interaction for authenticated users (fire and forget)
    if (userId) {
      this.foodItemsRepository
        .createOrUpdateInteraction(
          item._id.toString(),
          userId,
          InteractionType.VIEW,
        )
        .catch(() => {
          // Silently ignore errors
        });
    }

    return {
      success: true,
      data: response,
    };
  }

  async search(searchDto: SearchFoodItemsDto, userId?: string) {
    const { q, filter, ...filterDto } = searchDto;

    let foodItemIds: Types.ObjectId[] | undefined;

    // Handle user-specific filters
    if (filter === SearchFilter.SAVED) {
      if (!userId) {
        throw new UnauthorizedException(
          'Authentication required to filter saved items',
        );
      }
      // Get liked (saved) food item IDs
      foodItemIds = await this.foodItemsRepository.getLikedFoodItemIds(userId);
    } else if (filter === SearchFilter.PREVIOUSLY_ORDERED) {
      if (!userId) {
        throw new UnauthorizedException(
          'Authentication required to filter previously ordered items',
        );
      }
      // Get previously ordered food item IDs
      foodItemIds =
        await this.ordersRepository.getPreviouslyOrderedFoodItemIds(userId);
    }

    // Search with optional food item IDs filter
    const result = await this.foodItemsRepository.search(
      q,
      filterDto,
      foodItemIds,
    );

    // Get user interactions if userId provided
    let userInteractionsMap: Map<string, Set<string>> | null = null;
    if (userId) {
      const itemIds = result.items.map((item) => item._id);
      userInteractionsMap =
        await this.foodItemsRepository.getUserInteractionsForItems(
          userId,
          itemIds,
        );
    }

    return {
      success: true,
      data: {
        items: result.items.map((item) => {
          const itemId = item._id.toString();
          const interactions = userInteractionsMap?.get(itemId);
          return this.toFoodItemResponse(item, true, {
            isViewed: interactions?.has(InteractionType.VIEW) ?? false,
            isLiked: interactions?.has(InteractionType.LIKE) ?? false,
          });
        }),
        pagination: result.pagination,
      },
    };
  }

  async getCategories(includeCount = false, includeImage = false) {
    const categories: CategoryResponse[] = [
      {
        name: FoodCategory.FOOD,
        slug: 'food',
        displayName: 'Food',
        description: 'Main dishes and meals',
        sortOrder: 1,
      },
      {
        name: FoodCategory.PROTEIN,
        slug: 'protein',
        displayName: 'Protein',
        description: 'Protein-rich dishes',
        sortOrder: 2,
      },
      {
        name: FoodCategory.SIDE_MEAL,
        slug: 'side-meal',
        displayName: 'Side Meal',
        description: 'Side dishes and accompaniments',
        sortOrder: 3,
      },
      {
        name: FoodCategory.DRINKS,
        slug: 'drinks',
        displayName: 'Drinks',
        description: 'Beverages and drinks',
        sortOrder: 4,
      },
      {
        name: FoodCategory.ECONOMY,
        slug: 'economy',
        displayName: 'Economy',
        description: 'Budget-friendly options',
        sortOrder: 5,
      },
    ];

    // Add item counts if requested
    if (includeCount) {
      const counts = await this.foodItemsRepository.getCategoryItemCounts();
      categories.forEach((category) => {
        category.itemCount = counts[category.name] || 0;
      });
    }

    // Add category images if requested
    if (includeImage) {
      categories.forEach((category) => {
        // Placeholder image URLs - can be configured via environment or database
        category.imageUrl = `https://cdn.surespot.app/categories/${category.slug}.png`;
      });
    }

    return {
      success: true,
      data: {
        categories,
      },
    };
  }

  async createWithImage(
    file: Express.Multer.File | undefined,
    dto: CreateFoodItemDto,
  ) {
    let imageUrl: string;

    // If file is provided, upload it and use the uploaded URL
    if (file) {
      // Validate image type (allow common formats)
      const allowedTypes = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp',
      ];
      if (!allowedTypes.includes(file.mimetype)) {
        throw new BadRequestException({
          success: false,
          error: {
            code: 'INVALID_IMAGE_TYPE',
            message: 'Image must be JPEG, JPG, PNG, or WebP',
          },
        });
      }

      // Upload to Cloudinary
      const uploadResult = await this.cloudinaryService.uploadImage(file);
      imageUrl = (uploadResult as { secure_url: string }).secure_url;
    } else if (dto.imageUrl) {
      // Use provided imageUrl
      imageUrl = dto.imageUrl;
    } else {
      // If neither file nor imageUrl is provided, throw error
      throw new BadRequestException({
        success: false,
        error: {
          code: 'IMAGE_REQUIRED',
          message: 'Either an image file or imageUrl is required',
        },
      });
    }

    // Create food item with image URL (from file upload or provided URL)
    return this.create({
      ...dto,
      imageUrl,
    });
  }

  async create(dto: CreateFoodItemDto) {
    // Check if slug already exists
    const slugExists = await this.foodItemsRepository.checkSlugExists(dto.slug);
    if (slugExists) {
      throw new ConflictException({
        success: false,
        error: {
          code: 'SLUG_ALREADY_EXISTS',
          message: 'A food item with this slug already exists',
        },
      });
    }

    // Validate extras if provided
    let extrasIds: Types.ObjectId[] = [];
    if (dto.extras && dto.extras.length > 0) {
      extrasIds = dto.extras.map((id) => {
        if (!Types.ObjectId.isValid(id)) {
          throw new BadRequestException({
            success: false,
            error: {
              code: 'INVALID_EXTRA_ID',
              message: `Invalid extra ID: ${id}`,
            },
          });
        }
        return new Types.ObjectId(id);
      });
    }

    // Ensure imageUrl is provided (should be guaranteed by createWithImage, but TypeScript needs this)
    if (!dto.imageUrl) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'IMAGE_REQUIRED',
          message: 'Image URL is required',
        },
      });
    }

    const foodItem = await this.foodItemsRepository.create({
      name: dto.name,
      description: dto.description,
      slug: dto.slug,
      price: dto.price,
      currency: dto.currency || 'NGN',
      imageUrl: dto.imageUrl,
      imageUrls: dto.imageUrls,
      category: dto.category,
      tags: dto.tags?.map((tag) => tag.toUpperCase()),
      estimatedTime: dto.estimatedTime,
      isAvailable: dto.isAvailable,
      isActive: dto.isActive,
      extras: extrasIds,
      isPopular: dto.isPopular,
      sortOrder: dto.sortOrder,
    });

    return {
      success: true,
      message: 'Food item created successfully',
      data: this.toFoodItemResponse(foodItem, false),
    };
  }

  async update(id: string, dto: UpdateFoodItemDto) {
    // Check if food item exists
    const existing = await this.foodItemsRepository.findById(id, false);
    if (!existing) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'FOOD_ITEM_NOT_FOUND',
          message: 'Food item not found',
        },
      });
    }

    // Check slug uniqueness if being updated
    if (dto.slug && dto.slug !== existing.slug) {
      const slugExists = await this.foodItemsRepository.checkSlugExists(
        dto.slug,
        id,
      );
      if (slugExists) {
        throw new ConflictException({
          success: false,
          error: {
            code: 'SLUG_ALREADY_EXISTS',
            message: 'A food item with this slug already exists',
          },
        });
      }
    }

    // Validate extras if provided
    let extrasIds: Types.ObjectId[] | undefined;
    if (dto.extras) {
      extrasIds = dto.extras.map((extraId) => {
        if (!Types.ObjectId.isValid(extraId)) {
          throw new BadRequestException({
            success: false,
            error: {
              code: 'INVALID_EXTRA_ID',
              message: `Invalid extra ID: ${extraId}`,
            },
          });
        }
        return new Types.ObjectId(extraId);
      });
    }

    const updateData: any = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.slug !== undefined) updateData.slug = dto.slug;
    if (dto.price !== undefined) updateData.price = dto.price;
    if (dto.currency !== undefined) updateData.currency = dto.currency;
    if (dto.imageUrl !== undefined) updateData.imageUrl = dto.imageUrl;
    if (dto.imageUrls !== undefined) updateData.imageUrls = dto.imageUrls;
    if (dto.category !== undefined) updateData.category = dto.category;
    if (dto.tags !== undefined)
      updateData.tags = dto.tags.map((tag) => tag.toUpperCase());
    if (dto.estimatedTime !== undefined)
      updateData.estimatedTime = dto.estimatedTime;
    if (dto.isAvailable !== undefined) updateData.isAvailable = dto.isAvailable;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;
    if (extrasIds !== undefined) updateData.extras = extrasIds;
    if (dto.isPopular !== undefined) updateData.isPopular = dto.isPopular;
    if (dto.sortOrder !== undefined) updateData.sortOrder = dto.sortOrder;

    const updated = await this.foodItemsRepository.update(id, updateData);

    if (!updated) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'UPDATE_FAILED',
          message: 'Failed to update food item',
        },
      });
    }

    return {
      success: true,
      message: 'Food item updated successfully',
      data: this.toFoodItemResponse(updated, true),
    };
  }

  async delete(id: string) {
    const deleted = await this.foodItemsRepository.delete(id);

    if (!deleted) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'FOOD_ITEM_NOT_FOUND',
          message: 'Food item not found',
        },
      });
    }

    return {
      success: true,
      message: 'Food item deleted successfully',
    };
  }

  async updateExtras(id: string, dto: UpdateFoodItemExtrasDto) {
    // Check if food item exists
    const existing = await this.foodItemsRepository.findById(id, false);
    if (!existing) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'FOOD_ITEM_NOT_FOUND',
          message: 'Food item not found',
        },
      });
    }

    // Validate all extra IDs
    const extrasIds = dto.extras.map((extraId) => {
      if (!Types.ObjectId.isValid(extraId)) {
        throw new BadRequestException({
          success: false,
          error: {
            code: 'INVALID_EXTRA_ID',
            message: `Invalid extra ID: ${extraId}`,
          },
        });
      }
      return new Types.ObjectId(extraId);
    });

    // Verify all extras exist
    const extras = await this.foodItemsRepository.findExtrasByIds(extrasIds);
    if (extras.length !== extrasIds.length) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'EXTRA_NOT_FOUND',
          message: 'One or more extras not found',
        },
      });
    }

    // Update extras
    const updated = await this.foodItemsRepository.updateExtras(id, extrasIds);

    if (!updated) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'UPDATE_FAILED',
          message: 'Failed to update food item extras',
        },
      });
    }

    return {
      success: true,
      message: 'Food item extras updated successfully',
      data: this.toFoodItemResponse(updated, true),
    };
  }

  // Food Extra CRUD methods
  async createExtra(dto: CreateFoodExtraDto) {
    const extra = await this.foodItemsRepository.createExtra({
      name: dto.name,
      description: dto.description,
      price: dto.price,
      currency: dto.currency || 'NGN',
      isAvailable: dto.isAvailable,
      category: dto.category,
      sortOrder: dto.sortOrder,
    });

    return {
      success: true,
      message: 'Food extra created successfully',
      data: this.toFoodExtraResponse(extra),
    };
  }

  async findAllExtras() {
    const extras = await this.foodItemsRepository.findAllExtras();

    return {
      success: true,
      data: {
        extras: extras.map((extra) => this.toFoodExtraResponse(extra)),
      },
    };
  }

  async findExtraById(id: string) {
    const extra = await this.foodItemsRepository.findExtraById(id);

    if (!extra) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'FOOD_EXTRA_NOT_FOUND',
          message: 'Food extra not found',
        },
      });
    }

    return {
      success: true,
      data: this.toFoodExtraResponse(extra),
    };
  }

  async updateExtra(id: string, dto: UpdateFoodExtraDto) {
    // Check if extra exists
    const existing = await this.foodItemsRepository.findExtraById(id);
    if (!existing) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'FOOD_EXTRA_NOT_FOUND',
          message: 'Food extra not found',
        },
      });
    }

    const updateData: any = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.price !== undefined) updateData.price = dto.price;
    if (dto.currency !== undefined) updateData.currency = dto.currency;
    if (dto.isAvailable !== undefined) updateData.isAvailable = dto.isAvailable;
    if (dto.category !== undefined) updateData.category = dto.category;
    if (dto.sortOrder !== undefined) updateData.sortOrder = dto.sortOrder;

    const updated = await this.foodItemsRepository.updateExtra(id, updateData);

    if (!updated) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'UPDATE_FAILED',
          message: 'Failed to update food extra',
        },
      });
    }

    return {
      success: true,
      message: 'Food extra updated successfully',
      data: this.toFoodExtraResponse(updated),
    };
  }

  async deleteExtra(id: string) {
    const deleted = await this.foodItemsRepository.deleteExtra(id);

    if (!deleted) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'FOOD_EXTRA_NOT_FOUND',
          message: 'Food extra not found',
        },
      });
    }

    return {
      success: true,
      message: 'Food extra deleted successfully',
    };
  }

  // Food Interaction methods
  async toggleInteraction(
    foodItemId: string,
    userId: string,
    dto: CreateFoodInteractionDto,
  ) {
    // Check if food item exists
    const foodItem = await this.foodItemsRepository.findById(foodItemId, false);
    if (!foodItem) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'FOOD_ITEM_NOT_FOUND',
          message: 'Food item not found',
        },
      });
    }

    // Check if interaction already exists
    const existing = await this.foodItemsRepository.getUserInteraction(
      foodItemId,
      userId,
    );

    // Check if the same interaction type already exists
    const hasSameInteraction =
      existing && existing.interactionType === dto.interactionType;

    if (hasSameInteraction) {
      // Remove interaction (toggle off)
      await this.foodItemsRepository.removeInteraction(
        foodItemId,
        userId,
        dto.interactionType,
      );

      return {
        success: true,
        message: 'Interaction removed successfully',
        data: {
          foodItemId,
          interactionType: dto.interactionType,
          isActive: false,
        },
      };
    } else {
      // Remove existing interaction if it's a different type (only one interaction type per item)
      if (existing) {
        await this.foodItemsRepository.removeInteraction(
          foodItemId,
          userId,
          existing.interactionType,
        );
      }

      // Create or update interaction
      await this.foodItemsRepository.createOrUpdateInteraction(
        foodItemId,
        userId,
        dto.interactionType,
      );

      // Auto-create VIEW interaction when LIKE is created
      if (dto.interactionType === InteractionType.LIKE) {
        await this.foodItemsRepository.createOrUpdateInteraction(
          foodItemId,
          userId,
          InteractionType.VIEW,
        );
      }

      return {
        success: true,
        message: 'Interaction created successfully',
        data: {
          foodItemId,
          interactionType: dto.interactionType,
          isActive: true,
        },
      };
    }
  }

  async getLikedFoodItems(
    userId: string,
    page: number = 1,
    limit: number = 20,
  ) {
    const result = await this.foodItemsRepository.findLikedFoodItems(
      userId,
      page,
      limit,
    );

    // All items are liked, but we still include interactions for consistency
    const itemIds = result.items.map((item) => item._id);
    const userInteractionsMap =
      await this.foodItemsRepository.getUserInteractionsForItems(
        userId,
        itemIds,
      );

    return {
      success: true,
      data: {
        items: result.items.map((item) => {
          const itemId = item._id.toString();
          const interactions = userInteractionsMap.get(itemId);
          return this.toFoodItemResponse(item, true, {
            isViewed: interactions?.has(InteractionType.VIEW) ?? false,
            isLiked: interactions?.has(InteractionType.LIKE) ?? false,
          });
        }),
        pagination: result.pagination,
      },
    };
  }

  async getViewedFoodItems(
    userId: string,
    page: number = 1,
    limit: number = 20,
  ) {
    const result = await this.foodItemsRepository.findViewedFoodItems(
      userId,
      page,
      limit,
    );

    // All items are viewed, but we still include interactions for consistency
    const itemIds = result.items.map((item) => item._id);
    const userInteractionsMap =
      await this.foodItemsRepository.getUserInteractionsForItems(
        userId,
        itemIds,
      );

    return {
      success: true,
      data: {
        items: result.items.map((item) => {
          const itemId = item._id.toString();
          const interactions = userInteractionsMap.get(itemId);
          return this.toFoodItemResponse(item, true, {
            isViewed: interactions?.has(InteractionType.VIEW) ?? false,
            isLiked: interactions?.has(InteractionType.LIKE) ?? false,
          });
        }),
        pagination: result.pagination,
      },
    };
  }
}

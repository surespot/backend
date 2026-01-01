/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  FoodItem,
  FoodItemDocument,
  FoodCategory,
} from './schemas/food-item.schema';
import { FoodExtra, FoodExtraDocument } from './schemas/food-extra.schema';
import {
  FoodInteraction,
  FoodInteractionDocument,
  InteractionType,
} from './schemas/food-interaction.schema';
import {
  GetFoodItemsFilterDto,
  SortBy,
  SortOrder,
} from './dto/get-food-items-filter.dto';

export interface PaginationResult<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

@Injectable()
export class FoodItemsRepository {
  constructor(
    @InjectModel(FoodItem.name)
    private readonly foodItemModel: Model<FoodItemDocument>,
    @InjectModel(FoodExtra.name)
    private readonly foodExtraModel: Model<FoodExtraDocument>,
    @InjectModel(FoodInteraction.name)
    private readonly foodInteractionModel: Model<FoodInteractionDocument>,
  ) {}

  private validateObjectId(id: string, fieldName: string): void {
    if (!id || !Types.ObjectId.isValid(id)) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'INVALID_ID_FORMAT',
          message: `Invalid ${fieldName} format. Must be a valid MongoDB ObjectId.`,
        },
      });
    }
  }

  private buildSortQuery(
    sortBy: SortBy,
    sortOrder: SortOrder,
    category?: string,
    isPopular?: boolean,
  ): Record<string, 1 | -1> {
    const order = sortOrder === SortOrder.ASC ? 1 : -1;

    // Special handling: when isPopular=true, sort by viewCount descending
    if (isPopular === true) {
      return { viewCount: -1 };
    }

    switch (sortBy) {
      case SortBy.PRICE:
        return { price: order };
      case SortBy.RATING:
        return { averageRating: order, ratingCount: -1 };
      case SortBy.POPULARITY:
        // For popular items: orderCount DESC, averageRating DESC
        return { orderCount: -1, averageRating: -1 };
      case SortBy.NEWEST:
        return { createdAt: -1 };
      case SortBy.NAME:
        return { name: order };
      case SortBy.FASTEST:
        // For Quick Bites: estimatedTime.min ASC (fastest first)
        return { 'estimatedTime.min': 1, 'estimatedTime.max': 1 };
      case SortBy.DEFAULT:
      default:
        // Category pages: sortOrder ASC, then orderCount DESC
        if (category) {
          return { sortOrder: 1, orderCount: -1 };
        }
        // Default: isPopular first, then sortOrder, then orderCount, then createdAt
        return { isPopular: -1, sortOrder: 1, orderCount: -1, createdAt: -1 };
    }
  }

  async findAll(
    filter: GetFoodItemsFilterDto,
  ): Promise<PaginationResult<FoodItemDocument>> {
    const {
      page = 1,
      limit = 20,
      category,
      tags,
      minPrice,
      maxPrice,
      minRating,
      isAvailable = true,
      isPopular,
      sortBy = SortBy.DEFAULT,
      sortOrder = SortOrder.ASC,
      search,
    } = filter;

    // Build query
    const query: any = { isActive: true };

    if (isAvailable !== undefined) {
      query.isAvailable = isAvailable;
    }

    // Special handling for fastest: filter to Side Meal and Protein categories only
    if (sortBy === SortBy.FASTEST) {
      query.category = { $in: [FoodCategory.SIDE_MEAL, FoodCategory.PROTEIN] };
    } else if (category) {
      query.category = category;
    }

    if (tags) {
      const tagArray = tags.split(',').map((tag) => tag.trim().toUpperCase());
      query.tags = { $in: tagArray };
    }

    if (minPrice !== undefined || maxPrice !== undefined) {
      query.price = {};
      if (minPrice !== undefined) {
        query.price.$gte = minPrice;
      }
      if (maxPrice !== undefined) {
        query.price.$lte = maxPrice;
      }
    }

    if (minRating !== undefined) {
      query.averageRating = { $gte: minRating };
    }

    // isPopular is now used for sorting by viewCount, not filtering
    // Remove the filter logic for isPopular

    if (search) {
      query.$text = { $search: search };
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Get total count
    const total = await this.foodItemModel.countDocuments(query);

    // Build sort
    // Special handling for popular items: sort by viewCount descending
    let finalSortBy = sortBy;
    if (isPopular === true) {
      // When isPopular=true, sort by viewCount descending
      finalSortBy = SortBy.DEFAULT; // We'll handle this in buildSortQuery
    }
    const sort = this.buildSortQuery(
      finalSortBy,
      sortOrder,
      category,
      isPopular,
    );

    // Execute query with pagination
    const items = await this.foodItemModel
      .find(query)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate('extras')
      .exec();

    const totalPages = Math.ceil(total / limit);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  async findById(
    id: string,
    populateExtras = true,
  ): Promise<FoodItemDocument | null> {
    // Try to find by ObjectId first
    if (Types.ObjectId.isValid(id)) {
      const query = this.foodItemModel.findById(id);
      if (populateExtras) {
        query.populate('extras');
      }
      const item = await query.exec();
      if (item) return item;
    }

    // If not found or invalid ObjectId, try to find by slug
    const query = this.foodItemModel.findOne({ slug: id, isActive: true });
    if (populateExtras) {
      query.populate('extras');
    }
    return query.exec();
  }

  async getLikedFoodItemIds(userId: string): Promise<Types.ObjectId[]> {
    this.validateObjectId(userId, 'userId');

    const likedInteractions = await this.foodInteractionModel
      .find({
        userId: new Types.ObjectId(userId),
        interactionType: InteractionType.LIKE,
      })
      .select('foodItemId')
      .exec();

    return likedInteractions.map((interaction) => interaction.foodItemId);
  }

  async search(
    query: string,
    filter: GetFoodItemsFilterDto,
    foodItemIds?: Types.ObjectId[],
  ): Promise<PaginationResult<FoodItemDocument>> {
    const {
      page = 1,
      limit = 20,
      category,
      tags,
      minPrice,
      maxPrice,
      minRating,
      isAvailable = true,
      sortBy = SortBy.RELEVANCE,
      sortOrder = SortOrder.ASC,
    } = filter;

    // Build search query with text search
    const searchQuery: any = {
      isActive: true,
      $text: { $search: query },
    };

    // Filter by food item IDs if provided (for saved/previously ordered filters)
    if (foodItemIds && foodItemIds.length > 0) {
      searchQuery._id = { $in: foodItemIds };
    } else if (foodItemIds && foodItemIds.length === 0) {
      // If empty array provided, return empty results
      return {
        items: [],
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false,
        },
      };
    }

    if (isAvailable !== undefined) {
      searchQuery.isAvailable = isAvailable;
    }

    if (category) {
      searchQuery.category = category;
    }

    if (tags) {
      const tagArray = tags.split(',').map((tag) => tag.trim().toUpperCase());
      searchQuery.tags = { $in: tagArray };
    }

    if (minPrice !== undefined || maxPrice !== undefined) {
      searchQuery.price = {};
      if (minPrice !== undefined) {
        searchQuery.price.$gte = minPrice;
      }
      if (maxPrice !== undefined) {
        searchQuery.price.$lte = maxPrice;
      }
    }

    if (minRating !== undefined) {
      searchQuery.averageRating = { $gte: minRating };
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Get total count
    const total = await this.foodItemModel.countDocuments(searchQuery);

    // Build sort (relevance score for text search, then custom sort)
    let sort: Record<string, 1 | -1 | { $meta: string }> = {
      score: { $meta: 'textScore' },
    };

    // For search, if sortBy is relevance or default, use text score only
    // Otherwise, apply secondary sort
    if (sortBy !== SortBy.DEFAULT && sortBy !== SortBy.RELEVANCE) {
      sort = { ...sort, ...this.buildSortQuery(sortBy, sortOrder, category) };
    }
    // If sortBy is relevance or default, MongoDB text search score is primary
    // MongoDB text search automatically scores by:
    // - Exact matches (highest)
    // - Name matches (high)
    // - Description matches (medium)
    // - Tag matches (medium)

    // Execute query with pagination
    const items = await this.foodItemModel
      .find(searchQuery, { score: { $meta: 'textScore' } })
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate('extras')
      .exec();

    const totalPages = Math.ceil(total / limit);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  async findRelated(
    itemId: string,
    limit: number = 3,
  ): Promise<FoodItemDocument[]> {
    this.validateObjectId(itemId, 'itemId');

    // Get the current item to find similar items
    const currentItem = await this.foodItemModel.findById(itemId).exec();
    if (!currentItem) {
      return [];
    }

    // Find items with same category or overlapping tags
    const relatedItems = await this.foodItemModel
      .find({
        _id: { $ne: new Types.ObjectId(itemId) },
        isActive: true,
        isAvailable: true,
        $or: [
          { category: currentItem.category },
          { tags: { $in: currentItem.tags } },
        ],
      })
      .sort({ orderCount: -1, averageRating: -1 })
      .limit(limit)
      .exec();

    return relatedItems;
  }

  async incrementViewCount(id: string): Promise<void> {
    this.validateObjectId(id, 'itemId');
    await this.foodItemModel
      .findByIdAndUpdate(id, { $inc: { viewCount: 1 } })
      .exec();
  }

  async getCategoryItemCounts(): Promise<Record<string, number>> {
    const result = await this.foodItemModel
      .aggregate([
        {
          $match: {
            isActive: true,
            isAvailable: true,
          },
        },
        {
          $group: {
            _id: '$category',
            count: { $sum: 1 },
          },
        },
      ])
      .exec();

    const counts: Record<string, number> = {};
    result.forEach((item: { _id: string; count: number }) => {
      counts[item._id] = item.count;
    });

    return counts;
  }

  async findExtrasByIds(ids: Types.ObjectId[]): Promise<FoodExtraDocument[]> {
    return this.foodExtraModel
      .find({
        _id: { $in: ids },
        isActive: true,
        isAvailable: true,
      })
      .sort({ sortOrder: 1, name: 1 })
      .exec();
  }

  async create(data: {
    name: string;
    description: string;
    slug: string;
    price: number;
    currency?: string;
    imageUrl: string;
    imageUrls?: string[];
    category: string;
    tags?: string[];
    estimatedTime: { min: number; max: number };
    isAvailable?: boolean;
    isActive?: boolean;
    extras?: Types.ObjectId[];
    isPopular?: boolean;
    sortOrder?: number;
  }): Promise<FoodItemDocument> {
    const foodItem = new this.foodItemModel({
      ...data,
      currency: data.currency || 'NGN',
      imageUrls: data.imageUrls || [],
      tags: data.tags || [],
      isAvailable: data.isAvailable ?? true,
      isActive: data.isActive ?? true,
      extras: data.extras || [],
      isPopular: data.isPopular ?? false,
      sortOrder: data.sortOrder ?? 0,
      averageRating: 0,
      ratingCount: 0,
      viewCount: 0,
      orderCount: 0,
    });
    return foodItem.save();
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      description: string;
      slug: string;
      price: number;
      currency: string;
      imageUrl: string;
      imageUrls: string[];
      category: string;
      tags: string[];
      estimatedTime: { min: number; max: number };
      isAvailable: boolean;
      isActive: boolean;
      extras: Types.ObjectId[];
      isPopular: boolean;
      sortOrder: number;
    }>,
  ): Promise<FoodItemDocument | null> {
    this.validateObjectId(id, 'foodItemId');
    return this.foodItemModel
      .findByIdAndUpdate(id, data, { new: true })
      .populate('extras')
      .exec();
  }

  async delete(id: string): Promise<boolean> {
    this.validateObjectId(id, 'foodItemId');
    const result = await this.foodItemModel.deleteOne({
      _id: new Types.ObjectId(id),
    });
    return result.deletedCount > 0;
  }

  async checkSlugExists(slug: string, excludeId?: string): Promise<boolean> {
    const query: any = { slug };
    if (excludeId && Types.ObjectId.isValid(excludeId)) {
      query._id = { $ne: new Types.ObjectId(excludeId) };
    }
    const count = await this.foodItemModel.countDocuments(query);
    return count > 0;
  }

  async updateExtras(
    id: string,
    extrasIds: Types.ObjectId[],
  ): Promise<FoodItemDocument | null> {
    this.validateObjectId(id, 'foodItemId');
    return this.foodItemModel
      .findByIdAndUpdate(id, { extras: extrasIds }, { new: true })
      .populate('extras')
      .exec();
  }

  // Food Extra CRUD methods
  async createExtra(data: {
    name: string;
    description?: string;
    price: number;
    currency?: string;
    isAvailable?: boolean;
    category?: string;
    sortOrder?: number;
  }): Promise<FoodExtraDocument> {
    const extra = new this.foodExtraModel({
      ...data,
      currency: data.currency || 'NGN',
      isAvailable: data.isAvailable ?? true,
      isActive: true,
      sortOrder: data.sortOrder ?? 0,
    });
    return extra.save();
  }

  async findExtraById(id: string): Promise<FoodExtraDocument | null> {
    this.validateObjectId(id, 'extraId');
    return this.foodExtraModel.findById(id).exec();
  }

  async findAllExtras(): Promise<FoodExtraDocument[]> {
    return this.foodExtraModel
      .find({ isActive: true })
      .sort({ sortOrder: 1, name: 1 })
      .exec();
  }

  async updateExtra(
    id: string,
    data: Partial<{
      name: string;
      description: string;
      price: number;
      currency: string;
      isAvailable: boolean;
      category: string;
      sortOrder: number;
    }>,
  ): Promise<FoodExtraDocument | null> {
    this.validateObjectId(id, 'extraId');
    return this.foodExtraModel
      .findByIdAndUpdate(id, data, { new: true })
      .exec();
  }

  async deleteExtra(id: string): Promise<boolean> {
    this.validateObjectId(id, 'extraId');
    const result = await this.foodExtraModel.deleteOne({
      _id: new Types.ObjectId(id),
    });
    return result.deletedCount > 0;
  }

  // Food Interaction methods
  async createOrUpdateInteraction(
    foodItemId: string,
    userId: string,
    interactionType: string,
  ): Promise<FoodInteractionDocument> {
    this.validateObjectId(foodItemId, 'foodItemId');
    this.validateObjectId(userId, 'userId');

    return this.foodInteractionModel.findOneAndUpdate(
      {
        foodItemId: new Types.ObjectId(foodItemId),
        userId: new Types.ObjectId(userId),
        interactionType,
      },
      {
        foodItemId: new Types.ObjectId(foodItemId),
        userId: new Types.ObjectId(userId),
        interactionType,
      },
      { upsert: true, new: true },
    );
  }

  async removeInteraction(
    foodItemId: string,
    userId: string,
    interactionType: string,
  ): Promise<boolean> {
    this.validateObjectId(foodItemId, 'foodItemId');
    this.validateObjectId(userId, 'userId');

    const result = await this.foodInteractionModel.deleteOne({
      foodItemId: new Types.ObjectId(foodItemId),
      userId: new Types.ObjectId(userId),
      interactionType,
    });

    return result.deletedCount > 0;
  }

  async getUserInteractionsForItems(
    userId: string,
    foodItemIds: Types.ObjectId[],
  ): Promise<Map<string, Set<string>>> {
    this.validateObjectId(userId, 'userId');

    const interactions = await this.foodInteractionModel
      .find({
        userId: new Types.ObjectId(userId),
        foodItemId: { $in: foodItemIds },
      })
      .exec();

    // Map: foodItemId -> Set of interaction types
    const interactionMap = new Map<string, Set<string>>();

    interactions.forEach((interaction) => {
      const itemId = interaction.foodItemId.toString();
      if (!interactionMap.has(itemId)) {
        interactionMap.set(itemId, new Set());
      }
      interactionMap.get(itemId)?.add(interaction.interactionType);
    });

    return interactionMap;
  }

  async getUserInteraction(
    foodItemId: string,
    userId: string,
  ): Promise<FoodInteractionDocument | null> {
    this.validateObjectId(foodItemId, 'foodItemId');
    this.validateObjectId(userId, 'userId');

    return this.foodInteractionModel
      .findOne({
        foodItemId: new Types.ObjectId(foodItemId),
        userId: new Types.ObjectId(userId),
      })
      .exec();
  }

  async findLikedFoodItems(
    userId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<PaginationResult<FoodItemDocument>> {
    this.validateObjectId(userId, 'userId');

    // Find all LIKE interactions for this user
    const likedInteractions = await this.foodInteractionModel
      .find({
        userId: new Types.ObjectId(userId),
        interactionType: InteractionType.LIKE,
      })
      .select('foodItemId')
      .exec();

    const foodItemIds = likedInteractions.map(
      (interaction) => interaction.foodItemId,
    );

    if (foodItemIds.length === 0) {
      return {
        items: [],
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false,
        },
      };
    }

    // Calculate pagination
    const skip = (page - 1) * limit;
    const total = foodItemIds.length;

    // Fetch food items
    const items = await this.foodItemModel
      .find({
        _id: { $in: foodItemIds },
        isActive: true,
      })
      .populate('extras')
      .sort({ createdAt: -1 }) // Most recently liked first
      .skip(skip)
      .limit(limit)
      .exec();

    const totalPages = Math.ceil(total / limit);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  async findViewedFoodItems(
    userId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<PaginationResult<FoodItemDocument>> {
    this.validateObjectId(userId, 'userId');

    // Find all VIEW interactions for this user, ordered by most recently viewed first
    const viewedInteractions = await this.foodInteractionModel
      .find({
        userId: new Types.ObjectId(userId),
        interactionType: InteractionType.VIEW,
      })
      .select('foodItemId')
      .sort({ updatedAt: -1 }) // Most recently viewed first
      .exec();

    const foodItemIds = viewedInteractions.map(
      (interaction) => interaction.foodItemId,
    );

    if (foodItemIds.length === 0) {
      return {
        items: [],
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false,
        },
      };
    }

    // Calculate pagination
    const skip = (page - 1) * limit;
    const total = foodItemIds.length;
    const paginatedIds = foodItemIds.slice(skip, skip + limit);

    // Fetch food items maintaining the order from interactions
    const itemsMap = new Map<string, FoodItemDocument>();
    const items = await this.foodItemModel
      .find({
        _id: { $in: paginatedIds },
        isActive: true,
      })
      .populate('extras')
      .exec();

    // Create a map for quick lookup
    items.forEach((item) => {
      itemsMap.set(item._id.toString(), item);
    });

    // Maintain the order from interactions
    const orderedItems = paginatedIds
      .map((id) => itemsMap.get(id.toString()))
      .filter((item) => item !== undefined) as FoodItemDocument[];

    const totalPages = Math.ceil(total / limit);

    return {
      items: orderedItems,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }
}

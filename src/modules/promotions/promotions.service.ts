import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { PromotionsRepository } from './promotions.repository';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';
import { RestartPromotionDto } from './dto/restart-promotion.dto';
import { GetPromotionsFilterDto } from './dto/get-promotions-filter.dto';
import { PromotionDocument } from './schemas/promotion.schema';
import { STORAGE_SERVICE } from '../../common/storage/storage.constants';
import type { IStorageService } from '../../common/storage/interfaces/storage.interface';
import { FoodItemsRepository } from '../food-items/food-items.repository';
import { calculateBenefit, validateBenefitFields } from './discount-calculator';

export interface ValidateDiscountContext {
  orderAmount: number;
  deliveryFee?: number;
  cartItems?: Array<{
    foodItemId: string;
    quantity: number;
    price: number;
    lineTotal: number;
  }>;
}

export interface ValidateDiscountResult {
  valid: boolean;
  discountAmount?: number;
  message?: string;
  waivesDelivery?: boolean;
  promotion?: {
    id: string;
    name: string;
    discountType?: string;
    discountValue?: number;
  };
}

@Injectable()
export class PromotionsService {
  constructor(
    private readonly promotionsRepository: PromotionsRepository,
    @Inject(STORAGE_SERVICE) private readonly storageService: IStorageService,
    private readonly foodItemsRepository: FoodItemsRepository,
  ) {}

  private ensureValidDateRange(activeFrom: Date, activeTo: Date): void {
    if (activeFrom >= activeTo) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'PROMOTION_INVALID_DATES',
          message: '`activeFrom` must be before `activeTo`',
        },
      });
    }
  }

  private validateDiscountFields(
    dto: CreatePromotionDto | UpdatePromotionDto,
  ): void {
    validateBenefitFields(dto, 'PROMOTION');
  }

  private toResponse(promotion: PromotionDocument) {
    return {
      id: promotion._id.toString(),
      imageUrl: promotion.imageUrl,
      name: promotion.name,
      activeFrom: promotion.activeFrom,
      activeTo: promotion.activeTo,
      status: promotion.status,
      linkTo: promotion.linkTo,
      discountCode: promotion.discountCode,
      discountType: promotion.discountType,
      discountValue: promotion.discountValue,
      minOrderAmount: promotion.minOrderAmount,
      maxDiscountAmount: promotion.maxDiscountAmount,
      targetCategory: promotion.targetCategory,
      targetFoodItemIds: promotion.targetFoodItemIds?.map((id) =>
        id.toString(),
      ),
      maxFreeQuantity: promotion.maxFreeQuantity,
      buyQuantity: promotion.buyQuantity,
      getFreeQuantity: promotion.getFreeQuantity,
      maxRedeemablePerOrder: promotion.maxRedeemablePerOrder,
      usageCount: promotion.usageCount ?? 0,
      createdAt: promotion.createdAt,
      updatedAt: promotion.updatedAt,
    };
  }

  private parseDate(
    value: string | undefined,
    field: string,
  ): Date | undefined {
    if (!value) return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'PROMOTION_INVALID_DATE',
          message: `Invalid date value for ${field}`,
        },
      });
    }
    return date;
  }

  async createWithImage(
    file: Express.Multer.File | undefined,
    dto: CreatePromotionDto,
  ) {
    if (!file) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'PROMOTION_IMAGE_REQUIRED',
          message: 'Promotion image is required',
        },
      });
    }

    if (file.mimetype !== 'image/png') {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'PROMOTION_IMAGE_INVALID_TYPE',
          message: 'Promotion image must be a PNG file',
        },
      });
    }

    const uploadResult = await this.storageService.uploadImage(file);

    const activeFrom = this.parseDate(dto.activeFrom, 'activeFrom') as Date;
    const activeTo = this.parseDate(dto.activeTo, 'activeTo') as Date;
    this.ensureValidDateRange(activeFrom, activeTo);

    // Validate discount fields
    this.validateDiscountFields(dto);

    const promotion = await this.promotionsRepository.create({
      imageUrl: uploadResult.secure_url,
      name: dto.name,
      activeFrom,
      activeTo,
      status: dto.status ?? 'inactive',
      linkTo: dto.linkTo,
      discountCode: dto.discountCode,
      discountType: dto.discountType,
      discountValue: dto.discountValue,
      minOrderAmount: dto.minOrderAmount,
      maxDiscountAmount: dto.maxDiscountAmount,
      targetCategory: dto.targetCategory,
      targetFoodItemIds: dto.targetFoodItemIds?.length
        ? dto.targetFoodItemIds
            .filter((id) => Types.ObjectId.isValid(id))
            .map((id) => new Types.ObjectId(id))
        : undefined,
      maxFreeQuantity: dto.maxFreeQuantity,
      buyQuantity: dto.buyQuantity,
      getFreeQuantity: dto.getFreeQuantity,
      maxRedeemablePerOrder: dto.maxRedeemablePerOrder,
    });

    return {
      success: true,
      message: 'Promotion created successfully',
      data: this.toResponse(promotion),
    };
  }

  async getActive() {
    const now = new Date();
    const promotions = await this.promotionsRepository.findActive(now);

    return {
      success: true,
      message: 'Active promotions retrieved successfully',
      data: {
        promotions: promotions.map((p) => this.toResponse(p)),
      },
    };
  }

  async getAll(filter: GetPromotionsFilterDto) {
    const from = this.parseDate(filter.from, 'from');
    const to = this.parseDate(filter.to, 'to');

    if (from && to && from > to) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'PROMOTION_INVALID_FILTER_DATES',
          message: '`from` must be before or equal to `to`',
        },
      });
    }

    const promotions = await this.promotionsRepository.findAll({
      from,
      to,
    });

    return {
      success: true,
      message: 'Promotions retrieved successfully',
      data: {
        promotions: promotions.map((p) => this.toResponse(p)),
      },
    };
  }

  async update(
    id: string,
    dto: UpdatePromotionDto,
    file?: Express.Multer.File,
  ) {
    const existing = await this.promotionsRepository.findById(id);
    if (!existing) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'PROMOTION_NOT_FOUND',
          message: 'Promotion not found',
        },
      });
    }

    const updateData: Partial<Record<string, unknown>> = {};

    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.linkTo !== undefined) updateData.linkTo = dto.linkTo;
    if (dto.discountCode !== undefined) {
      updateData.discountCode = dto.discountCode;
    }

    // Validate discount fields if any are being updated
    const discountFieldsUpdated =
      dto.discountType !== undefined ||
      dto.discountValue !== undefined ||
      dto.minOrderAmount !== undefined ||
      dto.maxDiscountAmount !== undefined ||
      dto.targetCategory !== undefined ||
      dto.targetFoodItemIds !== undefined ||
      dto.maxFreeQuantity !== undefined ||
      dto.buyQuantity !== undefined ||
      dto.getFreeQuantity !== undefined ||
      dto.maxRedeemablePerOrder !== undefined;

    if (discountFieldsUpdated) {
      const discountDto = {
        discountType: dto.discountType ?? existing.discountType,
        discountValue: dto.discountValue ?? existing.discountValue,
        minOrderAmount: dto.minOrderAmount ?? existing.minOrderAmount,
        maxDiscountAmount: dto.maxDiscountAmount ?? existing.maxDiscountAmount,
        targetCategory: dto.targetCategory ?? existing.targetCategory,
        targetFoodItemIds:
          dto.targetFoodItemIds ??
          existing.targetFoodItemIds?.map((id) => id.toString()),
        maxFreeQuantity: dto.maxFreeQuantity ?? existing.maxFreeQuantity,
        buyQuantity: dto.buyQuantity ?? existing.buyQuantity,
        getFreeQuantity: dto.getFreeQuantity ?? existing.getFreeQuantity,
        maxRedeemablePerOrder:
          dto.maxRedeemablePerOrder ?? existing.maxRedeemablePerOrder,
      };
      this.validateDiscountFields(discountDto as UpdatePromotionDto);
    }

    if (dto.discountType !== undefined)
      updateData.discountType = dto.discountType;
    if (dto.discountValue !== undefined)
      updateData.discountValue = dto.discountValue;
    if (dto.minOrderAmount !== undefined)
      updateData.minOrderAmount = dto.minOrderAmount;
    if (dto.maxDiscountAmount !== undefined)
      updateData.maxDiscountAmount = dto.maxDiscountAmount;
    if (dto.targetCategory !== undefined)
      updateData.targetCategory = dto.targetCategory;
    if (dto.targetFoodItemIds !== undefined) {
      updateData.targetFoodItemIds = dto.targetFoodItemIds
        .filter((id) => Types.ObjectId.isValid(id))
        .map((id) => new Types.ObjectId(id));
    }
    if (dto.maxFreeQuantity !== undefined)
      updateData.maxFreeQuantity = dto.maxFreeQuantity;
    if (dto.buyQuantity !== undefined) updateData.buyQuantity = dto.buyQuantity;
    if (dto.getFreeQuantity !== undefined)
      updateData.getFreeQuantity = dto.getFreeQuantity;
    if (dto.maxRedeemablePerOrder !== undefined)
      updateData.maxRedeemablePerOrder = dto.maxRedeemablePerOrder;

    let activeFrom = existing.activeFrom;
    let activeTo = existing.activeTo;

    if (dto.activeFrom !== undefined) {
      activeFrom = this.parseDate(dto.activeFrom, 'activeFrom') as Date;
    }
    if (dto.activeTo !== undefined) {
      activeTo = this.parseDate(dto.activeTo, 'activeTo') as Date;
    }

    if (dto.activeFrom !== undefined || dto.activeTo !== undefined) {
      this.ensureValidDateRange(activeFrom, activeTo);
      updateData.activeFrom = activeFrom;
      updateData.activeTo = activeTo;
    }

    if (dto.status !== undefined) {
      // Simple rule: cannot move from ended back to active
      if (existing.status === 'ended' && dto.status === 'active') {
        throw new BadRequestException({
          success: false,
          error: {
            code: 'PROMOTION_STATUS_INVALID_TRANSITION',
            message: 'Cannot restart an ended promotion',
          },
        });
      }
      updateData.status = dto.status;
    }

    if (file) {
      if (file.mimetype !== 'image/png') {
        throw new BadRequestException({
          success: false,
          error: {
            code: 'PROMOTION_IMAGE_INVALID_TYPE',
            message: 'Promotion image must be a PNG file',
          },
        });
      }
      const uploadResult = await this.storageService.uploadImage(file);
      updateData.imageUrl = uploadResult.secure_url;
    }

    const updated = await this.promotionsRepository.update(id, updateData);

    if (!updated) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'PROMOTION_UPDATE_FAILED',
          message: 'Failed to update promotion',
        },
      });
    }

    return {
      success: true,
      message: 'Promotion updated successfully',
      data: this.toResponse(updated),
    };
  }

  async start(id: string) {
    const existing = await this.promotionsRepository.findById(id);
    if (!existing) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'PROMOTION_NOT_FOUND',
          message: 'Promotion not found',
        },
      });
    }

    if (existing.status === 'ended') {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'PROMOTION_STATUS_INVALID_TRANSITION',
          message: 'Cannot start an ended promotion',
        },
      });
    }

    const now = new Date();
    const activeFrom = now < existing.activeFrom ? now : existing.activeFrom;

    const updated = await this.promotionsRepository.update(id, {
      status: 'active',
      activeFrom,
    });

    return {
      success: true,
      message: 'Promotion started successfully',
      data: this.toResponse(updated as PromotionDocument),
    };
  }

  async end(id: string) {
    const existing = await this.promotionsRepository.findById(id);
    if (!existing) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'PROMOTION_NOT_FOUND',
          message: 'Promotion not found',
        },
      });
    }

    const now = new Date();
    const activeTo = now > existing.activeTo ? now : existing.activeTo;

    const updated = await this.promotionsRepository.update(id, {
      status: 'ended',
      activeTo,
    });

    return {
      success: true,
      message: 'Promotion ended successfully',
      data: this.toResponse(updated as PromotionDocument),
    };
  }

  async restart(id: string, dto: RestartPromotionDto) {
    const existing = await this.promotionsRepository.findById(id);
    if (!existing) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'PROMOTION_NOT_FOUND',
          message: 'Promotion not found',
        },
      });
    }

    if (existing.status !== 'ended') {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'PROMOTION_RESTART_ONLY_ENDED',
          message: 'Can only restart ended promotions',
        },
      });
    }

    const activeFrom = this.parseDate(dto.activeFrom, 'activeFrom') as Date;
    const activeTo = this.parseDate(dto.activeTo, 'activeTo') as Date;
    this.ensureValidDateRange(activeFrom, activeTo);

    const updated = await this.promotionsRepository.update(id, {
      activeFrom,
      activeTo,
      status: 'inactive',
    });

    return {
      success: true,
      message: 'Promotion restarted successfully with new dates',
      data: this.toResponse(updated as PromotionDocument),
    };
  }

  async delete(id: string) {
    const deleted = await this.promotionsRepository.delete(id);

    if (!deleted) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'PROMOTION_NOT_FOUND',
          message: 'Promotion not found',
        },
      });
    }

    return {
      success: true,
      message: 'Promotion deleted successfully',
    };
  }

  async runAutoStartEnd(): Promise<{ activated: number; ended: number }> {
    const now = new Date();
    const activated = await this.promotionsRepository.autoActivate(now);
    const ended = await this.promotionsRepository.autoEnd(now);
    return { activated, ended };
  }

  /**
   * Validate a discount code and calculate the discount amount
   * @param discountCode The discount code to validate
   * @param contextOrOrderAmount Context object or legacy orderAmount number
   */
  async validateDiscountCode(
    discountCode: string,
    contextOrOrderAmount: ValidateDiscountContext | number,
  ): Promise<ValidateDiscountResult> {
    const context: ValidateDiscountContext =
      typeof contextOrOrderAmount === 'number'
        ? { orderAmount: contextOrOrderAmount }
        : contextOrOrderAmount;

    const { orderAmount, deliveryFee, cartItems } = context;
    const now = new Date();
    const activePromotions = await this.promotionsRepository.findActive(now);

    const promotion = activePromotions.find(
      (p) => p.discountCode?.toUpperCase() === discountCode.toUpperCase(),
    );

    if (!promotion) {
      return {
        valid: false,
        message: 'Invalid or expired discount code',
      };
    }

    // Discount math is shared with special rewards (see discount-calculator.ts)
    const result = await calculateBenefit(
      promotion,
      { orderAmount, deliveryFee, cartItems },
      (ids) => this.foodItemsRepository.findCategoriesByIds(ids),
      'promotion',
    );

    if (!result.valid) {
      return { valid: false, message: result.message };
    }

    return {
      valid: true,
      discountAmount: result.discountAmount,
      waivesDelivery: result.waivesDelivery,
      promotion: {
        id: promotion._id.toString(),
        name: promotion.name,
        discountType: promotion.discountType,
        discountValue: promotion.discountValue,
      },
    };
  }

  /**
   * Increment the usage count of a promotion when a promo code is successfully used
   * @param promotionId The promotion ID to increment usage count for
   */
  async incrementPromoUsage(promotionId: string): Promise<void> {
    await this.promotionsRepository.incrementUsageCount(promotionId);
  }

  /**
   * Get a promotion by its discount code
   * @param discountCode The discount code to search for
   * @returns Promotion document or null
   */
  async getPromotionByDiscountCode(
    discountCode: string,
  ): Promise<PromotionDocument | null> {
    return this.promotionsRepository.findByDiscountCode(discountCode);
  }
}

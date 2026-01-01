import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PromotionsRepository } from './promotions.repository';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';
import { GetPromotionsFilterDto } from './dto/get-promotions-filter.dto';
import { PromotionDocument } from './schemas/promotion.schema';
import { CloudinaryService } from '../../common/cloudinary/cloudinary.service';

@Injectable()
export class PromotionsService {
  constructor(
    private readonly promotionsRepository: PromotionsRepository,
    private readonly cloudinaryService: CloudinaryService,
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
    // If discountType is provided, discountValue must also be provided
    if (dto.discountType && dto.discountValue === undefined) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'PROMOTION_DISCOUNT_VALUE_REQUIRED',
          message: 'discountValue is required when discountType is provided',
        },
      });
    }

    // If discountValue is provided, discountType must also be provided
    if (dto.discountValue !== undefined && !dto.discountType) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'PROMOTION_DISCOUNT_TYPE_REQUIRED',
          message: 'discountType is required when discountValue is provided',
        },
      });
    }

    // Validate percentage discount
    if (dto.discountType === 'percentage') {
      if (
        dto.discountValue === undefined ||
        dto.discountValue < 0 ||
        dto.discountValue > 100
      ) {
        throw new BadRequestException({
          success: false,
          error: {
            code: 'PROMOTION_INVALID_PERCENTAGE',
            message: 'Percentage discount must be between 0 and 100',
          },
        });
      }
    }

    // Validate fixed amount discount
    if (dto.discountType === 'fixed_amount') {
      if (dto.discountValue === undefined || dto.discountValue <= 0) {
        throw new BadRequestException({
          success: false,
          error: {
            code: 'PROMOTION_INVALID_FIXED_AMOUNT',
            message: 'Fixed amount discount must be greater than 0',
          },
        });
      }
    }

    // maxDiscountAmount only makes sense for percentage discounts
    if (
      dto.maxDiscountAmount !== undefined &&
      dto.discountType !== 'percentage'
    ) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'PROMOTION_MAX_DISCOUNT_INVALID',
          message:
            'maxDiscountAmount is only applicable for percentage discounts',
        },
      });
    }
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

    const uploadResult = await this.cloudinaryService.uploadImage(file);

    const activeFrom = this.parseDate(dto.activeFrom, 'activeFrom') as Date;
    const activeTo = this.parseDate(dto.activeTo, 'activeTo') as Date;
    this.ensureValidDateRange(activeFrom, activeTo);

    // Validate discount fields
    this.validateDiscountFields(dto);

    const promotion = await this.promotionsRepository.create({
      imageUrl: (uploadResult as { secure_url: string }).secure_url,
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

    const updateData: {
      imageUrl?: string;
      name?: string;
      activeFrom?: Date;
      activeTo?: Date;
      status?: PromotionDocument['status'];
      linkTo?: string;
      discountCode?: string;
      discountType?: string;
      discountValue?: number;
      minOrderAmount?: number;
      maxDiscountAmount?: number;
    } = {};

    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.linkTo !== undefined) updateData.linkTo = dto.linkTo;
    if (dto.discountCode !== undefined) {
      updateData.discountCode = dto.discountCode;
    }

    // Validate discount fields if any are being updated
    if (
      dto.discountType !== undefined ||
      dto.discountValue !== undefined ||
      dto.minOrderAmount !== undefined ||
      dto.maxDiscountAmount !== undefined
    ) {
      // Merge existing discount fields with new ones for validation
      const discountDto = {
        discountType: dto.discountType ?? existing.discountType,
        discountValue: dto.discountValue ?? existing.discountValue,
        minOrderAmount: dto.minOrderAmount ?? existing.minOrderAmount,
        maxDiscountAmount: dto.maxDiscountAmount ?? existing.maxDiscountAmount,
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
      const uploadResult = await this.cloudinaryService.uploadImage(file);
      updateData.imageUrl = (uploadResult as { secure_url: string }).secure_url;
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
   * @param orderAmount The order amount in kobo
   * @returns Object with validation result and discount amount
   */
  async validateDiscountCode(
    discountCode: string,
    orderAmount: number,
  ): Promise<{
    valid: boolean;
    discountAmount?: number;
    message?: string;
    promotion?: {
      id: string;
      name: string;
      discountType?: string;
      discountValue?: number;
    };
  }> {
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

    // Check if promotion has discount configuration
    if (!promotion.discountType || promotion.discountValue === undefined) {
      return {
        valid: false,
        message: 'This promotion does not have discount configuration',
      };
    }

    // Check minimum order amount
    if (
      promotion.minOrderAmount !== undefined &&
      orderAmount < promotion.minOrderAmount
    ) {
      return {
        valid: false,
        message: `Minimum order amount of ₦${(promotion.minOrderAmount / 100).toFixed(2)} required`,
      };
    }

    // Calculate discount amount
    let discountAmount = 0;

    if (promotion.discountType === 'percentage') {
      discountAmount = (orderAmount * promotion.discountValue) / 100;
      // Apply max discount cap if set
      if (
        promotion.maxDiscountAmount !== undefined &&
        discountAmount > promotion.maxDiscountAmount
      ) {
        discountAmount = promotion.maxDiscountAmount;
      }
    } else if (promotion.discountType === 'fixed_amount') {
      discountAmount = promotion.discountValue;
      // Ensure discount doesn't exceed order amount
      if (discountAmount > orderAmount) {
        discountAmount = orderAmount;
      }
    }

    return {
      valid: true,
      discountAmount: Math.round(discountAmount),
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

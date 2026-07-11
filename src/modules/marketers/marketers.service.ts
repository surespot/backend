import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { MarketersRepository } from './marketers.repository';
import { CreateMarketerDto } from './dto/create-marketer.dto';
import { UpdateMarketerDto } from './dto/update-marketer.dto';
import { MarketerDocument } from './schemas/marketer.schema';
import { STORAGE_SERVICE } from '../../common/storage/storage.constants';
import type { IStorageService } from '../../common/storage/interfaces/storage.interface';
import { PromotionsRepository } from '../promotions/promotions.repository';
import { FoodItemsRepository } from '../food-items/food-items.repository';
import type { ValidateDiscountContext } from '../promotions/promotions.service';

export interface ValidateMarketerCodeResult {
  valid: boolean;
  discountAmount?: number;
  message?: string;
  waivesDelivery?: boolean;
  marketer?: {
    id: string;
    name: string;
    discountType?: string;
    discountValue?: number;
  };
}

@Injectable()
export class MarketersService {
  private readonly CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  private readonly CODE_LENGTH = 8;

  constructor(
    private readonly marketersRepository: MarketersRepository,
    private readonly promotionsRepository: PromotionsRepository,
    private readonly foodItemsRepository: FoodItemsRepository,
    @Inject(STORAGE_SERVICE) private readonly storageService: IStorageService,
  ) {}

  async create(file: Express.Multer.File | undefined, dto: CreateMarketerDto) {
    const code = dto.code ? dto.code.toUpperCase() : await this.generateCode();

    await this.assertCodeUnique(code);

    const profilePictureUrl = file
      ? (await this.storageService.uploadImage(file)).secure_url
      : undefined;

    const marketer = await this.marketersRepository.create({
      name: dto.name,
      email: dto.email,
      profilePictureUrl,
      isActive: true,
      code,
      discountType: dto.discountType,
      discountValue: dto.discountValue,
      minOrderAmount: dto.minOrderAmount,
      maxDiscountAmount: dto.maxDiscountAmount,
      targetCategory: dto.targetCategory,
      targetFoodItemIds: dto.targetFoodItemIds?.map((id) => new Types.ObjectId(id)),
      maxFreeQuantity: dto.maxFreeQuantity,
      buyQuantity: dto.buyQuantity,
      getFreeQuantity: dto.getFreeQuantity,
      maxRedeemablePerOrder: dto.maxRedeemablePerOrder,
      accountNumber: dto.accountNumber,
      bankCode: dto.bankCode,
      bankName: dto.bankName,
      accountName: dto.accountName,
    });

    return {
      success: true,
      message: 'Marketer created successfully',
      data: this.formatMarketer(marketer),
    };
  }

  async findAll() {
    const marketers = await this.marketersRepository.findAll();
    return {
      success: true,
      data: marketers.map((m) => this.formatMarketer(m)),
    };
  }

  async findById(id: string) {
    const marketer = await this.marketersRepository.findById(id);
    if (!marketer) {
      throw new NotFoundException({
        success: false,
        error: { code: 'MARKETER_NOT_FOUND', message: 'Marketer not found' },
      });
    }
    return {
      success: true,
      data: this.formatMarketer(marketer),
    };
  }

  async update(id: string, dto: UpdateMarketerDto, file?: Express.Multer.File) {
    const existing = await this.marketersRepository.findById(id);
    if (!existing) {
      throw new NotFoundException({
        success: false,
        error: { code: 'MARKETER_NOT_FOUND', message: 'Marketer not found' },
      });
    }

    const updateData: Partial<MarketerDocument> = { ...dto } as any;

    if (dto.code) {
      const normalized = dto.code.toUpperCase();
      if (normalized !== existing.code) {
        await this.assertCodeUnique(normalized);
      }
      updateData.code = normalized;
    }

    if (dto.targetFoodItemIds) {
      (updateData as any).targetFoodItemIds = dto.targetFoodItemIds.map(
        (id) => new Types.ObjectId(id),
      );
    }

    if (file) {
      const uploadResult = await this.storageService.uploadImage(file);
      (updateData as any).profilePictureUrl = uploadResult.secure_url;
    }

    const updated = await this.marketersRepository.update(id, updateData);

    return {
      success: true,
      message: 'Marketer updated successfully',
      data: this.formatMarketer(updated!),
    };
  }

  async delete(id: string) {
    const deleted = await this.marketersRepository.delete(id);
    if (!deleted) {
      throw new NotFoundException({
        success: false,
        error: { code: 'MARKETER_NOT_FOUND', message: 'Marketer not found' },
      });
    }
    return { success: true, message: 'Marketer deleted successfully' };
  }

  async generateUniqueCode(): Promise<string> {
    const code = await this.generateCode();
    return code;
  }

  async validateMarketerCode(
    code: string,
    userId: string,
    context: ValidateDiscountContext,
  ): Promise<ValidateMarketerCodeResult> {
    const { orderAmount, deliveryFee, cartItems } = context;

    const marketer = await this.marketersRepository.findByCode(code);

    if (!marketer || !marketer.isActive) {
      return { valid: false, message: 'Invalid or expired discount code' };
    }

    const existingUsage = await this.marketersRepository.findUsage(
      marketer._id.toString(),
      userId,
    );
    if (existingUsage) {
      return { valid: false, message: 'You have already used this code' };
    }

    if (
      marketer.minOrderAmount !== undefined &&
      orderAmount < marketer.minOrderAmount
    ) {
      return {
        valid: false,
        message: `Minimum order amount of ₦${(marketer.minOrderAmount / 100).toFixed(2)} required`,
      };
    }

    let discountAmount = 0;
    let waivesDelivery = false;

    switch (marketer.discountType) {
      case 'percentage':
        if (marketer.discountValue === undefined) {
          return { valid: false, message: 'This code does not have discount configuration' };
        }
        discountAmount = (orderAmount * marketer.discountValue) / 100;
        if (
          marketer.maxDiscountAmount !== undefined &&
          discountAmount > marketer.maxDiscountAmount
        ) {
          discountAmount = marketer.maxDiscountAmount;
        }
        break;

      case 'fixed_amount':
        if (marketer.discountValue === undefined) {
          return { valid: false, message: 'This code does not have discount configuration' };
        }
        discountAmount = Math.min(marketer.discountValue, orderAmount);
        break;

      case 'free_delivery':
        if (deliveryFee !== undefined && deliveryFee > 0) {
          discountAmount = deliveryFee;
        } else {
          waivesDelivery = true;
        }
        break;

      case 'free_category':
        discountAmount = await this.calcFreeCategoryDiscount(marketer, cartItems ?? []);
        break;

      case 'bogo':
        discountAmount = await this.calcBogoDiscount(marketer, cartItems ?? []);
        break;

      default:
        return { valid: false, message: 'Unknown discount type' };
    }

    return {
      valid: true,
      discountAmount: Math.round(discountAmount),
      waivesDelivery,
      marketer: {
        id: marketer._id.toString(),
        name: marketer.name,
        discountType: marketer.discountType,
        discountValue: marketer.discountValue,
      },
    };
  }

  async recordUsage(
    marketerId: string,
    userId: string,
    orderId: string,
    orderAmount: number,
    discountAmount: number,
  ): Promise<void> {
    await this.marketersRepository.createUsage({
      marketerId,
      userId,
      orderId,
      orderAmount,
      discountAmount,
    });
    await this.marketersRepository.incrementStats(marketerId, orderAmount);
  }

  async findByCode(code: string): Promise<MarketerDocument | null> {
    return this.marketersRepository.findByCode(code);
  }

  private async generateCode(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      let code = '';
      for (let i = 0; i < this.CODE_LENGTH; i++) {
        code += this.CODE_CHARS[Math.floor(Math.random() * this.CODE_CHARS.length)];
      }
      const takenByMarketer = await this.marketersRepository.codeExists(code);
      if (takenByMarketer) continue;

      const takenByPromo = await this.promotionsRepository.findByDiscountCode(code);
      if (!takenByPromo) return code;
    }
    throw new ConflictException({
      success: false,
      error: { code: 'CODE_GENERATION_FAILED', message: 'Could not generate a unique code. Please try again.' },
    });
  }

  private async assertCodeUnique(code: string): Promise<void> {
    const takenByMarketer = await this.marketersRepository.codeExists(code);
    if (takenByMarketer) {
      throw new ConflictException({
        success: false,
        error: { code: 'CODE_ALREADY_EXISTS', message: `Code "${code}" is already in use by another marketer` },
      });
    }
    const takenByPromo = await this.promotionsRepository.findByDiscountCode(code);
    if (takenByPromo) {
      throw new ConflictException({
        success: false,
        error: { code: 'CODE_ALREADY_EXISTS', message: `Code "${code}" is already in use by a promotion` },
      });
    }
  }

  private async calcFreeCategoryDiscount(
    marketer: MarketerDocument,
    cartItems: Array<{ foodItemId: string; quantity: number; price: number; lineTotal: number }>,
  ): Promise<number> {
    if (
      !marketer.targetCategory ||
      marketer.maxFreeQuantity === undefined ||
      cartItems.length === 0
    ) {
      return 0;
    }

    const categories = await this.foodItemsRepository.findCategoriesByIds(
      cartItems.map((i) => i.foodItemId),
    );

    const qualifying: Array<{ price: number }> = [];
    for (const item of cartItems) {
      const cat = categories.get(item.foodItemId);
      if (cat === marketer.targetCategory) {
        const unitPrice = item.quantity > 0 ? item.lineTotal / item.quantity : 0;
        for (let q = 0; q < item.quantity; q++) {
          qualifying.push({ price: unitPrice });
        }
      }
    }

    const totalCartItems = cartItems.reduce((sum, i) => sum + i.quantity, 0);
    qualifying.sort((a, b) => a.price - b.price);
    const toTake = Math.min(
      qualifying.length,
      marketer.maxFreeQuantity,
      Math.max(0, totalCartItems - 1),
    );
    return qualifying.slice(0, toTake).reduce((sum, u) => sum + u.price, 0);
  }

  private async calcBogoDiscount(
    marketer: MarketerDocument,
    cartItems: Array<{ foodItemId: string; quantity: number; price: number; lineTotal: number }>,
  ): Promise<number> {
    if (
      marketer.buyQuantity === undefined ||
      marketer.getFreeQuantity === undefined ||
      cartItems.length === 0
    ) {
      return 0;
    }

    const categories = await this.foodItemsRepository.findCategoriesByIds(
      cartItems.map((i) => i.foodItemId),
    );

    const targetIds = new Set(
      marketer.targetFoodItemIds?.map((id) => id.toString()) ?? [],
    );
    const targetCategory = marketer.targetCategory;

    const qualifies = (foodItemId: string, category: string | undefined): boolean => {
      if (targetIds.size > 0) return targetIds.has(foodItemId);
      return targetCategory !== undefined && category === targetCategory;
    };

    const units: Array<{ price: number }> = [];
    for (const item of cartItems) {
      const cat = categories.get(item.foodItemId);
      if (!qualifies(item.foodItemId, cat)) continue;
      const unitPrice = item.quantity > 0 ? item.lineTotal / item.quantity : 0;
      for (let q = 0; q < item.quantity; q++) {
        units.push({ price: unitPrice });
      }
    }

    const cycleSize = marketer.buyQuantity + marketer.getFreeQuantity;
    let freeUnits = Math.floor(units.length / cycleSize) * marketer.getFreeQuantity;
    if (marketer.maxRedeemablePerOrder !== undefined) {
      freeUnits = Math.min(freeUnits, marketer.maxRedeemablePerOrder);
    }

    units.sort((a, b) => a.price - b.price);
    return units.slice(0, freeUnits).reduce((sum, u) => sum + u.price, 0);
  }

  private formatMarketer(marketer: MarketerDocument) {
    const avgOrderValue =
      marketer.totalUses > 0
        ? Math.round(marketer.totalOrderValue / marketer.totalUses)
        : 0;

    return {
      id: marketer._id.toString(),
      name: marketer.name,
      email: marketer.email,
      profilePictureUrl: marketer.profilePictureUrl,
      isActive: marketer.isActive,
      code: marketer.code,
      discountType: marketer.discountType,
      discountValue: marketer.discountValue,
      minOrderAmount: marketer.minOrderAmount,
      maxDiscountAmount: marketer.maxDiscountAmount,
      targetCategory: marketer.targetCategory,
      targetFoodItemIds: marketer.targetFoodItemIds?.map((id) => id.toString()),
      maxFreeQuantity: marketer.maxFreeQuantity,
      buyQuantity: marketer.buyQuantity,
      getFreeQuantity: marketer.getFreeQuantity,
      maxRedeemablePerOrder: marketer.maxRedeemablePerOrder,
      bankDetails: {
        accountNumber: marketer.accountNumber,
        bankCode: marketer.bankCode,
        bankName: marketer.bankName,
        accountName: marketer.accountName,
      },
      stats: {
        totalUses: marketer.totalUses,
        totalOrderValue: marketer.totalOrderValue,
        avgOrderValue,
      },
      createdAt: marketer.createdAt,
      updatedAt: marketer.updatedAt,
    };
  }
}

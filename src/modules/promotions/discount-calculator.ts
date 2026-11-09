import { BadRequestException } from '@nestjs/common';
import type { DiscountType } from './types';

/**
 * The shape of a "benefit": what a promotion, marketer code or special reward
 * gives the customer. Promotion and RewardCampaign documents both satisfy it,
 * so a reward can be any of the existing promotion discount types.
 */
export interface BenefitDefinition {
  discountType?: DiscountType;
  discountValue?: number;
  minOrderAmount?: number;
  maxDiscountAmount?: number;
  targetCategory?: string;
  targetFoodItemIds?: Array<{ toString(): string }>;
  maxFreeQuantity?: number;
  buyQuantity?: number;
  getFreeQuantity?: number;
  maxRedeemablePerOrder?: number;
}

export interface BenefitContext {
  orderAmount: number;
  deliveryFee?: number;
  cartItems?: Array<{
    foodItemId: string;
    quantity: number;
    price: number;
    lineTotal: number;
  }>;
}

export interface BenefitResult {
  valid: boolean;
  message?: string;
  discountAmount?: number;
  waivesDelivery?: boolean;
}

/** Looks up the category of each food item id (used by category/BOGO rewards). */
export type CategoryLookup = (ids: string[]) => Promise<Map<string, string>>;

/**
 * Works out how much a benefit is worth on a given order. This is the single
 * implementation of the promotion discount types, shared by promotions and
 * special rewards. `noun` only changes the wording of error messages.
 */
export async function calculateBenefit(
  def: BenefitDefinition,
  context: BenefitContext,
  lookupCategories: CategoryLookup,
  noun: 'promotion' | 'reward' = 'promotion',
): Promise<BenefitResult> {
  const { orderAmount, deliveryFee, cartItems } = context;

  if (!def.discountType) {
    return {
      valid: false,
      message: `This ${noun} does not have discount configuration`,
    };
  }

  if (def.minOrderAmount !== undefined && orderAmount < def.minOrderAmount) {
    return {
      valid: false,
      message: `Minimum order amount of ₦${(def.minOrderAmount / 100).toFixed(2)} required`,
    };
  }

  let discountAmount = 0;
  let waivesDelivery = false;

  switch (def.discountType) {
    case 'percentage':
      if (def.discountValue === undefined) {
        return {
          valid: false,
          message: `This ${noun} does not have discount configuration`,
        };
      }
      discountAmount = (orderAmount * def.discountValue) / 100;
      if (
        def.maxDiscountAmount !== undefined &&
        discountAmount > def.maxDiscountAmount
      ) {
        discountAmount = def.maxDiscountAmount;
      }
      break;

    case 'fixed_amount':
      if (def.discountValue === undefined) {
        return {
          valid: false,
          message: `This ${noun} does not have discount configuration`,
        };
      }
      discountAmount = def.discountValue;
      if (discountAmount > orderAmount) {
        discountAmount = orderAmount;
      }
      break;

    case 'free_delivery':
      if (deliveryFee !== undefined && deliveryFee > 0) {
        discountAmount = deliveryFee;
      } else {
        waivesDelivery = true;
      }
      break;

    case 'free_category':
      discountAmount = await calcFreeCategoryDiscount(
        def,
        cartItems ?? [],
        lookupCategories,
      );
      break;

    case 'bogo':
      discountAmount = await calcBogoDiscount(
        def,
        cartItems ?? [],
        lookupCategories,
      );
      break;

    default:
      return { valid: false, message: 'Unknown promotion type' };
  }

  return {
    valid: true,
    discountAmount: Math.round(discountAmount),
    waivesDelivery,
  };
}

async function calcFreeCategoryDiscount(
  def: BenefitDefinition,
  cartItems: NonNullable<BenefitContext['cartItems']>,
  lookupCategories: CategoryLookup,
): Promise<number> {
  if (
    !def.targetCategory ||
    def.maxFreeQuantity === undefined ||
    cartItems.length === 0
  ) {
    return 0;
  }

  const categories = await lookupCategories(cartItems.map((i) => i.foodItemId));

  const qualifying: Array<{
    price: number;
    lineTotal: number;
    quantity: number;
  }> = [];
  for (const item of cartItems) {
    const cat = categories.get(item.foodItemId);
    if (cat === def.targetCategory) {
      const unitPrice = item.quantity > 0 ? item.lineTotal / item.quantity : 0;
      for (let q = 0; q < item.quantity; q++) {
        qualifying.push({
          price: unitPrice,
          lineTotal: unitPrice,
          quantity: 1,
        });
      }
    }
  }

  const totalCartItems = cartItems.reduce((sum, i) => sum + i.quantity, 0);
  qualifying.sort((a, b) => a.price - b.price);
  const toTake = Math.min(
    qualifying.length,
    def.maxFreeQuantity,
    Math.max(0, totalCartItems - 1),
  );
  return qualifying.slice(0, toTake).reduce((sum, u) => sum + u.price, 0);
}

async function calcBogoDiscount(
  def: BenefitDefinition,
  cartItems: NonNullable<BenefitContext['cartItems']>,
  lookupCategories: CategoryLookup,
): Promise<number> {
  if (
    def.buyQuantity === undefined ||
    def.getFreeQuantity === undefined ||
    cartItems.length === 0
  ) {
    return 0;
  }

  const categories = await lookupCategories(cartItems.map((i) => i.foodItemId));

  const targetIds = new Set(
    def.targetFoodItemIds?.map((id) => id.toString()) ?? [],
  );
  const targetCategory = def.targetCategory;

  const qualifies = (
    foodItemId: string,
    category: string | undefined,
  ): boolean => {
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

  const qualifyingCount = units.length;
  const cycleSize = def.buyQuantity + def.getFreeQuantity;
  let freeUnits = Math.floor(qualifyingCount / cycleSize) * def.getFreeQuantity;
  if (def.maxRedeemablePerOrder !== undefined) {
    freeUnits = Math.min(freeUnits, def.maxRedeemablePerOrder);
  }

  units.sort((a, b) => a.price - b.price);
  return units.slice(0, freeUnits).reduce((sum, u) => sum + u.price, 0);
}

/** The benefit fields shared by promotions and special reward campaigns. */
export interface BenefitFieldsInput
  extends Omit<BenefitDefinition, 'targetFoodItemIds'> {
  targetFoodItemIds?: string[];
}

/**
 * Validates that the benefit fields make sense together (e.g. a percentage
 * discount needs a value in 0-100, BOGO needs a target and quantities).
 * `prefix` namespaces the error codes: PROMOTION_* or REWARD_*.
 */
export function validateBenefitFields(
  dto: BenefitFieldsInput,
  prefix: 'PROMOTION' | 'REWARD' = 'PROMOTION',
): void {
  const needsDiscountValue = ['percentage', 'fixed_amount'].includes(
    dto.discountType ?? '',
  );
  if (needsDiscountValue && dto.discountValue === undefined) {
    throw new BadRequestException({
      success: false,
      error: {
        code: `${prefix}_DISCOUNT_VALUE_REQUIRED`,
        message: 'discountValue is required for percentage and fixed_amount',
      },
    });
  }

  if (dto.discountValue !== undefined && !dto.discountType) {
    throw new BadRequestException({
      success: false,
      error: {
        code: `${prefix}_DISCOUNT_TYPE_REQUIRED`,
        message: 'discountType is required when discountValue is provided',
      },
    });
  }

  if (dto.discountType === 'percentage') {
    if (
      dto.discountValue === undefined ||
      dto.discountValue < 0 ||
      dto.discountValue > 100
    ) {
      throw new BadRequestException({
        success: false,
        error: {
          code: `${prefix}_INVALID_PERCENTAGE`,
          message: 'Percentage discount must be between 0 and 100',
        },
      });
    }
  }

  if (dto.discountType === 'fixed_amount') {
    if (dto.discountValue === undefined || dto.discountValue <= 0) {
      throw new BadRequestException({
        success: false,
        error: {
          code: `${prefix}_INVALID_FIXED_AMOUNT`,
          message: 'Fixed amount discount must be greater than 0',
        },
      });
    }
  }

  if (dto.discountType === 'free_category') {
    if (!dto.targetCategory || dto.maxFreeQuantity === undefined) {
      throw new BadRequestException({
        success: false,
        error: {
          code: `${prefix}_FREE_CATEGORY_REQUIRED`,
          message:
            'targetCategory and maxFreeQuantity are required for free_category',
        },
      });
    }
  }

  if (dto.discountType === 'bogo') {
    const hasTarget =
      (dto.targetFoodItemIds && dto.targetFoodItemIds.length > 0) ||
      dto.targetCategory;
    if (
      !hasTarget ||
      dto.buyQuantity === undefined ||
      dto.getFreeQuantity === undefined
    ) {
      throw new BadRequestException({
        success: false,
        error: {
          code: `${prefix}_BOGO_REQUIRED`,
          message:
            'bogo requires buyQuantity, getFreeQuantity, and (targetFoodItemIds or targetCategory)',
        },
      });
    }
  }

  if (
    dto.maxDiscountAmount !== undefined &&
    dto.discountType !== 'percentage'
  ) {
    throw new BadRequestException({
      success: false,
      error: {
        code: `${prefix}_MAX_DISCOUNT_INVALID`,
        message:
          'maxDiscountAmount is only applicable for percentage discounts',
      },
    });
  }
}

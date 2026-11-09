import { calculateBenefit, validateBenefitFields } from './discount-calculator';

const categories = new Map([
  ['protein-1', 'Protein'],
  ['protein-2', 'Protein'],
  ['food-1', 'Food'],
  ['drink-1', 'Drinks'],
]);
const lookup = (ids: string[]) =>
  Promise.resolve(
    new Map(
      ids.filter((i) => categories.has(i)).map((i) => [i, categories.get(i)!]),
    ),
  );

const line = (foodItemId: string, quantity: number, unit: number) => ({
  foodItemId,
  quantity,
  price: unit,
  lineTotal: unit * quantity,
});

describe('calculateBenefit', () => {
  it('percentage: takes the percentage of the order amount', async () => {
    const r = await calculateBenefit(
      { discountType: 'percentage', discountValue: 5 },
      { orderAmount: 400000 },
      lookup,
    );
    expect(r).toEqual({
      valid: true,
      discountAmount: 20000,
      waivesDelivery: false,
    });
  });

  it('percentage: respects maxDiscountAmount', async () => {
    const r = await calculateBenefit(
      {
        discountType: 'percentage',
        discountValue: 50,
        maxDiscountAmount: 10000,
      },
      { orderAmount: 400000 },
      lookup,
    );
    expect(r.discountAmount).toBe(10000);
  });

  it('fixed_amount: never exceeds the order amount', async () => {
    const r = await calculateBenefit(
      { discountType: 'fixed_amount', discountValue: 500000 },
      { orderAmount: 300000 },
      lookup,
    );
    expect(r.discountAmount).toBe(300000);
  });

  it('free_delivery: discounts the delivery fee, or waives it when there is none yet', async () => {
    const withFee = await calculateBenefit(
      { discountType: 'free_delivery' },
      { orderAmount: 100000, deliveryFee: 80000 },
      lookup,
    );
    expect(withFee).toMatchObject({
      valid: true,
      discountAmount: 80000,
      waivesDelivery: false,
    });

    const noFee = await calculateBenefit(
      { discountType: 'free_delivery' },
      { orderAmount: 100000 },
      lookup,
    );
    expect(noFee).toMatchObject({
      valid: true,
      discountAmount: 0,
      waivesDelivery: true,
    });
  });

  it('free_category: makes the cheapest N items of the category free but never the whole cart', async () => {
    const def = {
      discountType: 'free_category' as const,
      targetCategory: 'Protein',
      maxFreeQuantity: 2,
    };
    const r = await calculateBenefit(
      def,
      {
        orderAmount: 0,
        cartItems: [
          line('food-1', 1, 200000),
          line('protein-1', 1, 50000),
          line('protein-2', 1, 80000),
        ],
      },
      lookup,
    );
    expect(r.discountAmount).toBe(130000);

    // Only proteins in the cart: at least one item must stay paid
    const onlyProtein = await calculateBenefit(
      def,
      { orderAmount: 0, cartItems: [line('protein-1', 2, 50000)] },
      lookup,
    );
    expect(onlyProtein.discountAmount).toBe(50000);
  });

  it('bogo: frees the cheapest qualifying units per cycle, capped by maxRedeemablePerOrder', async () => {
    const def = {
      discountType: 'bogo' as const,
      targetCategory: 'Drinks',
      buyQuantity: 1,
      getFreeQuantity: 1,
    };
    const r = await calculateBenefit(
      def,
      { orderAmount: 0, cartItems: [line('drink-1', 4, 30000)] },
      lookup,
    );
    expect(r.discountAmount).toBe(60000);

    const capped = await calculateBenefit(
      { ...def, maxRedeemablePerOrder: 1 },
      { orderAmount: 0, cartItems: [line('drink-1', 4, 30000)] },
      lookup,
    );
    expect(capped.discountAmount).toBe(30000);
  });

  it('rejects when the minimum order amount is not met', async () => {
    const r = await calculateBenefit(
      { discountType: 'percentage', discountValue: 5, minOrderAmount: 500000 },
      { orderAmount: 100000 },
      lookup,
    );
    expect(r.valid).toBe(false);
    expect(r.message).toContain('Minimum order amount');
  });

  it('rejects a benefit with no type, using the noun in the message', async () => {
    const r = await calculateBenefit(
      {},
      { orderAmount: 100 },
      lookup,
      'reward',
    );
    expect(r).toEqual({
      valid: false,
      message: 'This reward does not have discount configuration',
    });
  });
});

describe('validateBenefitFields', () => {
  it('accepts a sensible percentage and rejects out-of-range ones', () => {
    expect(() =>
      validateBenefitFields(
        { discountType: 'percentage', discountValue: 5 },
        'REWARD',
      ),
    ).not.toThrow();
    expect(() =>
      validateBenefitFields(
        { discountType: 'percentage', discountValue: 150 },
        'REWARD',
      ),
    ).toThrow();
  });

  it('namespaces error codes by prefix', () => {
    try {
      validateBenefitFields({ discountType: 'fixed_amount' }, 'REWARD');
      fail('should have thrown');
    } catch (e) {
      const body = (
        e as { getResponse: () => { error: { code: string } } }
      ).getResponse();
      expect(body.error.code).toBe('REWARD_DISCOUNT_VALUE_REQUIRED');
    }
  });

  it('requires targets and quantities for bogo and a max for percentage caps only on percentage', () => {
    expect(() => validateBenefitFields({ discountType: 'bogo' })).toThrow();
    expect(() =>
      validateBenefitFields({
        discountType: 'fixed_amount',
        discountValue: 100,
        maxDiscountAmount: 5,
      }),
    ).toThrow();
  });
});

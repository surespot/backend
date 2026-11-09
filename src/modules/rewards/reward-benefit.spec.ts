import { describeBenefit } from './reward-benefit';

describe('describeBenefit', () => {
  it('describes each benefit type in customer-friendly words', () => {
    expect(
      describeBenefit({ discountType: 'percentage', discountValue: 5 }),
    ).toBe('5% off');
    expect(
      describeBenefit({
        discountType: 'percentage',
        discountValue: 10,
        maxDiscountAmount: 100000,
      }),
    ).toBe('10% off (up to ₦1,000)');
    expect(
      describeBenefit({ discountType: 'fixed_amount', discountValue: 50000 }),
    ).toBe('₦500 off');
    expect(describeBenefit({ discountType: 'free_delivery' })).toBe(
      'Free delivery',
    );
    expect(
      describeBenefit({
        discountType: 'free_category',
        targetCategory: 'Drinks',
        maxFreeQuantity: 1,
      }),
    ).toBe('Up to 1 free Drinks');
    expect(
      describeBenefit({
        discountType: 'free_category',
        targetCategory: 'Protein',
        maxFreeQuantity: 2,
      }),
    ).toBe('Up to 2 free Proteins');
    expect(
      describeBenefit({
        discountType: 'bogo',
        buyQuantity: 2,
        getFreeQuantity: 1,
        targetCategory: 'Food',
      }),
    ).toBe('Buy 2, get 1 free Food');
  });
});

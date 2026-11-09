import type { BenefitDefinition } from '../promotions/discount-calculator';

const naira = (kobo: number): string =>
  `₦${(kobo / 100).toLocaleString('en-NG', { maximumFractionDigits: 2 })}`;

/** Short human-readable description of a reward's benefit, for the app and admin UI. */
export function describeBenefit(def: BenefitDefinition): string {
  switch (def.discountType) {
    case 'percentage': {
      const cap =
        def.maxDiscountAmount !== undefined
          ? ` (up to ${naira(def.maxDiscountAmount)})`
          : '';
      return `${def.discountValue ?? 0}% off${cap}`;
    }
    case 'fixed_amount':
      return `${naira(def.discountValue ?? 0)} off`;
    case 'free_delivery':
      return 'Free delivery';
    case 'free_category':
      return `Up to ${def.maxFreeQuantity ?? 0} free ${def.targetCategory ?? 'item'}${
        (def.maxFreeQuantity ?? 0) === 1 ? '' : 's'
      }`;
    case 'bogo': {
      const target = def.targetCategory ? ` ${def.targetCategory}` : '';
      return `Buy ${def.buyQuantity ?? 0}, get ${def.getFreeQuantity ?? 0} free${target}`;
    }
    default:
      return 'Special reward';
  }
}

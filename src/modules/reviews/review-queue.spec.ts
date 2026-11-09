import { Types } from 'mongoose';
import {
  REVIEW_WINDOW_MS,
  buildReviewQueue,
  isWithinReviewWindow,
} from './review-queue';

const oid = () => new Types.ObjectId();
const NOW = new Date('2026-11-10T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000);

const order = (num: string, deliveredHoursAgo: number) => ({
  _id: oid(),
  orderNumber: num,
  createdAt: hoursAgo(deliveredHoursAgo + 1),
  deliveredAt: hoursAgo(deliveredHoursAgo),
});
const item = (
  orderId: Types.ObjectId,
  foodItemId: Types.ObjectId,
  name = 'Jollof',
) => ({
  orderId,
  foodItemId,
  name,
  imageUrl: `https://img/${name}.png`,
  quantity: 1,
  createdAt: new Date(),
});

describe('isWithinReviewWindow', () => {
  it('is true up to two days after delivery and false after', () => {
    expect(isWithinReviewWindow(hoursAgo(1), NOW)).toBe(true);
    expect(isWithinReviewWindow(hoursAgo(47.9), NOW)).toBe(true);
    expect(
      isWithinReviewWindow(new Date(NOW.getTime() - REVIEW_WINDOW_MS - 1), NOW),
    ).toBe(false);
    expect(isWithinReviewWindow(undefined, NOW)).toBe(false);
  });
});

describe('buildReviewQueue', () => {
  it('orders newest delivery first (LIFO) whatever order they are passed in', () => {
    const oldest = order('A', 40);
    const newest = order('C', 2);
    const middle = order('B', 20);
    const food = oid();
    const queue = buildReviewQueue({
      orders: [oldest, newest, middle],
      items: [oldest, newest, middle].map((o) => item(o._id, food)),
      resolvedOrderIds: new Set(),
      reviewedFoodItemIds: new Set(),
    });
    expect(queue.map((q) => q.order.orderNumber)).toEqual(['C', 'B', 'A']);
  });

  it('drops orders the customer already reviewed or skipped', () => {
    const a = order('A', 2);
    const b = order('B', 5);
    const food = oid();
    const queue = buildReviewQueue({
      orders: [a, b],
      items: [item(a._id, food), item(b._id, food)],
      resolvedOrderIds: new Set([a._id.toString()]),
      reviewedFoodItemIds: new Set(),
    });
    expect(queue.map((q) => q.order.orderNumber)).toEqual(['B']);
  });

  it('flags items reviewed before but keeps the order if something is left to review', () => {
    const a = order('A', 2);
    const reviewedFood = oid();
    const newFood = oid();
    const [entry] = buildReviewQueue({
      orders: [a],
      items: [item(a._id, reviewedFood, 'Rice'), item(a._id, newFood, 'Stew')],
      resolvedOrderIds: new Set(),
      reviewedFoodItemIds: new Set([reviewedFood.toString()]),
    });
    expect(entry.items.map((i) => [i.name, i.alreadyReviewed])).toEqual([
      ['Rice', true],
      ['Stew', false],
    ]);
  });

  it('skips an order whose items have all been reviewed already', () => {
    const a = order('A', 2);
    const food = oid();
    const queue = buildReviewQueue({
      orders: [a],
      items: [item(a._id, food)],
      resolvedOrderIds: new Set(),
      reviewedFoodItemIds: new Set([food.toString()]),
    });
    expect(queue).toEqual([]);
  });

  it('shows a meal once when it is on several lines, adding up the quantity', () => {
    const a = order('A', 2);
    const food = oid();
    const [entry] = buildReviewQueue({
      orders: [a],
      items: [item(a._id, food), { ...item(a._id, food), quantity: 2 }],
      resolvedOrderIds: new Set(),
      reviewedFoodItemIds: new Set(),
    });
    expect(entry.items).toHaveLength(1);
    expect(entry.items[0].quantity).toBe(3);
  });

  it('returns an empty queue with no orders', () => {
    expect(
      buildReviewQueue({
        orders: [],
        items: [],
        resolvedOrderIds: new Set(),
        reviewedFoodItemIds: new Set(),
      }),
    ).toEqual([]);
  });
});

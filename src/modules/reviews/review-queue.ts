import { Types } from 'mongoose';

/** An order can be reviewed for this long after it is delivered; after that it is forgotten. */
export const REVIEW_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;

export function reviewWindowCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - REVIEW_WINDOW_MS);
}

export function isWithinReviewWindow(
  deliveredAt: Date | undefined,
  now: Date = new Date(),
): boolean {
  return (
    !!deliveredAt && deliveredAt.getTime() >= reviewWindowCutoff(now).getTime()
  );
}

export interface QueueOrderInput {
  _id: Types.ObjectId;
  orderNumber: string;
  createdAt?: Date;
  deliveredAt?: Date;
}

export interface QueueItemInput {
  orderId: Types.ObjectId;
  foodItemId: Types.ObjectId;
  name: string;
  imageUrl: string;
  quantity: number;
  createdAt?: Date;
}

export interface QueueEntry {
  order: QueueOrderInput;
  items: Array<{
    foodItemId: string;
    name: string;
    imageUrl: string;
    quantity: number;
    orderedAt?: Date;
    alreadyReviewed: boolean;
  }>;
}

/**
 * Orders waiting for a review prompt, most recently delivered first (LIFO).
 *
 * An order is in the queue when the customer has not already dealt with it
 * (`resolvedOrderIds`) and it still has at least one item they have not
 * reviewed. Items reviewed earlier (on any order) are flagged, not removed, so
 * the app can show them as done. The caller is responsible for only passing
 * orders inside the review window.
 */
export function buildReviewQueue(input: {
  orders: QueueOrderInput[];
  items: QueueItemInput[];
  resolvedOrderIds: Set<string>;
  reviewedFoodItemIds: Set<string>;
}): QueueEntry[] {
  const { orders, items, resolvedOrderIds, reviewedFoodItemIds } = input;

  const itemsByOrder = new Map<string, QueueItemInput[]>();
  for (const item of items) {
    const key = item.orderId.toString();
    const list = itemsByOrder.get(key) ?? [];
    list.push(item);
    itemsByOrder.set(key, list);
  }

  const newestFirst = [...orders].sort(
    (a, b) => (b.deliveredAt?.getTime() ?? 0) - (a.deliveredAt?.getTime() ?? 0),
  );

  const queue: QueueEntry[] = [];
  for (const order of newestFirst) {
    if (resolvedOrderIds.has(order._id.toString())) continue;

    // The same meal can appear on several lines (different extras): show it once
    const merged = new Map<string, QueueEntry['items'][number]>();
    for (const item of itemsByOrder.get(order._id.toString()) ?? []) {
      const key = item.foodItemId.toString();
      const existing = merged.get(key);
      if (existing) {
        existing.quantity += item.quantity;
      } else {
        merged.set(key, {
          foodItemId: key,
          name: item.name,
          imageUrl: item.imageUrl,
          quantity: item.quantity,
          orderedAt: item.createdAt,
          alreadyReviewed: reviewedFoodItemIds.has(key),
        });
      }
    }

    const entryItems = [...merged.values()];
    if (entryItems.some((i) => !i.alreadyReviewed)) {
      queue.push({ order, items: entryItems });
    }
  }
  return queue;
}

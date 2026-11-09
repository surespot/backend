import { Model, Types } from 'mongoose';
import { ReviewDocument, VISIBLE_REVIEW_FILTER } from './schemas/review.schema';

export interface RatingStats {
  averageRating: number;
  ratingCount: number;
}

/**
 * Average rating and count for a food item, counting only reviews an admin has
 * not hidden. This is the single place ratings are computed so the customer
 * review endpoints, the moderation endpoints and the legacy endpoint agree.
 */
export async function computeVisibleRatingStats(
  reviewModel: Model<ReviewDocument>,
  foodItemId: Types.ObjectId,
): Promise<RatingStats> {
  const result = await reviewModel
    .aggregate<{ _id: null; averageRating: number; ratingCount: number }>([
      { $match: { foodItemId, ...VISIBLE_REVIEW_FILTER } },
      {
        $group: {
          _id: null,
          averageRating: { $avg: '$rating' },
          ratingCount: { $sum: 1 },
        },
      },
    ])
    .exec();

  if (!result.length) {
    return { averageRating: 0, ratingCount: 0 };
  }

  return {
    averageRating: Math.round(result[0].averageRating * 10) / 10, // 1 decimal place
    ratingCount: result[0].ratingCount,
  };
}

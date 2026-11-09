import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Review, ReviewDocument } from '../food-items/schemas/review.schema';
import {
  FoodItem,
  FoodItemDocument,
} from '../food-items/schemas/food-item.schema';
import { computeVisibleRatingStats } from '../food-items/review-stats';

@Injectable()
export class ReviewRatingsService {
  constructor(
    @InjectModel(Review.name)
    private readonly reviewModel: Model<ReviewDocument>,
    @InjectModel(FoodItem.name)
    private readonly foodItemModel: Model<FoodItemDocument>,
  ) {}

  /**
   * Recalculate the stored average rating and rating count of food items from
   * their visible (not hidden) reviews. Call after reviews are added, hidden or
   * unhidden.
   */
  async recompute(foodItemIds: Array<Types.ObjectId | string>): Promise<void> {
    const unique = [...new Set(foodItemIds.map((id) => id.toString()))];
    await Promise.all(
      unique.map(async (id) => {
        const objectId = new Types.ObjectId(id);
        const { averageRating, ratingCount } = await computeVisibleRatingStats(
          this.reviewModel,
          objectId,
        );
        await this.foodItemModel
          .updateOne(
            { _id: objectId },
            {
              averageRating: Math.min(5, Math.max(0, averageRating)),
              ratingCount,
            },
          )
          .exec();
      }),
    );
  }
}

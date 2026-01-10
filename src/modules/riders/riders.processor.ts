import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  RiderProfile,
  RiderProfileDocument,
  RiderStatus,
} from './schemas/rider-profile.schema';

interface UpdateAvailabilityJobData {
  timestamp: string;
}

@Processor('riders', {
  concurrency: 1, // Process one at a time to avoid conflicts
})
export class RidersProcessor extends WorkerHost {
  private readonly logger = new Logger(RidersProcessor.name);

  constructor(
    @InjectModel(RiderProfile.name)
    private riderProfileModel: Model<RiderProfileDocument>,
  ) {
    super();
  }

  async process(job: Job<UpdateAvailabilityJobData>) {
    this.logger.log(`Processing rider availability update job ${job.id}`);

    // Get current day of week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
    const today = new Date().getDay();

    try {
      // Only update registered riders (have userId) that are ACTIVE or INACTIVE
      // IMPORTANT: Do NOT update PENDING or REJECTED riders - they should remain unchanged
      // Using $in ensures only ACTIVE and INACTIVE riders are matched, excluding PENDING and REJECTED
      const baseFilter = {
        userId: { $exists: true, $ne: null },
        status: { $in: [RiderStatus.ACTIVE, RiderStatus.INACTIVE] },
      };

      // Set ACTIVE: riders whose schedule includes today
      const activeResult = await this.riderProfileModel.updateMany(
        {
          ...baseFilter,
          schedule: today, // MongoDB checks if array contains this value
        },
        {
          $set: { status: RiderStatus.ACTIVE },
        },
      );

      // Set INACTIVE: riders whose schedule does NOT include today
      // $nin checks if the array does not contain any of the specified values
      const inactiveResult = await this.riderProfileModel.updateMany(
        {
          ...baseFilter,
          schedule: { $nin: [today] },
        },
        {
          $set: { status: RiderStatus.INACTIVE },
        },
      );

      // Reset daily stats for all riders (distance covered and online time)
      await this.riderProfileModel.updateMany(
        {
          userId: { $exists: true, $ne: null },
          status: { $in: [RiderStatus.ACTIVE, RiderStatus.INACTIVE] },
        },
        {
          $set: {
            totalDistanceToday: 0,
            totalOnlineTimeToday: 0,
            sessionStartTime: null,
          },
        },
      );

      this.logger.log(
        `Rider availability updated: ${activeResult.modifiedCount} set to ACTIVE, ${inactiveResult.modifiedCount} set to INACTIVE (day: ${today})`,
      );
      this.logger.log('Daily rider stats reset (totalDistanceToday)');

      return {
        success: true,
        dayOfWeek: today,
        activeCount: activeResult.modifiedCount,
        inactiveCount: inactiveResult.modifiedCount,
      };
    } catch (error) {
      this.logger.error(
        `Failed to update rider availability: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }
}

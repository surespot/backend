import { Injectable, NotFoundException } from '@nestjs/common';
import { RiderLocationRepository } from './rider-location.repository';
import { UpdateRiderLocationDto } from './dto/update-rider-location.dto';
import { RiderLocationDocument } from './schemas/rider-location.schema';
import { RidersRepository } from './riders.repository';

@Injectable()
export class RiderLocationService {
  constructor(
    private readonly riderLocationRepository: RiderLocationRepository,
    private readonly ridersRepository: RidersRepository,
  ) {}

  async updateLocation(
    riderProfileId: string,
    dto: UpdateRiderLocationDto,
  ): Promise<{
    success: boolean;
    message: string;
    data: {
      id: string;
      riderProfileId: string;
      streetAddress: string;
      latitude: number;
      longitude: number;
      state?: string;
      country: string;
      regionId?: string;
      lastUpdated: Date;
    };
  }> {
    // Verify rider profile exists
    const profile = await this.ridersRepository.findById(riderProfileId);
    if (!profile) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'RIDER_PROFILE_NOT_FOUND',
          message: 'Rider profile not found',
        },
      });
    }

    const location = await this.riderLocationRepository.createOrUpdate(
      riderProfileId,
      {
        streetAddress: dto.streetAddress,
        latitude: dto.latitude,
        longitude: dto.longitude,
        state: dto.state,
        country: dto.country,
        regionId: dto.regionId,
      },
    );

    // Update online time tracking
    const now = new Date();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // If no session started today, start one
    if (!profile.sessionStartTime || profile.sessionStartTime < todayStart) {
      await this.ridersRepository.updateProfile(riderProfileId, {
        sessionStartTime: now,
        totalOnlineTimeToday: 0,
      });
    }

    return {
      success: true,
      message: 'Rider location updated successfully',
      data: this.formatLocation(location),
    };
  }

  async getLocation(riderProfileId: string): Promise<{
    success: boolean;
    message: string;
    data: {
      id: string;
      riderProfileId: string;
      streetAddress: string;
      latitude: number;
      longitude: number;
      state?: string;
      country: string;
      regionId?: string;
      lastUpdated: Date;
    };
  }> {
    const location =
      await this.riderLocationRepository.findByRiderProfileId(riderProfileId);

    if (!location) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'LOCATION_NOT_FOUND',
          message: 'Rider location not found',
        },
      });
    }

    return {
      success: true,
      message: 'Rider location retrieved successfully',
      data: this.formatLocation(location),
    };
  }

  private formatLocation(location: RiderLocationDocument) {
    return {
      id: location._id.toString(),
      riderProfileId: location.riderProfileId.toString(),
      streetAddress: location.streetAddress,
      latitude: location.location.coordinates[1], // GeoJSON: [lng, lat]
      longitude: location.location.coordinates[0],
      state: location.state,
      country: location.country,
      regionId: location.regionId,
      lastUpdated: location.lastUpdated,
    };
  }
}

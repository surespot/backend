import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PickupLocationsRepository } from './pickup-locations.repository';
import { CreatePickupLocationDto } from './dto/create-pickup-location.dto';
import { UpdatePickupLocationDto } from './dto/update-pickup-location.dto';
import { FindNearestPickupLocationDto } from './dto/find-nearest-pickup-location.dto';
import { PickupLocationDocument } from './schemas/pickup-location.schema';

@Injectable()
export class PickupLocationsService {
  constructor(
    private readonly pickupLocationsRepository: PickupLocationsRepository,
  ) {}

  async create(dto: CreatePickupLocationDto) {
    const pickupLocation = await this.pickupLocationsRepository.create({
      name: dto.name,
      address: dto.address,
      latitude: dto.latitude,
      longitude: dto.longitude,
      regionId: dto.regionId,
      isActive: dto.isActive ?? true,
    });

    return {
      success: true,
      message: 'Pickup location created successfully',
      data: this.formatPickupLocation(pickupLocation),
    };
  }

  async findAll() {
    const pickupLocations = await this.pickupLocationsRepository.findAll();

    return {
      success: true,
      message: 'Pickup locations retrieved successfully',
      data: {
        pickupLocations: pickupLocations.map((location) =>
          this.formatPickupLocation(location),
        ),
      },
    };
  }

  async findOne(id: string) {
    const pickupLocation = await this.pickupLocationsRepository.findById(id);

    if (!pickupLocation) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'PICKUP_LOCATION_NOT_FOUND',
          message: 'Pickup location not found',
        },
      });
    }

    return {
      success: true,
      message: 'Pickup location retrieved successfully',
      data: this.formatPickupLocation(pickupLocation),
    };
  }

  async findNearest(dto: FindNearestPickupLocationDto) {
    const pickupLocation = await this.pickupLocationsRepository.findNearest(
      dto.latitude,
      dto.longitude,
    );

    if (!pickupLocation) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'PICKUP_LOCATION_NOT_FOUND',
          message: 'No active pickup location found nearby',
        },
      });
    }

    return {
      success: true,
      message: 'Nearest pickup location retrieved successfully',
      data: this.formatPickupLocation(pickupLocation),
    };
  }

  async update(id: string, dto: UpdatePickupLocationDto) {
    // Check if pickup location exists
    const existing = await this.pickupLocationsRepository.findById(id);
    if (!existing) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'PICKUP_LOCATION_NOT_FOUND',
          message: 'Pickup location not found',
        },
      });
    }

    // Validate that if latitude or longitude is provided, both must be provided
    if (
      (dto.latitude !== undefined && dto.longitude === undefined) ||
      (dto.longitude !== undefined && dto.latitude === undefined)
    ) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Both latitude and longitude must be provided together',
        },
      });
    }

    const updated = await this.pickupLocationsRepository.update(id, {
      name: dto.name,
      address: dto.address,
      latitude: dto.latitude,
      longitude: dto.longitude,
      regionId: dto.regionId,
      isActive: dto.isActive,
    });

    if (!updated) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'UPDATE_FAILED',
          message: 'Failed to update pickup location',
        },
      });
    }

    return {
      success: true,
      message: 'Pickup location updated successfully',
      data: this.formatPickupLocation(updated),
    };
  }

  async delete(id: string) {
    const deleted = await this.pickupLocationsRepository.delete(id);

    if (!deleted) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'PICKUP_LOCATION_NOT_FOUND',
          message: 'Pickup location not found',
        },
      });
    }

    return {
      success: true,
      message: 'Pickup location deleted successfully',
    };
  }

  private formatPickupLocation(pickupLocation: PickupLocationDocument) {
    const region = pickupLocation.regionId as any;
    return {
      id: pickupLocation._id.toString(),
      name: pickupLocation.name,
      address: pickupLocation.address,
      latitude: pickupLocation.location.coordinates[1], // GeoJSON: [lng, lat]
      longitude: pickupLocation.location.coordinates[0],
      regionId: region?._id?.toString() || region?.toString(),
      regionName: region?.name,
      isActive: pickupLocation.isActive,
      createdAt: pickupLocation.createdAt,
      updatedAt: pickupLocation.updatedAt,
    };
  }
}

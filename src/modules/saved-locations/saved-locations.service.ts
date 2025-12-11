import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { SavedLocationsRepository } from './saved-locations.repository';
import { CreateSavedLocationDto } from './dto/create-saved-location.dto';
import { UpdateSavedLocationDto } from './dto/update-saved-location.dto';
import { SavedLocationDocument } from './schemas/saved-location.schema';

@Injectable()
export class SavedLocationsService {
  constructor(
    private readonly savedLocationsRepository: SavedLocationsRepository,
  ) {}

  async create(userId: string, dto: CreateSavedLocationDto) {
    // Check if label already exists for this user
    const existing = await this.savedLocationsRepository.findByLabel(
      userId,
      dto.label,
    );
    if (existing) {
      throw new ConflictException({
        success: false,
        error: {
          code: 'LOCATION_LABEL_EXISTS',
          message: 'A location with this label already exists',
        },
      });
    }

    const savedLocation = await this.savedLocationsRepository.create(userId, {
      label: dto.label,
      streetAddress: dto.streetAddress,
      latitude: dto.latitude,
      longitude: dto.longitude,
      state: dto.state,
      country: dto.country,
      regionId: dto.regionId,
    });

    return {
      success: true,
      message: 'Location saved successfully',
      data: this.formatLocation(savedLocation),
    };
  }

  async findAll(userId: string) {
    const locations =
      await this.savedLocationsRepository.findAllByUserId(userId);

    return {
      success: true,
      message: 'Locations retrieved successfully',
      data: {
        locations: locations.map((loc) => this.formatLocation(loc)),
      },
    };
  }

  async findOne(locationId: string, userId: string) {
    const location = await this.savedLocationsRepository.findById(
      locationId,
      userId,
    );

    if (!location) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'LOCATION_NOT_FOUND',
          message: 'Location not found',
        },
      });
    }

    return {
      success: true,
      message: 'Location retrieved successfully',
      data: this.formatLocation(location),
    };
  }

  async update(
    locationId: string,
    userId: string,
    dto: UpdateSavedLocationDto,
  ) {
    // Check if location exists
    const existing = await this.savedLocationsRepository.findById(
      locationId,
      userId,
    );
    if (!existing) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'LOCATION_NOT_FOUND',
          message: 'Location not found',
        },
      });
    }

    // If label is being updated, check if new label already exists
    if (dto.label && dto.label !== existing.label) {
      const labelExists = await this.savedLocationsRepository.findByLabel(
        userId,
        dto.label,
      );
      if (labelExists) {
        throw new ConflictException({
          success: false,
          error: {
            code: 'LOCATION_LABEL_EXISTS',
            message: 'A location with this label already exists',
          },
        });
      }
    }

    const updated = await this.savedLocationsRepository.update(
      locationId,
      userId,
      dto,
    );

    if (!updated) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'UPDATE_FAILED',
          message: 'Failed to update location',
        },
      });
    }

    return {
      success: true,
      message: 'Location updated successfully',
      data: this.formatLocation(updated),
    };
  }

  async delete(locationId: string, userId: string) {
    const deleted = await this.savedLocationsRepository.delete(
      locationId,
      userId,
    );

    if (!deleted) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'LOCATION_NOT_FOUND',
          message: 'Location not found',
        },
      });
    }

    return {
      success: true,
      message: 'Location deleted successfully',
    };
  }

  private formatLocation(location: SavedLocationDocument) {
    return {
      id: location._id.toString(),
      userId: location.userId.toString(),
      label: location.label,
      streetAddress: location.streetAddress,
      latitude: location.location.coordinates[1], // GeoJSON: [lng, lat]
      longitude: location.location.coordinates[0],
      state: location.state,
      country: location.country,
      regionId: location.regionId,
      createdAt: location.createdAt,
      updatedAt: location.updatedAt,
    };
  }
}

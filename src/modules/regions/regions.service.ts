import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { RegionsRepository } from './regions.repository';
import { CreateRegionDto } from './dto/create-region.dto';
import { UpdateRegionDto } from './dto/update-region.dto';
import { RegionDocument } from './schemas/region.schema';

@Injectable()
export class RegionsService {
  constructor(private readonly regionsRepository: RegionsRepository) {}

  async create(dto: CreateRegionDto) {
    // Check if region with same name already exists
    const existing = await this.regionsRepository.findByName(dto.name);
    if (existing) {
      throw new ConflictException({
        success: false,
        error: {
          code: 'REGION_NAME_EXISTS',
          message: 'A region with this name already exists',
        },
      });
    }

    const region = await this.regionsRepository.create({
      name: dto.name,
      description: dto.description,
      isActive: dto.isActive ?? true,
    });

    return {
      success: true,
      message: 'Region created successfully',
      data: this.formatRegion(region),
    };
  }

  async findAll() {
    const regions = await this.regionsRepository.findAll();

    return {
      success: true,
      message: 'Regions retrieved successfully',
      data: {
        regions: regions.map((region) => this.formatRegion(region)),
      },
    };
  }

  async findOne(id: string) {
    const region = await this.regionsRepository.findById(id);

    if (!region) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'REGION_NOT_FOUND',
          message: 'Region not found',
        },
      });
    }

    return {
      success: true,
      message: 'Region retrieved successfully',
      data: this.formatRegion(region),
    };
  }

  async update(id: string, dto: UpdateRegionDto) {
    // Check if region exists
    const existing = await this.regionsRepository.findById(id);
    if (!existing) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'REGION_NOT_FOUND',
          message: 'Region not found',
        },
      });
    }

    // If name is being updated, check if new name already exists
    if (dto.name && dto.name !== existing.name) {
      const nameExists = await this.regionsRepository.findByName(dto.name);
      if (nameExists) {
        throw new ConflictException({
          success: false,
          error: {
            code: 'REGION_NAME_EXISTS',
            message: 'A region with this name already exists',
          },
        });
      }
    }

    const updated = await this.regionsRepository.update(id, {
      name: dto.name,
      description: dto.description,
      isActive: dto.isActive,
    });

    if (!updated) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'UPDATE_FAILED',
          message: 'Failed to update region',
        },
      });
    }

    return {
      success: true,
      message: 'Region updated successfully',
      data: this.formatRegion(updated),
    };
  }

  async delete(id: string) {
    const deleted = await this.regionsRepository.delete(id);

    if (!deleted) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'REGION_NOT_FOUND',
          message: 'Region not found',
        },
      });
    }

    return {
      success: true,
      message: 'Region deleted successfully',
    };
  }

  private formatRegion(region: RegionDocument) {
    return {
      id: region._id.toString(),
      name: region.name,
      description: region.description,
      isActive: region.isActive,
      createdAt: region.createdAt,
      updatedAt: region.updatedAt,
    };
  }
}

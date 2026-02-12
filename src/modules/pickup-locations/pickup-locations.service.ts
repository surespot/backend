import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PickupLocationsRepository } from './pickup-locations.repository';
import { CreatePickupLocationDto } from './dto/create-pickup-location.dto';
import { UpdatePickupLocationDto } from './dto/update-pickup-location.dto';
import { FindNearestPickupLocationDto } from './dto/find-nearest-pickup-location.dto';
import { PickupLocationDocument } from './schemas/pickup-location.schema';
import { CreatePickupLocationForAdminDto } from './dto/create-pickup-location-for-admin.dto';
import { AuthRepository } from '../auth/auth.repository';
import { UserRole } from '../auth/schemas/user.schema';
import { OtpPurpose } from '../auth/schemas/otp-code.schema';
import { MailService } from '../mail/mail.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PickupLocationsService {
  constructor(
    private readonly pickupLocationsRepository: PickupLocationsRepository,
    private readonly authRepository: AuthRepository,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  async create(dto: CreatePickupLocationDto) {
    // Ensure no existing user already uses this admin email
    const existingUserByEmail = await this.authRepository.findUserByEmail(
      dto.adminEmail,
    );
    if (existingUserByEmail) {
      throw new ConflictException({
        success: false,
        error: {
          code: 'ADMIN_EMAIL_ALREADY_IN_USE',
          message:
            'A user with this email already exists. Please use a different email for the pickup location admin.',
        },
      });
    }

    // Create the pickup location first
    const pickupLocation = await this.pickupLocationsRepository.create({
      name: dto.name,
      address: dto.address,
      latitude: dto.latitude,
      longitude: dto.longitude,
      regionId: dto.regionId,
      isActive: dto.isActive ?? true,
    });

    // Create the pickup location admin user linked to this pickup location
    const pickupAdminUser = await this.authRepository.createUser({
      firstName: dto.adminFirstName,
      lastName: dto.adminLastName,
      email: dto.adminEmail,
      phone: dto.adminPhone,
      role: UserRole.PICKUP_ADMIN,
      isEmailVerified: true,
      isActive: true,
      pickupLocationId: pickupLocation._id,
    });

    // Generate a one-time login code for the pickup admin dashboard
    const otpExpiryMinutes = Number(
      this.configService.get('OTP_EXPIRY_MINUTES') ?? 30,
    );
    const expiresAt = new Date(Date.now() + otpExpiryMinutes * 60 * 1000);
    const loginCode = this.generateNumericCode(6);

    await this.authRepository.invalidateOtpCodes(
      dto.adminEmail,
      OtpPurpose.ADMIN_LOGIN,
    );

    await this.authRepository.createOtpCode(
      dto.adminEmail,
      loginCode,
      OtpPurpose.ADMIN_LOGIN,
      expiresAt,
    );

    // Send login code via email (reuses generic OTP email template)
    await this.mailService.sendOtpEmail({
      to: dto.adminEmail,
      otp: loginCode,
      purpose: 'admin-login',
      expiresInMinutes: otpExpiryMinutes,
    });

    return {
      success: true,
      message: 'Pickup location created successfully',
      data: {
        pickupLocation: this.formatPickupLocation(pickupLocation),
        adminUser: {
          id: pickupAdminUser._id.toString(),
          firstName: pickupAdminUser.firstName,
          lastName: pickupAdminUser.lastName,
          email: pickupAdminUser.email,
        },
      },
    };
  }

  /**
   * Create a new pickup location and attach it to an existing
   * super-admin user so they can also see stats for their own location.
   */
  async createForExistingAdmin(
    adminUserId: string,
    dto: CreatePickupLocationForAdminDto,
  ) {
    // Verify admin user exists
    const adminUser = await this.authRepository.findUserById(adminUserId);
    if (!adminUser) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'ADMIN_USER_NOT_FOUND',
          message: 'Admin user not found',
        },
      });
    }

    // Ensure the user is a super admin
    if (adminUser.role !== UserRole.ADMIN) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'INVALID_ADMIN_ROLE',
          message: 'Pickup locations can only be attached to super admin users',
        },
      });
    }

    // Optionally prevent attaching multiple pickup locations to the same admin
    if (adminUser.pickupLocationId) {
      throw new ConflictException({
        success: false,
        error: {
          code: 'ADMIN_ALREADY_HAS_PICKUP_LOCATION',
          message: 'This admin already has a pickup location attached',
        },
      });
    }

    // Create the pickup location
    const pickupLocation = await this.pickupLocationsRepository.create({
      name: dto.name,
      address: dto.address,
      latitude: dto.latitude,
      longitude: dto.longitude,
      regionId: dto.regionId,
      isActive: dto.isActive ?? true,
    });

    // Attach the pickup location to the admin user
    const updatedAdminUser = await this.authRepository.updateUser(adminUserId, {
      pickupLocationId: pickupLocation._id,
    });

    if (!updatedAdminUser) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'ADMIN_USER_NOT_FOUND',
          message: 'Admin user not found after attaching pickup location',
        },
      });
    }

    return {
      success: true,
      message:
        'Pickup location created and attached to admin user successfully',
      data: {
        pickupLocation: this.formatPickupLocation(pickupLocation),
        adminUser: {
          id: updatedAdminUser._id.toString(),
          firstName: updatedAdminUser.firstName,
          lastName: updatedAdminUser.lastName,
          email: updatedAdminUser.email,
          pickupLocationId: updatedAdminUser.pickupLocationId
            ? updatedAdminUser.pickupLocationId.toString()
            : undefined,
        },
      },
    };
  }

  /**
   * Assign an existing (unlinked) pickup location to an existing user.
   * If the user is not a super admin, their role will be set to PICKUP_ADMIN.
   */
  async assignExistingPickupLocationToUser(
    pickupLocationId: string,
    userId: string,
  ) {
    // Verify pickup location exists
    const pickupLocation = await this.pickupLocationsRepository.findById(
      pickupLocationId,
    );
    if (!pickupLocation) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'PICKUP_LOCATION_NOT_FOUND',
          message: 'Pickup location not found',
        },
      });
    }

    // Verify user exists
    const user = await this.authRepository.findUserById(userId);
    if (!user) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
        },
      });
    }

    // Ensure no other user is already linked to this pickup location
    const existingLinkedUser =
      await this.authRepository.findUserByPickupLocationId(pickupLocationId);
    if (existingLinkedUser && existingLinkedUser._id.toString() !== userId) {
      throw new ConflictException({
        success: false,
        error: {
          code: 'PICKUP_LOCATION_ALREADY_ASSIGNED',
          message:
            'This pickup location is already assigned to another user. Please unassign it first.',
        },
      });
    }

    // Determine role update: keep ADMIN as is, otherwise promote to PICKUP_ADMIN
    const newRole =
      user.role === UserRole.ADMIN ? user.role : UserRole.PICKUP_ADMIN;

    const updatedUser = await this.authRepository.updateUser(userId, {
      pickupLocationId: pickupLocation._id,
      role: newRole,
    });

    if (!updatedUser) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found after assigning pickup location',
        },
      });
    }

    return {
      success: true,
      message: 'Pickup location assigned to user successfully',
      data: {
        pickupLocation: this.formatPickupLocation(pickupLocation),
        user: {
          id: updatedUser._id.toString(),
          firstName: updatedUser.firstName,
          lastName: updatedUser.lastName,
          email: updatedUser.email,
          role: updatedUser.role,
          pickupLocationId: updatedUser.pickupLocationId
            ? updatedUser.pickupLocationId.toString()
            : undefined,
        },
      },
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
    const MAX_DISTANCE_METERS = 20000;
    const pickupLocation = await this.pickupLocationsRepository.findNearest(
      dto.latitude,
      dto.longitude,
      MAX_DISTANCE_METERS,
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

  /**
   * Generate a random numeric code of specified length
   */
  private generateNumericCode(length: number): string {
    let code = '';
    for (let i = 0; i < length; i++) {
      code += Math.floor(Math.random() * 10).toString();
    }
    return code;
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

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  forwardRef,
  OnModuleInit,
} from '@nestjs/common';
import { PickupLocationsRepository } from './pickup-locations.repository';
import { CreatePickupLocationDto } from './dto/create-pickup-location.dto';
import { UpdatePickupLocationDto } from './dto/update-pickup-location.dto';
import { FindNearestPickupLocationDto } from './dto/find-nearest-pickup-location.dto';
import {
  isPopulatedRegionId,
  PickupLocationDocument,
  type RegionIdField,
} from './schemas/pickup-location.schema';
import {
  PickupLocationWaitlist,
  PickupLocationWaitlistDocument,
} from './schemas/pickup-location-waitlist.schema';
import { CreatePickupLocationForAdminDto } from './dto/create-pickup-location-for-admin.dto';
import { AuthRepository } from '../auth/auth.repository';
import { UserRole } from '../auth/schemas/user.schema';
import { OtpPurpose } from '../auth/schemas/otp-code.schema';
import { MailService } from '../mail/mail.service';
import { SmsService } from '../sms/sms.service';
import { ConfigService } from '@nestjs/config';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { OrderStatus, PaymentStatus } from '../orders/schemas/order.schema';
import { NotificationsService } from '../notifications/notifications.service';
import {
  NotificationChannel,
  NotificationType,
} from '../notifications/schemas/notification.schema';
import { SavedLocationsRepository } from '../saved-locations/saved-locations.repository';

@Injectable()
export class PickupLocationsService implements OnModuleInit {
  private readonly logger = new Logger(PickupLocationsService.name);

  constructor(
    private readonly pickupLocationsRepository: PickupLocationsRepository,
    private readonly authRepository: AuthRepository,
    private readonly mailService: MailService,
    private readonly smsService: SmsService,
    private readonly configService: ConfigService,
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(PickupLocationWaitlist.name)
    private readonly waitlistModel: Model<PickupLocationWaitlistDocument>,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
    private readonly savedLocationsRepository: SavedLocationsRepository,
  ) {}

  async onModuleInit() {
    await this.waitlistModel.syncIndexes();
  }

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

    // Create the pickup location admin user first (without pickupLocationId)
    const pickupAdminUser = await this.authRepository.createUser({
      firstName: dto.adminFirstName,
      lastName: dto.adminLastName,
      email: dto.adminEmail,
      phone: dto.adminPhone,
      role: UserRole.PICKUP_ADMIN,
      isEmailVerified: true,
      isActive: true,
      isOnboarded: true,
    });

    try {
      // Create the pickup location
      const pickupLocation = await this.pickupLocationsRepository.create({
        name: dto.name,
        address: dto.address,
        latitude: dto.latitude,
        longitude: dto.longitude,
        regionId: dto.regionId,
        isActive: dto.isActive ?? true,
      });

      // Link the user to the pickup location
      await this.authRepository.updateUser(pickupAdminUser._id.toString(), {
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

      if (pickupLocation.isActive) {
        this.notifyNearbyWaitlist(pickupLocation).catch((err) => {
          this.logger.warn(
            `Failed to notify waitlist for new pickup location ${pickupLocation._id.toString()}: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
        this.emailNearbyUsers(pickupLocation).catch((err) => {
          this.logger.warn(
            `Failed to email nearby users for new pickup location ${pickupLocation._id.toString()}: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
      }

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
    } catch (error) {
      // Rollback: soft-delete the user so we don't leave an orphan PICKUP_ADMIN
      await this.authRepository.softDeleteUser(pickupAdminUser._id.toString());
      throw error;
    }
  }

  /**
   * Create a new pickup location and attach it to an existing
   * super-admin user so they can also see stats for their own location.
   */
  async createStandalone(dto: CreatePickupLocationForAdminDto) {
    const pickupLocation = await this.pickupLocationsRepository.create({
      name: dto.name,
      address: dto.address,
      latitude: dto.latitude,
      longitude: dto.longitude,
      regionId: dto.regionId,
      isActive: dto.isActive ?? true,
    });

    if (pickupLocation.isActive) {
      this.notifyNearbyWaitlist(pickupLocation).catch((err) => {
        this.logger.warn(
          `Failed to notify waitlist for new pickup location ${pickupLocation._id.toString()}: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
      this.emailNearbyUsers(pickupLocation).catch((err) => {
        this.logger.warn(
          `Failed to email nearby users for new pickup location ${pickupLocation._id.toString()}: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    }

    return {
      success: true,
      message: 'Pickup location created successfully',
      data: {
        pickupLocation: this.formatPickupLocation(pickupLocation),
      },
    };
  }

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

    // Attach the pickup location to the admin user (super admin onboarding)
    const updatedAdminUser = await this.authRepository.updateUser(adminUserId, {
      pickupLocationId: pickupLocation._id,
      isOnboarded: true,
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

    if (pickupLocation.isActive) {
      this.notifyNearbyWaitlist(pickupLocation).catch((err) => {
        this.logger.warn(
          `Failed to notify waitlist for new pickup location ${pickupLocation._id.toString()}: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
      this.emailNearbyUsers(pickupLocation).catch((err) => {
        this.logger.warn(
          `Failed to email nearby users for new pickup location ${pickupLocation._id.toString()}: ${err instanceof Error ? err.message : String(err)}`,
        );
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
    const pickupLocation =
      await this.pickupLocationsRepository.findById(pickupLocationId);
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
      isOnboarded: true,
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

    if (updatedUser.email) {
      const dashboardUrl =
        this.configService.get<string>('ADMIN_DASHBOARD_URL') ?? '';
      this.mailService
        .sendPickupLocationAssignedEmail({
          to: updatedUser.email,
          firstName: updatedUser.firstName ?? 'Admin',
          locationName: pickupLocation.name,
          locationAddress: pickupLocation.address,
          dashboardUrl,
        })
        .catch((err) => {
          this.logger.warn(
            `Failed to send pickup location assigned email to ${updatedUser.email}: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
    } else if (updatedUser.phone) {
      const firstName = updatedUser.firstName ?? 'Admin';
      const message = `Hi ${firstName}, you've been assigned as admin for ${pickupLocation.name} on Surespot. Log in to the admin dashboard to get started.`;
      this.smsService
        .sendSms({ to: updatedUser.phone, body: message })
        .catch((err) => {
          this.logger.warn(
            `Failed to send pickup location assigned SMS to ${updatedUser.phone}: ${err instanceof Error ? err.message : String(err)}`,
          );
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

  /**
   * Find pickup locations that have no admin assigned (unlinked).
   * Used during admin onboarding to let new admins choose an existing location.
   */
  async findUnlinkedPickupLocations() {
    const assignedIds =
      await this.authRepository.findAssignedPickupLocationIds();
    const pickupLocations =
      await this.pickupLocationsRepository.findUnlinked(assignedIds);

    return {
      success: true,
      message: 'Unlinked pickup locations retrieved successfully',
      data: {
        pickupLocations: pickupLocations.map((location) =>
          this.formatPickupLocation(location),
        ),
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

    const stats = await this.getPickupLocationStats(
      pickupLocation._id.toString(),
    );

    const { regionName } = this.getRegionIdApiFields(pickupLocation);

    const linkedUsers = await this.authRepository.findUsersByPickupLocationId(
      pickupLocation._id,
    );
    const linkedAdmins = linkedUsers.map((u) => ({
      id: u._id.toString(),
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      role: u.role,
      phone: u.phone,
      isActive: u.isActive,
    }));

    return {
      success: true,
      message: 'Pickup location retrieved successfully',
      data: {
        ...this.formatPickupLocation(pickupLocation),
        regionName,
        totalOrders: stats.totalOrders,
        totalIncome: stats.totalIncome,
        linkedAdmins,
        pickupLocationAdmin: linkedAdmins.find(
          (a) => a.role === UserRole.PICKUP_ADMIN,
        ),
      },
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
          message: 'No open branches near your location, try again later',
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

    const wasActive = existing.isActive;

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

    if (!wasActive && updated.isActive) {
      this.notifyNearbyWaitlist(updated).catch((err) => {
        this.logger.warn(
          `Failed to notify waitlist on activation of pickup location ${id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
      this.emailNearbyUsers(updated).catch((err) => {
        this.logger.warn(
          `Failed to email nearby users on activation of pickup location ${id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    }

    return {
      success: true,
      message: 'Pickup location updated successfully',
      data: this.formatPickupLocation(updated),
    };
  }

  async deactivatePickupLocation(
    locationId: string,
    requestingUser: { id: string; role: string; pickupLocationId?: string },
  ) {
    const location =
      await this.pickupLocationsRepository.findById(locationId);
    if (!location) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'PICKUP_LOCATION_NOT_FOUND',
          message: 'Pickup location not found',
        },
      });
    }

    if (requestingUser.role === UserRole.PICKUP_ADMIN) {
      if (requestingUser.pickupLocationId !== locationId) {
        throw new ForbiddenException({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message:
              'You can only deactivate your own pickup location',
          },
        });
      }
    }

    if (!location.isActive) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'ALREADY_INACTIVE',
          message: 'Pickup location is already inactive',
        },
      });
    }

    await this.pickupLocationsRepository.update(locationId, {
      isActive: false,
    });
    await this.authRepository.unlinkUsersFromPickupLocation(locationId);

    return {
      success: true,
      message: 'Pickup location deactivated successfully',
    };
  }

  async closePickupLocation(
    locationId: string,
    requestingUser: { id: string; role: string; pickupLocationId?: string },
  ) {
    const location =
      await this.pickupLocationsRepository.findById(locationId);
    if (!location) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'PICKUP_LOCATION_NOT_FOUND',
          message: 'Pickup location not found',
        },
      });
    }

    if (requestingUser.role === UserRole.PICKUP_ADMIN) {
      if (requestingUser.pickupLocationId !== locationId) {
        throw new ForbiddenException({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'You can only close your own pickup location',
          },
        });
      }
    }

    if (!location.isActive) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'ALREADY_INACTIVE',
          message: 'Pickup location is already closed',
        },
      });
    }

    await this.pickupLocationsRepository.update(locationId, { isActive: false });

    return {
      success: true,
      message: 'Pickup location closed successfully',
    };
  }

  async promoteUserToPickupAdmin(userId: string) {
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

    if (user.role !== UserRole.USER) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'INVALID_USER_ROLE',
          message: `Only regular users can be promoted to pickup admin. This user has role: ${user.role}`,
        },
      });
    }

    const updated = await this.authRepository.updateUser(userId, {
      role: UserRole.PICKUP_ADMIN,
    });

    if (!updated) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found after promotion',
        },
      });
    }

    return {
      success: true,
      message: 'User promoted to pickup admin successfully',
      data: {
        user: {
          id: updated._id.toString(),
          firstName: updated.firstName,
          lastName: updated.lastName,
          email: updated.email,
          role: updated.role,
          pickupLocationId: updated.pickupLocationId
            ? updated.pickupLocationId.toString()
            : undefined,
        },
      },
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

  async joinWaitlist(
    userId: string,
    latitude: number,
    longitude: number,
  ): Promise<void> {
    await this.waitlistModel
      .findOneAndUpdate(
        { userId: new Types.ObjectId(userId), latitude, longitude },
        { $set: { userId: new Types.ObjectId(userId), latitude, longitude } },
        { upsert: true, new: true },
      )
      .exec();
  }

  async leaveWaitlist(userId: string): Promise<void> {
    await this.waitlistModel
      .deleteMany({ userId: new Types.ObjectId(userId) })
      .exec();
  }

  private async emailNearbyUsers(
    pickupLocation: PickupLocationDocument,
  ): Promise<void> {
    const MAX_DISTANCE_METERS = 20000;
    const [lng, lat] = pickupLocation.location.coordinates;

    const userIds =
      await this.savedLocationsRepository.findDistinctUserIdsNearPoint(
        lng,
        lat,
        MAX_DISTANCE_METERS,
      );

    if (userIds.length === 0) return;

    await Promise.all(
      userIds.map(async (userId) => {
        try {
          const user = await this.authRepository.findUserById(userId);
          if (!user?.email || !user.isEmailVerified) return;
          await this.mailService.sendPickupLocationNearbyEmail({
            to: user.email,
            firstName: user.firstName ?? 'there',
            locationName: pickupLocation.name,
            locationAddress: pickupLocation.address,
          });
        } catch (err) {
          this.logger.warn(
            `Failed to email user ${userId} about new pickup location: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }),
    );
  }

  private async notifyNearbyWaitlist(
    pickupLocation: PickupLocationDocument,
  ): Promise<void> {
    const MAX_DISTANCE_METERS = 20000;
    const [lng, lat] = pickupLocation.location.coordinates;

    const entries = await this.waitlistModel.find().lean().exec();
    const nearbyEntries = entries.filter((entry) => {
      const distanceKm = this.haversineDistance(
        lat,
        lng,
        entry.latitude,
        entry.longitude,
      );
      return distanceKm * 1000 <= MAX_DISTANCE_METERS;
    });

    if (nearbyEntries.length === 0) return;

    const userIds = [...new Set(nearbyEntries.map((e) => e.userId.toString()))];

    await Promise.all(
      userIds.map((userId) =>
        this.notificationsService
          .create(
            userId,
            NotificationType.PICKUP_LOCATION_AVAILABLE,
            'Pickup point now available near you!',
            `Great news! A Surespot pickup point has opened near you at ${pickupLocation.name}. You can now place orders for pickup.`,
            { pickupLocationId: pickupLocation._id.toString() },
            [NotificationChannel.IN_APP, NotificationChannel.PUSH],
          )
          .catch((err) => {
            this.logger.warn(
              `Failed to notify user ${userId} of new pickup location: ${err instanceof Error ? err.message : String(err)}`,
            );
          }),
      ),
    );

    await this.waitlistModel
      .deleteMany({ userId: { $in: userIds.map((id) => new Types.ObjectId(id)) } })
      .exec();
  }

  private haversineDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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

  private getRegionIdApiFields(loc: PickupLocationDocument): {
    regionId: string;
    regionName?: string;
  } {
    const rf: RegionIdField = loc.regionId;
    if (isPopulatedRegionId(rf)) {
      return { regionId: rf._id.toString(), regionName: rf.name };
    }
    return { regionId: rf.toString() };
  }

  private formatPickupLocation(pickupLocation: PickupLocationDocument) {
    const { regionId, regionName } = this.getRegionIdApiFields(pickupLocation);
    return {
      id: pickupLocation._id.toString(),
      name: pickupLocation.name,
      address: pickupLocation.address,
      latitude: pickupLocation.location.coordinates[1], // GeoJSON: [lng, lat]
      longitude: pickupLocation.location.coordinates[0],
      regionId,
      regionName,
      isActive: pickupLocation.isActive,
      createdAt: pickupLocation.createdAt,
      updatedAt: pickupLocation.updatedAt,
    };
  }

  private async getPickupLocationStats(pickupLocationId: string): Promise<{
    totalOrders: number;
    totalIncome: number;
  }> {
    const orderModel = this.connection.models.Order as Model<{ total: number }>;

    if (!orderModel || !Types.ObjectId.isValid(pickupLocationId)) {
      return { totalOrders: 0, totalIncome: 0 };
    }

    const results = (await orderModel
      .aggregate([
        {
          $match: {
            pickupLocationId: new Types.ObjectId(pickupLocationId),
            status: OrderStatus.DELIVERED,
            paymentStatus: PaymentStatus.PAID,
            paymentIntentId: { $exists: true, $ne: null },
          },
        },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            totalIncome: { $sum: '$total' },
          },
        },
      ])
      .exec()) as Array<{ totalOrders: number; totalIncome: number }>;

    const [result] = results;

    return {
      totalOrders: result?.totalOrders ?? 0,
      totalIncome: result?.totalIncome ?? 0,
    };
  }
}

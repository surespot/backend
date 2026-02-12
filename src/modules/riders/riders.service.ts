import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { RidersRepository } from './riders.repository';
import { AuthRepository } from '../auth/auth.repository';
import { RegionsRepository } from '../regions/regions.repository';
import { SmsService } from '../sms/sms.service';
import { MailService } from '../mail/mail.service';
import { CloudinaryService } from '../../common/cloudinary/cloudinary.service';
import {
  CreateRiderProfileDto,
  CreateRiderDocumentationDto,
  UpdateRiderStatusDto,
  QueryRiderProfilesDto,
  InitiateRiderRegistrationDto,
  CompleteRiderRegistrationDto,
} from './dto';
import {
  RiderProfileDocument,
  RiderStatus,
  SCHEDULE_TYPE_MAP,
} from './schemas/rider-profile.schema';
import { RiderDocumentationDocument } from './schemas/rider-documentation.schema';
import { UserRole } from '../auth/schemas/user.schema';
import { OrdersRepository } from '../orders/orders.repository';
import { TransactionsRepository } from '../transactions/transactions.repository';

@Injectable()
export class RidersService {
  private readonly logger = new Logger(RidersService.name);

  constructor(
    private readonly ridersRepository: RidersRepository,
    private readonly authRepository: AuthRepository,
    private readonly regionsRepository: RegionsRepository,
    private readonly smsService: SmsService,
    private readonly mailService: MailService,
    private readonly cloudinaryService: CloudinaryService,
    private readonly ordersRepository: OrdersRepository,
    private readonly transactionsRepository: TransactionsRepository,
  ) {}

  // ============ ADMIN METHODS ============

  /**
   * Create a new rider profile (Admin only)
   */
  async createRiderProfile(dto: CreateRiderProfileDto) {
    // Validate region exists
    const region = await this.regionsRepository.findById(dto.regionId);
    if (!region) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'INVALID_REGION',
          message: 'Region not found',
        },
      });
    }

    // Check if phone or email already exists in rider profiles
    if (dto.phone) {
      const existingByPhone = await this.findProfileByPhone(dto.phone);
      if (existingByPhone) {
        throw new ConflictException({
          success: false,
          error: {
            code: 'PHONE_ALREADY_REGISTERED',
            message: 'A rider profile with this phone number already exists',
          },
        });
      }
    }

    if (dto.email) {
      const existingByEmail = await this.findProfileByEmail(dto.email);
      if (existingByEmail) {
        throw new ConflictException({
          success: false,
          error: {
            code: 'EMAIL_ALREADY_REGISTERED',
            message: 'A rider profile with this email already exists',
          },
        });
      }
    }

    // Generate unique registration code
    const registrationCode = await this.generateRegistrationCode();

    // Create rider profile (no transaction needed for single operation)
    const profile = await this.ridersRepository.createProfile({
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone,
          email: dto.email,
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
          address: dto.address,
          nin: dto.nin,
          regionId: new Types.ObjectId(dto.regionId),
          registrationCode,
      schedule: dto.schedule || [...SCHEDULE_TYPE_MAP['full-time']],
    });

      // Send registration code (don't fail if delivery fails)
      await this.sendRegistrationCode(profile);

      this.logger.log(
      `Rider profile created: ${profile._id.toString()}, code: ${this.maskCode(registrationCode)}`,
      );

      return {
        success: true,
        message: 'Rider profile created successfully',
        data: {
          id: profile._id.toString(),
          firstName: profile.firstName,
          lastName: profile.lastName,
          phone: this.maskPhone(profile.phone),
          email: this.maskEmail(profile.email),
          regionId: profile.regionId.toString(),
          registrationCode: registrationCode, // Return full code for admin
          status: profile.status,
          createdAt: profile.createdAt,
        },
      };
  }

  /**
   * Upload/Update rider documentation (Admin only)
   */
  async uploadDocumentation(
    dto: CreateRiderDocumentationDto,
    files?: {
      governmentId?: Express.Multer.File;
      proofOfAddress?: Express.Multer.File;
      passportPhotograph?: Express.Multer.File;
      bankAccountDetails?: Express.Multer.File;
      vehicleDocumentation?: Express.Multer.File;
    },
  ) {
    // Validate rider profile exists
    const profile = await this.ridersRepository.findById(dto.riderProfileId);
    if (!profile) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'RIDER_PROFILE_NOT_FOUND',
          message: 'Rider profile not found',
        },
      });
    }

    const documentData: Record<string, unknown> = {
      riderProfileId: new Types.ObjectId(dto.riderProfileId),
    };

    // Upload files if provided
    if (files) {
      const uploadPromises: Promise<void>[] = [];

      const fileEntries = Object.entries(files) as [
        string,
        Express.Multer.File | undefined,
      ][];

      for (const [key, file] of fileEntries) {
        if (file) {
          uploadPromises.push(
            this.cloudinaryService.uploadImage(file).then((result) => {
              if (
                'secure_url' in result &&
                typeof result.secure_url === 'string'
              ) {
                documentData[key] = {
                  name: file.originalname,
                  url: result.secure_url,
                  uploadedAt: new Date(),
                };
              }
            }),
          );
        }
      }

      await Promise.all(uploadPromises);
    }

    // Add document info from DTO if no file uploaded but URL provided
    const docFields = [
      'governmentId',
      'proofOfAddress',
      'passportPhotograph',
      'bankAccountDetails',
      'vehicleDocumentation',
    ] as const;

    for (const field of docFields) {
      const docInfo = dto[field];
      if (docInfo && !documentData[field]) {
        documentData[field] = {
          name: docInfo.name,
          url: docInfo.url,
          uploadedAt: new Date(),
        };
      }
    }

    // Add emergency contact
    if (dto.emergencyContact) {
      documentData.emergencyContact = dto.emergencyContact;
    }

    // Create or update documentation
    const documentation = await this.ridersRepository.updateDocumentation(
      dto.riderProfileId,
      documentData,
    );

    this.logger.log(
      `Documentation updated for rider profile: ${dto.riderProfileId}`,
    );

    return {
      success: true,
      message: 'Documentation uploaded successfully',
      data: this.formatDocumentation(documentation!),
    };
  }

  /**
   * Get all rider profiles with filters (Admin only)
   */
  async getProfiles(query: QueryRiderProfilesDto) {
    const result = await this.ridersRepository.findProfiles(
      {
        status: query.status,
        regionId: query.regionId,
      },
      {
        page: query.page,
        limit: query.limit,
      },
    );

    return {
      success: true,
      message: 'Rider profiles retrieved successfully',
      data: {
        profiles: result.profiles.map((p) => this.formatProfile(p)),
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: result.totalPages,
        },
      },
    };
  }

  /**
   * Get a single rider profile by ID (Admin only)
   */
  async getProfileById(id: string) {
    const profile = await this.ridersRepository.findById(id);
    if (!profile) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'RIDER_PROFILE_NOT_FOUND',
          message: 'Rider profile not found',
        },
      });
    }

    const documentation =
      await this.ridersRepository.findDocumentationByProfileId(id);

    return {
      success: true,
      message: 'Rider profile retrieved successfully',
      data: {
        ...this.formatProfile(profile, false), // Don't mask for admin
        documentation: documentation
          ? this.formatDocumentation(documentation)
          : null,
      },
    };
  }

  /**
   * Update rider status (Admin only)
   */
  async updateRiderStatus(id: string, dto: UpdateRiderStatusDto) {
    const profile = await this.ridersRepository.findById(id);
    if (!profile) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'RIDER_PROFILE_NOT_FOUND',
          message: 'Rider profile not found',
        },
      });
    }

    const updated = await this.ridersRepository.updateProfile(id, {
      status: dto.status,
    });

    this.logger.log(`Rider ${id} status updated to ${dto.status}`);

    return {
      success: true,
      message: 'Rider status updated successfully',
      data: this.formatProfile(updated!, false),
    };
  }

  /**
   * Resend registration code (Admin only)
   */
  async resendRegistrationCode(id: string) {
    const profile = await this.ridersRepository.findById(id);
    if (!profile) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'RIDER_PROFILE_NOT_FOUND',
          message: 'Rider profile not found',
        },
      });
    }

    if (profile.status !== RiderStatus.PENDING) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'INVALID_RIDER_STATUS',
          message: 'Can only resend code for riders with pending status',
        },
      });
    }

    await this.sendRegistrationCode(profile);

    return {
      success: true,
      message: 'Registration code resent successfully',
    };
  }

  // ============ PUBLIC METHODS (Rider Registration) ============

  /**
   * Get rider profile by registration code (Public - for app confirmation screen)
   */
  async getProfileByRegistrationCode(code: string) {
    // Validate code format
    if (!/^\d{16}$/.test(code)) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'INVALID_REGISTRATION_CODE',
          message: 'Registration code must be exactly 16 digits',
        },
      });
    }

    const profile = await this.ridersRepository.findByRegistrationCode(code);
    if (!profile) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'RIDER_PROFILE_NOT_FOUND',
          message: 'Invalid registration code',
        },
      });
    }

    if (profile.status !== RiderStatus.PENDING) {
      throw new ConflictException({
        success: false,
        error: {
          code: 'RIDER_ALREADY_REGISTERED',
          message: 'This registration code has already been used',
        },
      });
    }

    return {
      success: true,
      message: 'Rider profile found',
      data: {
        id: profile._id.toString(),
        firstName: profile.firstName,
        lastName: profile.lastName,
        email: this.maskEmail(profile.email),
        phone: this.maskPhone(profile.phone),
        dateOfBirth: profile.dateOfBirth,
        address: profile.address,
        nin: profile.nin ? this.maskNin(profile.nin) : undefined,
        regionId: profile.regionId.toString(),
      },
    };
  }

  /**
   * Initiate rider registration - validates code and name match
   */
  async initiateRegistration(dto: InitiateRiderRegistrationDto) {
    const profile = await this.ridersRepository.findByRegistrationCode(
      dto.registrationCode,
    );

    if (!profile) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'RIDER_PROFILE_NOT_FOUND',
          message: 'Invalid registration code',
        },
      });
    }

    if (profile.status !== RiderStatus.PENDING) {
      throw new ConflictException({
        success: false,
        error: {
          code: 'RIDER_ALREADY_REGISTERED',
          message: 'This registration code has already been used',
        },
      });
    }

    // Validate name match (case-insensitive)
    const firstNameMatch =
      profile.firstName?.toLowerCase() === dto.firstName.toLowerCase();
    const lastNameMatch =
      profile.lastName?.toLowerCase() === dto.lastName.toLowerCase();

    if (!firstNameMatch || !lastNameMatch) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'NAME_MISMATCH',
          message: 'Name does not match the registration record',
        },
      });
    }

    // Return profile data for confirmation
    return {
      success: true,
      message: 'Registration initiated successfully',
      data: {
        id: profile._id.toString(),
        firstName: profile.firstName,
        lastName: profile.lastName,
        email: profile.email,
        phone: profile.phone,
        dateOfBirth: profile.dateOfBirth,
        address: profile.address,
        nin: profile.nin,
        regionId: profile.regionId.toString(),
        schedule: profile.schedule,
      },
    };
  }

  /**
   * Complete rider registration - creates user account and links to profile
   * Note: This should be called AFTER email and phone verification
   */
  async completeRegistration(
    dto: CompleteRiderRegistrationDto,
    userId: string,
  ) {
    const profile = await this.ridersRepository.findByRegistrationCode(
      dto.registrationCode,
    );

    if (!profile) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'RIDER_PROFILE_NOT_FOUND',
          message: 'Invalid registration code',
        },
      });
    }

    if (profile.status !== RiderStatus.PENDING) {
      throw new ConflictException({
        success: false,
        error: {
          code: 'RIDER_ALREADY_REGISTERED',
          message: 'This registration code has already been used',
        },
      });
    }

    // Verify the user exists
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

    try {
      // Update user with rider info from profile
      const userUpdates: {
        firstName?: string;
        lastName?: string;
        birthday?: Date;
        role: UserRole;
        isRider: boolean;
        email?: string;
        isEmailVerified?: boolean;
      } = {
        firstName: profile.firstName,
        lastName: profile.lastName,
        birthday: profile.dateOfBirth,
        role: UserRole.RIDER,
        isRider: true,
      };

      // Sync email from rider profile if available
      if (profile.email) {
        userUpdates.email = profile.email;
        userUpdates.isEmailVerified = true; // Email from rider profile is considered verified
      }

      await this.authRepository.updateUser(userId, userUpdates);

      // Link user to profile and activate
      const updatedProfile = await this.ridersRepository.updateProfile(
        profile._id,
        {
          userId: new Types.ObjectId(userId),
          schedule: dto.schedule || profile.schedule,
          status: RiderStatus.ACTIVE,
        },
      );

      if (!updatedProfile) {
        throw new InternalServerErrorException({
          success: false,
          error: {
            code: 'REGISTRATION_FAILED',
            message: 'Failed to update rider profile',
          },
        });
      }

      this.logger.log(
        `Rider registration completed: profile=${profile._id.toString()}, user=${userId}`,
      );

      return {
        success: true,
        message: 'Rider registration completed successfully',
        data: {
          profileId: updatedProfile._id.toString(),
          userId: userId,
          status: updatedProfile.status,
          schedule: updatedProfile.schedule,
        },
      };
    } catch (error) {
      this.logger.error('Failed to complete rider registration', {
        error: error instanceof Error ? error.message : String(error),
        profileId: profile._id.toString(),
        userId,
      });

      // Re-throw if it's already a known exception
      if (
        error instanceof NotFoundException ||
        error instanceof ConflictException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }

      throw new InternalServerErrorException({
        success: false,
        error: {
          code: 'REGISTRATION_FAILED',
          message: 'Failed to complete registration. Please try again.',
        },
      });
    }
  }

  // ============ RIDER METHODS ============

  /**
   * Find rider profile by user ID (internal use)
   */
  async findProfileByUserId(
    userId: string,
  ): Promise<RiderProfileDocument | null> {
    return this.ridersRepository.findByUserId(userId);
  }

  /**
   * Get rider profile by user ID
   */
  async getProfileByUserId(userId: string) {
    const profile = await this.ridersRepository.findByUserId(userId);
    if (!profile) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'RIDER_PROFILE_NOT_FOUND',
          message: 'Rider profile not found for this user',
        },
      });
    }

    // Fetch profile and stats
    const formattedProfile = this.formatProfile(profile, false);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const [todayStats, todayTransactionStats] = await Promise.all([
      this.ordersRepository.getTodayStatsForRider(profile._id.toString()),
      this.transactionsRepository.getRiderTransactionStats(
        profile._id.toString(),
        todayStart,
        todayEnd,
      ),
    ]);

    // Calculate distance covered in kilometers
    const distanceCoveredKm = (profile.totalDistanceToday || 0) / 1000;

    // Calculate time online
    let timeOnlineMinutes = profile.totalOnlineTimeToday || 0;

    // If there's an active session today, add current session time
    if (profile.sessionStartTime && profile.sessionStartTime >= todayStart) {
      const sessionMinutes = Math.floor(
        (Date.now() - profile.sessionStartTime.getTime()) / (1000 * 60),
      );
      timeOnlineMinutes += sessionMinutes;
    }

    const hours = Math.floor(timeOnlineMinutes / 60);
    const minutes = timeOnlineMinutes % 60;
    const timeOnlineFormatted =
      hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

    const todayEarnings = todayTransactionStats.totalEarnings;

    const stats = {
      today: {
        completedOrders: todayStats.completedOrders,
        earnings: todayEarnings,
        earningsFormatted: `₦${(todayEarnings / 100).toLocaleString('en-NG')}`,
        distanceCoveredKm: Math.round(distanceCoveredKm * 100) / 100, // Round to 2 decimal places
        distanceCoveredFormatted: `${Math.round(distanceCoveredKm * 100) / 100} km`,
        timeOnlineMinutes,
        timeOnlineFormatted,
      },
    };

    return {
      success: true,
      message: 'Rider profile retrieved successfully',
      data: {
        ...formattedProfile,
        stats,
      },
    };
  }

  /**
   * Update rider work schedule
   */
  async updateSchedule(userId: string, schedule: number[]) {
    const profile = await this.ridersRepository.findByUserId(userId);
    if (!profile) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'RIDER_PROFILE_NOT_FOUND',
          message: 'Rider profile not found for this user',
        },
      });
    }

    // Validate schedule
    const validDays = schedule.every((day) => day >= 0 && day <= 6);
    if (!validDays || schedule.length === 0 || schedule.length > 7) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'INVALID_SCHEDULE',
          message: 'Schedule must contain 1-7 days with values 0-6',
        },
      });
    }

    const updated = await this.ridersRepository.updateProfile(profile._id, {
      schedule,
    });

    return {
      success: true,
      message: 'Schedule updated successfully',
      data: {
        schedule: updated!.schedule,
      },
    };
  }

  // ============ HELPER METHODS ============

  /**
   * Generate a unique 16-digit registration code
   */
  private async generateRegistrationCode(): Promise<string> {
    const maxAttempts = 5;

    for (let i = 0; i < maxAttempts; i++) {
      const code = this.generateRandomCode(16);
      const exists = await this.ridersRepository.registrationCodeExists(code);
      if (!exists) {
        return code;
      }
    }

    throw new InternalServerErrorException({
      success: false,
      error: {
        code: 'REGISTRATION_CODE_GENERATION_FAILED',
        message: 'Failed to generate unique registration code',
      },
    });
  }

  /**
   * Generate a random numeric code of specified length
   */
  private generateRandomCode(length: number): string {
    let code = '';
    for (let i = 0; i < length; i++) {
      code += Math.floor(Math.random() * 10).toString();
    }
    return code;
  }

  /**
   * Send registration code via SMS and/or Email
   */
  private async sendRegistrationCode(
    profile: RiderProfileDocument,
  ): Promise<void> {
    const message = `Welcome to SureSpot! Your rider registration code is: ${profile.registrationCode}. Use this code in the SureSpot Riders app to complete your registration. Do not share this code with anyone.`;

    const deliveryPromises: Promise<unknown>[] = [];

    // Send SMS if phone exists
    if (profile.phone) {
      deliveryPromises.push(
        this.smsService
          .sendSms({
            from: 'SureSpot',
            to: profile.phone,
            body: message,
          })
          .catch((error) => {
            this.logger.error('Failed to send registration code SMS', {
              phone: this.maskPhone(profile.phone),
              error: error instanceof Error ? error.message : String(error),
            });
          }),
      );
    }

    // Send email if exists
    if (profile.email) {
      deliveryPromises.push(
        this.sendRegistrationCodeEmail(
          profile.email,
          profile.registrationCode,
        ).catch((error) => {
            this.logger.error('Failed to send registration code email', {
              email: this.maskEmail(profile.email),
              error: error instanceof Error ? error.message : String(error),
            });
          }),
      );
    }

    await Promise.allSettled(deliveryPromises);
  }

  /**
   * Send registration code via email
   */
  private async sendRegistrationCodeEmail(
    email: string,
    code: string,
  ): Promise<void> {
    // Using OTP email template with registration purpose
    await this.mailService.sendOtpEmail({
      to: email,
      otp: code,
      purpose: 'registration',
      expiresInMinutes: undefined, // Code doesn't expire
    });
  }

  /**
   * Find profile by phone
   */
  private async findProfileByPhone(
    phone: string,
  ): Promise<RiderProfileDocument | null> {
    const profiles = await this.ridersRepository.findProfiles(
      {},
      { limit: 1000 },
    );
    return profiles.profiles.find((p) => p.phone === phone) || null;
  }

  /**
   * Find profile by email
   */
  private async findProfileByEmail(
    email: string,
  ): Promise<RiderProfileDocument | null> {
    const profiles = await this.ridersRepository.findProfiles(
      {},
      { limit: 1000 },
    );
    return profiles.profiles.find((p) => p.email === email) || null;
  }

  /**
   * Format profile for response
   */
  private formatProfile(profile: RiderProfileDocument, mask = true) {
    return {
      id: profile._id.toString(),
      userId: profile.userId?.toString() || null,
      firstName: profile.firstName,
      lastName: profile.lastName,
      phone: mask ? this.maskPhone(profile.phone) : profile.phone,
      email: mask ? this.maskEmail(profile.email) : profile.email,
      dateOfBirth: profile.dateOfBirth,
      address: profile.address,
      nin: mask ? this.maskNin(profile.nin) : profile.nin,
      regionId: profile.regionId.toString(),
      schedule: profile.schedule,
      rating: profile.rating,
      status: profile.status,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }

  /**
   * Format documentation for response
   */
  private formatDocumentation(doc: RiderDocumentationDocument) {
    return {
      id: doc._id.toString(),
      riderProfileId: doc.riderProfileId.toString(),
      governmentId: doc.governmentId,
      proofOfAddress: doc.proofOfAddress,
      passportPhotograph: doc.passportPhotograph,
      bankAccountDetails: doc.bankAccountDetails,
      vehicleDocumentation: doc.vehicleDocumentation,
      emergencyContact: doc.emergencyContact,
    };
  }

  // ============ MASKING HELPERS ============

  private maskPhone(phone?: string): string | undefined {
    if (!phone) return undefined;
    if (phone.length < 6) return '****';
    return phone.substring(0, 4) + '****' + phone.substring(phone.length - 3);
  }

  private maskEmail(email?: string): string | undefined {
    if (!email || !email.includes('@')) return undefined;
    const [local, domain] = email.split('@');
    if (local.length <= 2) return `${local[0]}***@${domain}`;
    return `${local.substring(0, 2)}****@${domain}`;
  }

  private maskNin(nin?: string): string | undefined {
    if (!nin) return undefined;
    if (nin.length < 4) return '****';
    return nin.substring(0, 2) + '****' + nin.substring(nin.length - 2);
  }

  private maskCode(code: string): string {
    return code.substring(0, 4) + '********' + code.substring(code.length - 4);
  }
}

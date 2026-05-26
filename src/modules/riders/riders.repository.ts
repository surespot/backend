import { Injectable } from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Types, Connection, ClientSession } from 'mongoose';
import {
  RiderProfile,
  RiderProfileDocument,
  RiderStatus,
} from './schemas/rider-profile.schema';
import {
  RiderDocumentation,
  RiderDocumentationDocument,
} from './schemas/rider-documentation.schema';

export interface CreateRiderProfileData {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  dateOfBirth?: Date;
  address?: string;
  nin?: string;
  regionId: Types.ObjectId;
  registrationCode: string;
  schedule?: number[];
}

export interface CreateRiderDocumentationData {
  riderProfileId: Types.ObjectId;
  governmentId?: { name: string; url?: string; uploadedAt?: Date };
  proofOfAddress?: { name: string; url?: string; uploadedAt?: Date };
  passportPhotograph?: { name: string; url?: string; uploadedAt?: Date };
  bankAccountDetails?: { name: string; url?: string; uploadedAt?: Date };
  vehicleDocumentation?: { name: string; url?: string; uploadedAt?: Date };
  emergencyContact?: { name: string; phone: string; relationship?: string };
}

export interface RiderProfileFilters {
  status?: RiderStatus;
  regionId?: Types.ObjectId | string;
}

export interface PaginationOptions {
  page?: number;
  limit?: number;
}

@Injectable()
export class RidersRepository {
  constructor(
    @InjectModel(RiderProfile.name)
    private riderProfileModel: Model<RiderProfileDocument>,
    @InjectModel(RiderDocumentation.name)
    private riderDocumentationModel: Model<RiderDocumentationDocument>,
    @InjectConnection() private connection: Connection,
  ) {}

  // ============ SESSION METHODS ============

  async startSession(): Promise<ClientSession> {
    return this.connection.startSession();
  }

  // ============ RIDER PROFILE METHODS ============

  async createProfile(
    data: CreateRiderProfileData,
    session?: ClientSession,
  ): Promise<RiderProfileDocument> {
    const options = session ? { session } : {};
    const [profile] = await this.riderProfileModel.create([data], options);
    return profile;
  }

  async findByRegistrationCode(
    code: string,
  ): Promise<RiderProfileDocument | null> {
    return this.riderProfileModel.findOne({ registrationCode: code }).exec();
  }

  async findById(
    id: string | Types.ObjectId,
  ): Promise<RiderProfileDocument | null> {
    return this.riderProfileModel.findById(id).exec();
  }

  async findByIdWithRegion(
    id: string | Types.ObjectId,
  ): Promise<RiderProfileDocument | null> {
    return this.riderProfileModel
      .findById(id)
      .populate('regionId', 'name')
      .exec();
  }

  async findByUserId(
    userId: string | Types.ObjectId,
  ): Promise<RiderProfileDocument | null> {
    // Convert string to ObjectId if needed for proper query matching
    const userIdObjectId =
      typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
    return this.riderProfileModel.findOne({ userId: userIdObjectId }).exec();
  }

  async anonymizeByUserId(userId: string | Types.ObjectId): Promise<void> {
    const userIdObjectId =
      typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
    await this.riderProfileModel
      .findOneAndUpdate(
        { userId: userIdObjectId },
        {
          $set: {
            firstName: null,
            lastName: null,
            phone: null,
            email: null,
            dateOfBirth: null,
            address: null,
            nin: null,
          },
        },
      )
      .exec();
  }

  async updateProfile(
    id: string | Types.ObjectId,
    updates: Partial<RiderProfile>,
    session?: ClientSession,
  ): Promise<RiderProfileDocument | null> {
    return this.riderProfileModel
      .findByIdAndUpdate(id, { $set: updates }, { new: true, session })
      .exec();
  }

  async incrementProfile(
    id: string | Types.ObjectId,
    increments: Partial<Record<keyof RiderProfile, number>>,
    session?: ClientSession,
  ): Promise<RiderProfileDocument | null> {
    return this.riderProfileModel
      .findByIdAndUpdate(id, { $inc: increments }, { new: true, session })
      .exec();
  }

  async findProfiles(
    filters: RiderProfileFilters = {},
    pagination: PaginationOptions = {},
  ): Promise<{
    profiles: RiderProfileDocument[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const { page = 1, limit = 20 } = pagination;
    const skip = (page - 1) * limit;

    const query: Record<string, unknown> = {};

    if (filters.status) {
      query.status = filters.status;
    }

    if (filters.regionId) {
      query.regionId =
        typeof filters.regionId === 'string'
          ? new Types.ObjectId(filters.regionId)
          : filters.regionId;
    }

    const [profiles, total] = await Promise.all([
      this.riderProfileModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('regionId', 'name')
        .exec(),
      this.riderProfileModel.countDocuments(query).exec(),
    ]);

    return {
      profiles,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ============ RIDER DOCUMENTATION METHODS ============

  async createDocumentation(
    data: CreateRiderDocumentationData,
    session?: ClientSession,
  ): Promise<RiderDocumentationDocument> {
    const [doc] = await this.riderDocumentationModel.create([data], {
      session,
    });
    return doc;
  }

  async findDocumentationByProfileId(
    profileId: string | Types.ObjectId,
  ): Promise<RiderDocumentationDocument | null> {
    const id =
      typeof profileId === 'string' ? new Types.ObjectId(profileId) : profileId;
    return this.riderDocumentationModel.findOne({ riderProfileId: id }).exec();
  }

  /**
   * Find all documentation records for a rider profile.
   * Historically, multiple docs could exist for the same profileId; callers
   * can merge them if needed.
   */
  async findAllDocumentationByProfileId(
    profileId: string | Types.ObjectId,
  ): Promise<RiderDocumentationDocument[]> {
    const id =
      typeof profileId === 'string' ? new Types.ObjectId(profileId) : profileId;
    return this.riderDocumentationModel.find({ riderProfileId: id }).exec();
  }

  async updateDocumentation(
    profileId: string | Types.ObjectId,
    updates: Partial<RiderDocumentation>,
    session?: ClientSession,
  ): Promise<RiderDocumentationDocument | null> {
    const id =
      typeof profileId === 'string' ? new Types.ObjectId(profileId) : profileId;
    return this.riderDocumentationModel
      .findOneAndUpdate(
        { riderProfileId: id },
        { $set: updates },
        { new: true, upsert: true, session },
      )
      .exec();
  }

  /**
   * Find rider profiles with email for newsletter (all riders or by region).
   */
  async findNewsletterRecipients(
    regionId?: string | Types.ObjectId,
  ): Promise<Array<{ email: string; firstName: string }>> {
    const query: Record<string, unknown> = {
      email: { $exists: true, $ne: '' },
    };
    if (regionId) {
      query.regionId =
        typeof regionId === 'string' ? new Types.ObjectId(regionId) : regionId;
    }
    const profiles = await this.riderProfileModel
      .find(query)
      .select('email firstName')
      .lean()
      .exec();
    return profiles
      .filter((p) => p.email)
      .map((p) => ({
        email: p.email as string,
        firstName: (p.firstName as string) || 'there',
      }));
  }

  // ============ CODE EXISTENCE CHECK ============

  async registrationCodeExists(code: string): Promise<boolean> {
    const profile = await this.riderProfileModel
      .findOne({ registrationCode: code })
      .select('_id')
      .lean()
      .exec();
    return !!profile;
  }

  async findDemoRider(): Promise<RiderProfileDocument | null> {
    return this.riderProfileModel.findOne({ isDemo: true }).exec();
  }
}

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import {
  OtpCode,
  OtpCodeDocument,
  OtpPurpose,
} from './schemas/otp-code.schema';
import {
  RefreshToken,
  RefreshTokenDocument,
} from './schemas/refresh-token.schema';

@Injectable()
export class AuthRepository {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(OtpCode.name) private otpCodeModel: Model<OtpCodeDocument>,
    @InjectModel(RefreshToken.name)
    private refreshTokenModel: Model<RefreshTokenDocument>,
  ) {}

  // ============ USER METHODS ============

  async findUserByPhone(phone: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ phone, deletedAt: null }).exec();
  }

  async findUserByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email, deletedAt: null }).exec();
  }

  async findUserById(
    id: string | Types.ObjectId,
  ): Promise<UserDocument | null> {
    return this.userModel.findOne({ _id: id, deletedAt: null }).exec();
  }

  async findUserByPickupLocationId(
    pickupLocationId: string | Types.ObjectId,
  ): Promise<UserDocument | null> {
    return this.userModel
      .findOne({ pickupLocationId, deletedAt: null })
      .exec();
  }

  async findUserByGoogleId(googleId: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ googleId, deletedAt: null }).exec();
  }

  async findUserByEmailOrPhone(
    identifier: string,
  ): Promise<UserDocument | null> {
    // Check if identifier is an email (contains @)
    const isEmail = identifier.includes('@');

    if (isEmail) {
      return this.userModel
        .findOne({ email: identifier, deletedAt: null })
        .exec();
    } else {
      return this.userModel
        .findOne({ phone: identifier, deletedAt: null })
        .exec();
    }
  }

  async createUser(userData: Partial<User>): Promise<UserDocument> {
    const user = new this.userModel(userData);
    return user.save();
  }

  async updateUser(
    userId: string | Types.ObjectId,
    updates: Partial<User>,
  ): Promise<UserDocument | null> {
    return this.userModel
      .findByIdAndUpdate(userId, { $set: updates }, { new: true })
      .exec();
  }

  async updateLastLoginAt(userId: string | Types.ObjectId): Promise<void> {
    await this.userModel
      .findByIdAndUpdate(userId, { $set: { lastLoginAt: new Date() } })
      .exec();
  }

  async softDeleteUser(userId: string | Types.ObjectId): Promise<void> {
    await this.userModel
      .findByIdAndUpdate(userId, {
        $set: { deletedAt: new Date(), isActive: false },
      })
      .exec();
  }

  // ============ OTP CODE METHODS ============

  async createOtpCode(
    identifier: string,
    code: string,
    purpose: OtpPurpose,
    expiresAt: Date,
  ): Promise<OtpCodeDocument> {
    // Determine if identifier is email or phone
    const isEmail = identifier.includes('@');
    const otpCode = new this.otpCodeModel({
      ...(isEmail ? { email: identifier } : { phone: identifier }),
      code,
      purpose,
      expiresAt,
      attempts: 0,
      isVerified: false,
    });
    return otpCode.save();
  }

  async findLatestOtpCode(
    identifier: string,
    purpose: OtpPurpose,
  ): Promise<OtpCodeDocument | null> {
    // Determine if identifier is email or phone
    const isEmail = identifier.includes('@');
    const query = isEmail
      ? {
          email: identifier,
          purpose,
          expiresAt: { $gt: new Date() },
          isVerified: false,
        }
      : {
          phone: identifier,
          purpose,
          expiresAt: { $gt: new Date() },
          isVerified: false,
        };

    return this.otpCodeModel.findOne(query).sort({ createdAt: -1 }).exec();
  }

  async incrementOtpAttempts(otpId: string | Types.ObjectId): Promise<void> {
    await this.otpCodeModel
      .findByIdAndUpdate(otpId, { $inc: { attempts: 1 } })
      .exec();
  }

  async markOtpAsVerified(otpId: string | Types.ObjectId): Promise<void> {
    await this.otpCodeModel
      .findByIdAndUpdate(otpId, {
        $set: { isVerified: true, verifiedAt: new Date() },
      })
      .exec();
  }

  async invalidateOtpCodes(
    identifier: string,
    purpose: OtpPurpose,
  ): Promise<void> {
    // Determine if identifier is email or phone
    const isEmail = identifier.includes('@');
    const query = isEmail
      ? { email: identifier, purpose, isVerified: false }
      : { phone: identifier, purpose, isVerified: false };

    await this.otpCodeModel
      .updateMany(query, { $set: { expiresAt: new Date() } })
      .exec();
  }

  // ============ REFRESH TOKEN METHODS ============

  async createRefreshToken(
    userId: Types.ObjectId,
    token: string,
    family: string,
    expiresAt: Date,
  ): Promise<RefreshTokenDocument> {
    const refreshToken = new this.refreshTokenModel({
      userId,
      token,
      family,
      expiresAt,
      isRevoked: false,
    });
    return refreshToken.save();
  }

  async findRefreshToken(token: string): Promise<RefreshTokenDocument | null> {
    return this.refreshTokenModel.findOne({ token }).exec();
  }

  async revokeRefreshToken(tokenId: string | Types.ObjectId): Promise<void> {
    await this.refreshTokenModel
      .findByIdAndUpdate(tokenId, {
        $set: { isRevoked: true, revokedAt: new Date() },
      })
      .exec();
  }

  async revokeTokenFamily(family: string): Promise<void> {
    await this.refreshTokenModel
      .updateMany(
        { family, isRevoked: false },
        { $set: { isRevoked: true, revokedAt: new Date() } },
      )
      .exec();
  }

  async revokeAllUserTokens(userId: Types.ObjectId): Promise<void> {
    await this.refreshTokenModel
      .updateMany(
        { userId, isRevoked: false },
        { $set: { isRevoked: true, revokedAt: new Date() } },
      )
      .exec();
  }
}

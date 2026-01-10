import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { Types } from 'mongoose';
import { AuthRepository } from './auth.repository';
import { OtpPurpose } from './schemas/otp-code.schema';
import { UserDocument, UserRole } from './schemas/user.schema';
import { CloudinaryService } from '../../common/cloudinary/cloudinary.service';
import { MailService } from '../mail/mail.service';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { CreatePasswordDto } from './dto/create-password.dto';
import { CompleteProfileDto } from './dto/complete-profile.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LogoutDto } from './dto/logout.dto';
import { PasswordResetSendOtpDto } from './dto/password-reset-send-otp.dto';
import { PasswordResetVerifyOtpDto } from './dto/password-reset-verify-otp.dto';
import { PasswordResetUpdateDto } from './dto/password-reset-update.dto';
import { SendEmailOtpDto } from './dto/send-email-otp.dto';
import { VerifyEmailOtpDto } from './dto/verify-email-otp.dto';
import { ResendEmailOtpDto } from './dto/resend-email-otp.dto';
import { EmailPasswordResetSendOtpDto } from './dto/email-password-reset-send-otp.dto';
import { EmailPasswordResetVerifyOtpDto } from './dto/email-password-reset-verify-otp.dto';
import { AddEmailDto } from './dto/add-email.dto';
import { VerifyEmailVerificationOtpDto } from './dto/verify-email-verification-otp.dto';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthResponse {
  user: {
    id: string;
    firstName: string;
    lastName: string;
    phone?: string;
    email?: string;
    birthday?: string;
    avatar?: string;
    createdAt: Date;
  };
  tokens: TokenPair;
}

@Injectable()
export class AuthService {
  private readonly otpExpiryMinutes: number;
  private readonly otpResendSeconds: number;
  private readonly maxOtpAttempts: number;
  private readonly jwtAccessExpiry: string;
  private readonly jwtRefreshExpiry: string;

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly cloudinaryService: CloudinaryService,
    private readonly mailService: MailService,
  ) {
    this.otpExpiryMinutes = Number(
      this.configService.get('OTP_EXPIRY_MINUTES') ?? 5,
    );
    this.otpResendSeconds = Number(
      this.configService.get('OTP_RESEND_SECONDS') ?? 30,
    );
    this.maxOtpAttempts = Number(
      this.configService.get('OTP_MAX_ATTEMPTS') ?? 5,
    );
    this.jwtAccessExpiry = this.configService.get('JWT_ACCESS_EXPIRY') ?? '1h';
    this.jwtRefreshExpiry =
      this.configService.get('JWT_REFRESH_EXPIRY') ?? '30d';
  }

  // ============ HELPER METHODS FOR LOGGING ============

  private maskPhone(phone: string): string {
    if (!phone || phone.length < 4) return '****';
    const last4 = phone.slice(-4);
    const prefix = phone.slice(0, phone.length - 4).replace(/\d/g, '*');
    return prefix + last4;
  }

  private maskEmail(email: string): string {
    if (!email || !email.includes('@')) return 'u***@example.com';
    const [local, domain] = email.split('@');
    if (local.length <= 1) return `u***@${domain}`;
    const maskedLocal = local[0] + '***';
    return `${maskedLocal}@${domain}`;
  }

  private maskToken(token: string): string {
    if (!token || token.length < 4) return '****';
    return token.substring(0, 4) + '...';
  }

  private maskOtp(): string {
    return '******';
  }

  // ============ REGISTRATION FLOW ============

  async sendOtp(dto: SendOtpDto): Promise<{
    success: boolean;
    message: string;
    data: { expiresIn: number; retryAfter: number };
  }> {
    const startTime = Date.now();
    const maskedPhone = this.maskPhone(dto.phone);

    this.logger.info('Phone signup OTP request received', {
      context: 'AuthService',
      method: 'sendOtp',
      phone: maskedPhone,
      countryCode: dto.countryCode || 'not provided',
    });

    try {
      // Check if phone already registered
      const existingUser = await this.authRepository.findUserByPhone(dto.phone);
      if (existingUser) {
        const executionTime = Date.now() - startTime;
        this.logger.warn(
          'Phone signup OTP request failed - phone already registered',
          {
            context: 'AuthService',
            method: 'sendOtp',
            phone: maskedPhone,
            errorCode: 'PHONE_ALREADY_REGISTERED',
            executionTime: `${executionTime}ms`,
          },
        );
        throw new ConflictException({
          success: false,
          error: {
            code: 'PHONE_ALREADY_REGISTERED',
            message: 'This phone number is already registered',
          },
        });
      }

      // Check for recent OTP request (rate limiting)
      const latestOtp = await this.authRepository.findLatestOtpCode(
        dto.phone,
        OtpPurpose.REGISTRATION,
      );

      if (latestOtp && latestOtp.createdAt) {
        const timeSinceCreation =
          (Date.now() - latestOtp.createdAt.getTime()) / 1000;
        if (timeSinceCreation < this.otpResendSeconds) {
          const retryAfter = Math.ceil(
            this.otpResendSeconds - timeSinceCreation,
          );
          const executionTime = Date.now() - startTime;
          this.logger.warn('Phone signup OTP request rate limited', {
            context: 'AuthService',
            method: 'sendOtp',
            phone: maskedPhone,
            errorCode: 'OTP_RATE_LIMITED',
            retryAfter: `${retryAfter}s`,
            executionTime: `${executionTime}ms`,
          });
          throw new BadRequestException({
            success: false,
            error: {
              code: 'OTP_RATE_LIMITED',
              message: 'Please wait before requesting another OTP',
              details: {
                retryAfter,
              },
            },
          });
        }
      }

      // Generate 6-digit OTP
      const otpCode = this.generateOtpCode();
      const expiresAt = new Date(
        Date.now() + this.otpExpiryMinutes * 60 * 1000,
      );

      // Invalidate any existing OTPs for this phone
      await this.authRepository.invalidateOtpCodes(
        dto.phone,
        OtpPurpose.REGISTRATION,
      );

      // Save OTP to database
      await this.authRepository.createOtpCode(
        dto.phone,
        otpCode,
        OtpPurpose.REGISTRATION,
        expiresAt,
      );

      // TODO: Send OTP via SMS service
      // For now, log it (REMOVE IN PRODUCTION)
      console.log(`OTP for ${dto.phone}: ${otpCode}`);

      const executionTime = Date.now() - startTime;
      const response = {
        success: true,
        message: 'OTP sent successfully',
        data: {
          expiresIn: this.otpExpiryMinutes * 60,
          retryAfter: this.otpResendSeconds,
        },
      };

      this.logger.info('Phone signup OTP sent successfully', {
        context: 'AuthService',
        method: 'sendOtp',
        phone: maskedPhone,
        expiresIn: `${this.otpExpiryMinutes * 60}s`,
        retryAfter: `${this.otpResendSeconds}s`,
        executionTime: `${executionTime}ms`,
      });

      return response;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      if (
        error instanceof ConflictException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error(
        'Phone signup OTP request failed with unexpected error',
        {
          context: 'AuthService',
          method: 'sendOtp',
          phone: maskedPhone,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          executionTime: `${executionTime}ms`,
        },
      );
      throw error;
    }
  }

  async verifyOtp(dto: VerifyOtpDto): Promise<{
    success: boolean;
    message: string;
    data: { verificationToken: string; expiresIn: number };
  }> {
    const startTime = Date.now();
    const maskedPhone = this.maskPhone(dto.phone);
    const maskedOtp = this.maskOtp();

    this.logger.info('Phone signup OTP verification request received', {
      context: 'AuthService',
      method: 'verifyOtp',
      phone: maskedPhone,
      otp: maskedOtp,
    });

    try {
      const otpRecord = await this.authRepository.findLatestOtpCode(
        dto.phone,
        OtpPurpose.REGISTRATION,
      );

      if (!otpRecord) {
        const executionTime = Date.now() - startTime;
        this.logger.warn(
          'Phone signup OTP verification failed - OTP not found',
          {
            context: 'AuthService',
            method: 'verifyOtp',
            phone: maskedPhone,
            errorCode: 'OTP_INVALID',
            executionTime: `${executionTime}ms`,
          },
        );
        throw new BadRequestException({
          success: false,
          error: {
            code: 'OTP_INVALID',
            message: 'Invalid or expired OTP',
          },
        });
      }

      // Check if max attempts exceeded
      if (otpRecord.attempts >= this.maxOtpAttempts) {
        const executionTime = Date.now() - startTime;
        this.logger.warn(
          'Phone signup OTP verification failed - max attempts exceeded',
          {
            context: 'AuthService',
            method: 'verifyOtp',
            phone: maskedPhone,
            errorCode: 'OTP_MAX_ATTEMPTS',
            attempts: otpRecord.attempts,
            maxAttempts: this.maxOtpAttempts,
            executionTime: `${executionTime}ms`,
          },
        );
        throw new BadRequestException({
          success: false,
          error: {
            code: 'OTP_MAX_ATTEMPTS',
            message: 'Maximum OTP verification attempts exceeded',
          },
        });
      }

      // Check if OTP matches
      if (otpRecord.code !== dto.otp) {
        await this.authRepository.incrementOtpAttempts(otpRecord._id);
        const executionTime = Date.now() - startTime;
        this.logger.warn(
          'Phone signup OTP verification failed - invalid OTP code',
          {
            context: 'AuthService',
            method: 'verifyOtp',
            phone: maskedPhone,
            errorCode: 'OTP_INVALID',
            attempts: otpRecord.attempts + 1,
            maxAttempts: this.maxOtpAttempts,
            executionTime: `${executionTime}ms`,
          },
        );
        throw new BadRequestException({
          success: false,
          error: {
            code: 'OTP_INVALID',
            message: 'Invalid OTP code',
          },
        });
      }

      // Check if OTP expired
      if (otpRecord.expiresAt < new Date()) {
        const executionTime = Date.now() - startTime;
        this.logger.warn('Phone signup OTP verification failed - OTP expired', {
          context: 'AuthService',
          method: 'verifyOtp',
          phone: maskedPhone,
          errorCode: 'OTP_EXPIRED',
          expiresAt: otpRecord.expiresAt.toISOString(),
          executionTime: `${executionTime}ms`,
        });
        throw new BadRequestException({
          success: false,
          error: {
            code: 'OTP_EXPIRED',
            message: 'OTP has expired',
          },
        });
      }

      // Mark OTP as verified
      await this.authRepository.markOtpAsVerified(otpRecord._id);

      // Generate temporary verification token
      const verificationToken = this.jwtService.sign(
        { phone: dto.phone, purpose: 'phone_verification' },
        { expiresIn: '10m' },
      );

      const executionTime = Date.now() - startTime;
      const response = {
        success: true,
        message: 'OTP verified successfully',
        data: {
          verificationToken,
          expiresIn: 600, // 10 minutes
        },
      };

      this.logger.info('Phone signup OTP verified successfully', {
        context: 'AuthService',
        method: 'verifyOtp',
        phone: maskedPhone,
        verificationToken: this.maskToken(verificationToken),
        expiresIn: '600s',
        executionTime: `${executionTime}ms`,
      });

      return response;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(
        'Phone signup OTP verification failed with unexpected error',
        {
          context: 'AuthService',
          method: 'verifyOtp',
          phone: maskedPhone,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          executionTime: `${executionTime}ms`,
        },
      );
      throw error;
    }
  }

  async resendOtp(dto: ResendOtpDto): Promise<{
    success: boolean;
    message: string;
    data: { expiresIn: number; retryAfter: number };
  }> {
    const startTime = Date.now();
    const maskedPhone = this.maskPhone(dto.phone);

    this.logger.info('Phone signup OTP resend request received', {
      context: 'AuthService',
      method: 'resendOtp',
      phone: maskedPhone,
    });

    try {
      const result = await this.sendOtp({
        ...dto,
        countryCode: dto.phone.substring(0, 4),
      });
      const executionTime = Date.now() - startTime;
      this.logger.info('Phone signup OTP resent successfully', {
        context: 'AuthService',
        method: 'resendOtp',
        phone: maskedPhone,
        expiresIn: `${result.data.expiresIn}s`,
        retryAfter: `${result.data.retryAfter}s`,
        executionTime: `${executionTime}ms`,
      });
      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.logger.error('Phone signup OTP resend failed', {
        context: 'AuthService',
        method: 'resendOtp',
        phone: maskedPhone,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        executionTime: `${executionTime}ms`,
      });
      throw error;
    }
  }

  // ============ EMAIL REGISTRATION FLOW ============

  async sendEmailOtp(dto: SendEmailOtpDto): Promise<{
    success: boolean;
    message: string;
    data: { expiresIn: number; retryAfter: number };
  }> {
    const startTime = Date.now();
    const maskedEmail = this.maskEmail(dto.email);

    this.logger.info('Email signup OTP request received', {
      context: 'AuthService',
      method: 'sendEmailOtp',
      email: maskedEmail,
    });

    try {
      // Check if email already registered
      const existingUser = await this.authRepository.findUserByEmail(dto.email);
      if (existingUser) {
        const executionTime = Date.now() - startTime;
        this.logger.warn(
          'Email signup OTP request failed - email already registered',
          {
            context: 'AuthService',
            method: 'sendEmailOtp',
            email: maskedEmail,
            errorCode: 'EMAIL_ALREADY_REGISTERED',
            executionTime: `${executionTime}ms`,
          },
        );
        throw new ConflictException({
          success: false,
          error: {
            code: 'EMAIL_ALREADY_REGISTERED',
            message: 'This email address is already registered',
          },
        });
      }

      // Check for recent OTP request (rate limiting)
      const latestOtp = await this.authRepository.findLatestOtpCode(
        dto.email,
        OtpPurpose.REGISTRATION,
      );

      if (latestOtp && latestOtp.createdAt) {
        const timeSinceCreation =
          (Date.now() - latestOtp.createdAt.getTime()) / 1000;
        if (timeSinceCreation < this.otpResendSeconds) {
          const retryAfter = Math.ceil(
            this.otpResendSeconds - timeSinceCreation,
          );
          const executionTime = Date.now() - startTime;
          this.logger.warn('Email signup OTP request rate limited', {
            context: 'AuthService',
            method: 'sendEmailOtp',
            email: maskedEmail,
            errorCode: 'EMAIL_OTP_RATE_LIMITED',
            retryAfter: `${retryAfter}s`,
            executionTime: `${executionTime}ms`,
          });
          throw new BadRequestException({
            success: false,
            error: {
              code: 'EMAIL_OTP_RATE_LIMITED',
              message: 'Please wait before requesting another OTP',
              details: {
                retryAfter,
              },
            },
          });
        }
      }

      // Generate 6-digit OTP
      const otpCode = this.generateOtpCode();
      const expiresAt = new Date(
        Date.now() + this.otpExpiryMinutes * 60 * 1000,
      );

      // Invalidate any existing OTPs for this email
      await this.authRepository.invalidateOtpCodes(
        dto.email,
        OtpPurpose.REGISTRATION,
      );

      // Save OTP to database
      await this.authRepository.createOtpCode(
        dto.email,
        otpCode,
        OtpPurpose.REGISTRATION,
        expiresAt,
      );

      // Send OTP via email service
      try {
        await this.mailService.sendOtpEmail({
          to: dto.email,
          otp: otpCode,
          purpose: 'registration',
          expiresInMinutes: this.otpExpiryMinutes,
        });
      } catch (error) {
        this.logger.error(
          `Failed to send email OTP to ${this.maskEmail(dto.email)}`,
          {
            error: error instanceof Error ? error.message : String(error),
          },
        );
        // Don't throw - OTP is still saved, user can request resend
      }

      const executionTime = Date.now() - startTime;
      const response = {
        success: true,
        message: 'OTP sent successfully',
        data: {
          expiresIn: this.otpExpiryMinutes * 60,
          retryAfter: this.otpResendSeconds,
        },
      };

      this.logger.info('Email signup OTP sent successfully', {
        context: 'AuthService',
        method: 'sendEmailOtp',
        email: maskedEmail,
        expiresIn: `${this.otpExpiryMinutes * 60}s`,
        retryAfter: `${this.otpResendSeconds}s`,
        executionTime: `${executionTime}ms`,
      });

      return response;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      if (
        error instanceof ConflictException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error(
        'Email signup OTP request failed with unexpected error',
        {
          context: 'AuthService',
          method: 'sendEmailOtp',
          email: maskedEmail,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          executionTime: `${executionTime}ms`,
        },
      );
      throw error;
    }
  }

  async verifyEmailOtp(dto: VerifyEmailOtpDto): Promise<{
    success: boolean;
    message: string;
    data: { verificationToken: string; expiresIn: number };
  }> {
    const startTime = Date.now();
    const maskedEmail = this.maskEmail(dto.email);
    const maskedOtp = this.maskOtp();

    this.logger.info('Email signup OTP verification request received', {
      context: 'AuthService',
      method: 'verifyEmailOtp',
      email: maskedEmail,
      otp: maskedOtp,
    });

    try {
      const otpRecord = await this.authRepository.findLatestOtpCode(
        dto.email,
        OtpPurpose.REGISTRATION,
      );

      if (!otpRecord) {
        const executionTime = Date.now() - startTime;
        this.logger.warn(
          'Email signup OTP verification failed - OTP not found',
          {
            context: 'AuthService',
            method: 'verifyEmailOtp',
            email: maskedEmail,
            errorCode: 'EMAIL_OTP_INVALID',
            executionTime: `${executionTime}ms`,
          },
        );
        throw new BadRequestException({
          success: false,
          error: {
            code: 'EMAIL_OTP_INVALID',
            message: 'Invalid or expired OTP',
          },
        });
      }

      // Check if max attempts exceeded
      if (otpRecord.attempts >= this.maxOtpAttempts) {
        const executionTime = Date.now() - startTime;
        this.logger.warn(
          'Email signup OTP verification failed - max attempts exceeded',
          {
            context: 'AuthService',
            method: 'verifyEmailOtp',
            email: maskedEmail,
            errorCode: 'OTP_MAX_ATTEMPTS',
            attempts: otpRecord.attempts,
            maxAttempts: this.maxOtpAttempts,
            executionTime: `${executionTime}ms`,
          },
        );
        throw new BadRequestException({
          success: false,
          error: {
            code: 'OTP_MAX_ATTEMPTS',
            message: 'Maximum OTP verification attempts exceeded',
          },
        });
      }

      // Check if OTP matches
      if (otpRecord.code !== dto.otp) {
        await this.authRepository.incrementOtpAttempts(otpRecord._id);
        const executionTime = Date.now() - startTime;
        this.logger.warn(
          'Email signup OTP verification failed - invalid OTP code',
          {
            context: 'AuthService',
            method: 'verifyEmailOtp',
            email: maskedEmail,
            errorCode: 'EMAIL_OTP_INVALID',
            attempts: otpRecord.attempts + 1,
            maxAttempts: this.maxOtpAttempts,
            executionTime: `${executionTime}ms`,
          },
        );
        throw new BadRequestException({
          success: false,
          error: {
            code: 'EMAIL_OTP_INVALID',
            message: 'Invalid OTP code',
          },
        });
      }

      // Check if OTP expired
      if (otpRecord.expiresAt < new Date()) {
        const executionTime = Date.now() - startTime;
        this.logger.warn('Email signup OTP verification failed - OTP expired', {
          context: 'AuthService',
          method: 'verifyEmailOtp',
          email: maskedEmail,
          errorCode: 'EMAIL_OTP_EXPIRED',
          expiresAt: otpRecord.expiresAt.toISOString(),
          executionTime: `${executionTime}ms`,
        });
        throw new BadRequestException({
          success: false,
          error: {
            code: 'EMAIL_OTP_EXPIRED',
            message: 'OTP has expired',
          },
        });
      }

      // Mark OTP as verified
      await this.authRepository.markOtpAsVerified(otpRecord._id);

      // Generate temporary verification token
      const verificationToken = this.jwtService.sign(
        { email: dto.email, purpose: 'email_verification' },
        { expiresIn: '10m' },
      );

      const executionTime = Date.now() - startTime;
      const response = {
        success: true,
        message: 'OTP verified successfully',
        data: {
          verificationToken,
          expiresIn: 600, // 10 minutes
        },
      };

      this.logger.info('Email signup OTP verified successfully', {
        context: 'AuthService',
        method: 'verifyEmailOtp',
        email: maskedEmail,
        verificationToken: this.maskToken(verificationToken),
        expiresIn: '600s',
        executionTime: `${executionTime}ms`,
      });

      return response;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(
        'Email signup OTP verification failed with unexpected error',
        {
          context: 'AuthService',
          method: 'verifyEmailOtp',
          email: maskedEmail,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          executionTime: `${executionTime}ms`,
        },
      );
      throw error;
    }
  }

  async resendEmailOtp(dto: ResendEmailOtpDto): Promise<{
    success: boolean;
    message: string;
    data: { expiresIn: number; retryAfter: number };
  }> {
    const startTime = Date.now();
    const maskedEmail = this.maskEmail(dto.email);

    this.logger.info('Email signup OTP resend request received', {
      context: 'AuthService',
      method: 'resendEmailOtp',
      email: maskedEmail,
    });

    try {
      const result = await this.sendEmailOtp({ email: dto.email });
      const executionTime = Date.now() - startTime;
      this.logger.info('Email signup OTP resent successfully', {
        context: 'AuthService',
        method: 'resendEmailOtp',
        email: maskedEmail,
        expiresIn: `${result.data.expiresIn}s`,
        retryAfter: `${result.data.retryAfter}s`,
        executionTime: `${executionTime}ms`,
      });
      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.logger.error('Email signup OTP resend failed', {
        context: 'AuthService',
        method: 'resendEmailOtp',
        email: maskedEmail,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        executionTime: `${executionTime}ms`,
      });
      throw error;
    }
  }

  async createPassword(
    verificationToken: string,
    dto: CreatePasswordDto,
  ): Promise<{
    success: boolean;
    message: string;
    data: {
      userId: string;
      requiresProfileCompletion: boolean;
      tokens: TokenPair;
    };
  }> {
    const startTime = Date.now();
    const maskedToken = this.maskToken(verificationToken);

    this.logger.info('Signup password creation request received', {
      context: 'AuthService',
      method: 'createPassword',
      verificationToken: maskedToken,
    });

    try {
      // Verify token
      let payload: { phone?: string; email?: string; purpose: string };
      try {
        payload = this.jwtService.verify<{
          phone?: string;
          email?: string;
          purpose: string;
        }>(verificationToken);
      } catch {
        const executionTime = Date.now() - startTime;
        this.logger.warn(
          'Signup password creation failed - invalid verification token',
          {
            context: 'AuthService',
            method: 'createPassword',
            verificationToken: maskedToken,
            errorCode: 'AUTH_TOKEN_INVALID',
            executionTime: `${executionTime}ms`,
          },
        );
        throw new UnauthorizedException({
          success: false,
          error: {
            code: 'AUTH_TOKEN_INVALID',
            message: 'Invalid or expired verification token',
          },
        });
      }

      const identifier = payload.phone || payload.email;
      const maskedIdentifier = payload.phone
        ? this.maskPhone(payload.phone)
        : this.maskEmail(payload.email || '');

      // Validate password match
      if (dto.password !== dto.confirmPassword) {
        const executionTime = Date.now() - startTime;
        this.logger.warn(
          'Signup password creation failed - passwords do not match',
          {
            context: 'AuthService',
            method: 'createPassword',
            identifier: maskedIdentifier,
            errorCode: 'VALIDATION_ERROR',
            executionTime: `${executionTime}ms`,
          },
        );
        throw new BadRequestException({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Passwords do not match',
          },
        });
      }

      if (!identifier) {
        const executionTime = Date.now() - startTime;
        this.logger.warn(
          'Signup password creation failed - invalid verification token payload',
          {
            context: 'AuthService',
            method: 'createPassword',
            verificationToken: maskedToken,
            errorCode: 'VALIDATION_ERROR',
            executionTime: `${executionTime}ms`,
          },
        );
        throw new BadRequestException({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid verification token',
          },
        });
      }

      // Check if user already exists
      const existingUser: UserDocument | null =
        await this.authRepository.findUserByEmailOrPhone(identifier);
      if (existingUser) {
        const executionTime = Date.now() - startTime;
        this.logger.warn(
          'Signup password creation failed - user already exists',
          {
            context: 'AuthService',
            method: 'createPassword',
            identifier: maskedIdentifier,
            userId: existingUser._id.toString(),
            errorCode: 'USER_ALREADY_EXISTS',
            executionTime: `${executionTime}ms`,
          },
        );
        throw new ConflictException({
          success: false,
          error: {
            code: 'USER_ALREADY_EXISTS',
            message: 'User already exists',
          },
        });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(dto.password, 12);

      // Create user with minimal info
      const userData: {
        password: string;
        firstName: string;
        lastName: string;
        phone?: string;
        email?: string;
        isPhoneVerified?: boolean;
        isEmailVerified?: boolean;
      } = {
        password: hashedPassword,
        firstName: 'New',
        lastName: 'User',
      };

      if (payload.phone) {
        userData.phone = payload.phone;
        userData.isPhoneVerified = true;
      } else if (payload.email) {
        userData.email = payload.email;
        userData.isEmailVerified = true;
      }

      const user = await this.authRepository.createUser(userData);

      // Generate JWT tokens for immediate authentication
      const tokens = await this.generateTokenPair(
        user._id.toString(),
        user.role,
      );

      const executionTime = Date.now() - startTime;
      const response = {
        success: true,
        message: 'Password created successfully',
        data: {
          userId: user._id.toString(),
          requiresProfileCompletion: true,
          tokens,
        },
      };

      this.logger.info('Signup password created successfully', {
        context: 'AuthService',
        method: 'createPassword',
        identifier: maskedIdentifier,
        userId: user._id.toString(),
        requiresProfileCompletion: true,
        accessToken: this.maskToken(tokens.accessToken),
        refreshToken: this.maskToken(tokens.refreshToken),
        expiresIn: `${tokens.expiresIn}s`,
        executionTime: `${executionTime}ms`,
      });

      return response;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      if (
        error instanceof UnauthorizedException ||
        error instanceof BadRequestException ||
        error instanceof ConflictException
      ) {
        throw error;
      }
      this.logger.error(
        'Signup password creation failed with unexpected error',
        {
          context: 'AuthService',
          method: 'createPassword',
          verificationToken: maskedToken,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          executionTime: `${executionTime}ms`,
        },
      );
      throw error;
    }
  }

  async completeProfile(
    verificationToken: string,
    dto: CompleteProfileDto,
  ): Promise<{
    success: boolean;
    message: string;
    data: AuthResponse;
  }> {
    const startTime = Date.now();
    const maskedToken = this.maskToken(verificationToken);

    this.logger.info('Signup profile completion request received', {
      context: 'AuthService',
      method: 'completeProfile',
      verificationToken: maskedToken,
      firstName: dto.firstName,
      lastName: dto.lastName,
      birthday: dto.birthday,
    });

    try {
      // Verify token
      let payload: { phone?: string; email?: string };
      try {
        payload = this.jwtService.verify<{ phone?: string; email?: string }>(
          verificationToken,
        );
      } catch {
        const executionTime = Date.now() - startTime;
        this.logger.warn(
          'Signup profile completion failed - invalid verification token',
          {
            context: 'AuthService',
            method: 'completeProfile',
            verificationToken: maskedToken,
            errorCode: 'AUTH_TOKEN_INVALID',
            executionTime: `${executionTime}ms`,
          },
        );
        throw new UnauthorizedException({
          success: false,
          error: {
            code: 'AUTH_TOKEN_INVALID',
            message: 'Invalid or expired verification token',
          },
        });
      }

      // Validate identifier matches
      const identifier = payload.phone || payload.email;
      const dtoIdentifier = dto.phone || dto.email;
      const maskedIdentifier = identifier
        ? identifier.includes('@')
          ? this.maskEmail(identifier)
          : this.maskPhone(identifier)
        : 'unknown';

      if (!identifier || identifier !== dtoIdentifier) {
        const executionTime = Date.now() - startTime;
        this.logger.warn(
          'Signup profile completion failed - identifier mismatch',
          {
            context: 'AuthService',
            method: 'completeProfile',
            identifier: maskedIdentifier,
            dtoIdentifier: dtoIdentifier
              ? dtoIdentifier.includes('@')
                ? this.maskEmail(dtoIdentifier)
                : this.maskPhone(dtoIdentifier)
              : 'not provided',
            errorCode: 'VALIDATION_ERROR',
            executionTime: `${executionTime}ms`,
          },
        );
        throw new BadRequestException({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Identifier does not match verification token',
          },
        });
      }

      // Find user
      const user = await this.authRepository.findUserByEmailOrPhone(identifier);
      if (!user) {
        const executionTime = Date.now() - startTime;
        this.logger.warn('Signup profile completion failed - user not found', {
          context: 'AuthService',
          method: 'completeProfile',
          identifier: maskedIdentifier,
          errorCode: 'RESOURCE_NOT_FOUND',
          executionTime: `${executionTime}ms`,
        });
        throw new NotFoundException({
          success: false,
          error: {
            code: 'RESOURCE_NOT_FOUND',
            message: 'User not found',
          },
        });
      }

      // Update user profile
      const updatedUser = await this.authRepository.updateUser(user._id, {
        firstName: dto.firstName,
        lastName: dto.lastName,
        birthday: new Date(dto.birthday),
      });

      if (!updatedUser) {
        const executionTime = Date.now() - startTime;
        this.logger.error('Signup profile completion failed - update failed', {
          context: 'AuthService',
          method: 'completeProfile',
          userId: user._id.toString(),
          identifier: maskedIdentifier,
          errorCode: 'UPDATE_FAILED',
          executionTime: `${executionTime}ms`,
        });
        throw new BadRequestException({
          success: false,
          error: {
            code: 'UPDATE_FAILED',
            message: 'Failed to update profile',
          },
        });
      }

      // Update last login
      await this.authRepository.updateLastLoginAt(updatedUser._id);

      // Generate tokens
      const tokens = await this.generateTokenPair(
        updatedUser._id.toString(),
        updatedUser.role,
      );

      const executionTime = Date.now() - startTime;
      const response = {
        success: true,
        message: 'Profile completed successfully',
        data: {
          user: {
            id: updatedUser._id.toString(),
            firstName: updatedUser.firstName!,
            lastName: updatedUser.lastName!,
            phone: updatedUser.phone,
            email: updatedUser.email,
            birthday: updatedUser.birthday?.toISOString().split('T')[0],
            avatar: updatedUser.avatar,
            createdAt: updatedUser.createdAt!,
          },
          tokens,
        },
      };

      this.logger.info('Signup profile completed successfully', {
        context: 'AuthService',
        method: 'completeProfile',
        userId: updatedUser._id.toString(),
        identifier: maskedIdentifier,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        accessToken: this.maskToken(tokens.accessToken),
        refreshToken: this.maskToken(tokens.refreshToken),
        expiresIn: `${tokens.expiresIn}s`,
        executionTime: `${executionTime}ms`,
      });

      return response;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      if (
        error instanceof UnauthorizedException ||
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      this.logger.error(
        'Signup profile completion failed with unexpected error',
        {
          context: 'AuthService',
          method: 'completeProfile',
          verificationToken: maskedToken,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          executionTime: `${executionTime}ms`,
        },
      );
      throw error;
    }
  }

  // ============ LOGIN FLOW ============

  async login(dto: LoginDto): Promise<{
    success: boolean;
    message: string;
    data: AuthResponse;
  }> {
    // Find user by phone or email
    const user = await this.authRepository.findUserByEmailOrPhone(
      dto.identifier,
    );
    if (!user || !user.password) {
      throw new UnauthorizedException({
        success: false,
        error: {
          code: 'AUTH_CREDENTIALS_INVALID',
          message: 'Invalid credentials',
        },
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException({
        success: false,
        error: {
          code: 'AUTH_CREDENTIALS_INVALID',
          message: 'Invalid credentials',
        },
      });
    }

    // Check if user is active
    if (!user.isActive) {
      throw new UnauthorizedException({
        success: false,
        error: {
          code: 'AUTH_ACCOUNT_SUSPENDED',
          message: 'Account is suspended',
        },
      });
    }

    // Update last login
    await this.authRepository.updateLastLoginAt(user._id);

    // Generate tokens
    const tokens = await this.generateTokenPair(user._id.toString(), user.role);

    return {
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user._id.toString(),
          firstName: user.firstName ?? '',
          lastName: user.lastName ?? '',
          phone: user.phone,
          email: user.email,
          birthday: user.birthday?.toISOString().split('T')[0],
          avatar: user.avatar,
          createdAt: user.createdAt!,
        },
        tokens,
      },
    };
  }

  // ============ TOKEN REFRESH ============

  async refresh(dto: RefreshTokenDto): Promise<{
    success: boolean;
    message: string;
    data: TokenPair;
  }> {
    // Find refresh token
    const tokenRecord = await this.authRepository.findRefreshToken(
      dto.refreshToken,
    );

    if (!tokenRecord) {
      throw new UnauthorizedException({
        success: false,
        error: {
          code: 'AUTH_TOKEN_INVALID',
          message: 'Invalid refresh token',
        },
      });
    }

    // Check if revoked
    if (tokenRecord.isRevoked) {
      // Potential token theft - revoke entire family
      await this.authRepository.revokeTokenFamily(tokenRecord.family);
      throw new UnauthorizedException({
        success: false,
        error: {
          code: 'AUTH_TOKEN_INVALID',
          message: 'Refresh token has been revoked',
        },
      });
    }

    // Check if expired
    if (tokenRecord.expiresAt < new Date()) {
      throw new UnauthorizedException({
        success: false,
        error: {
          code: 'AUTH_TOKEN_EXPIRED',
          message: 'Refresh token has expired',
        },
      });
    }

    // Verify token
    let payload: { sub: string; role: string };
    try {
      payload = this.jwtService.verify<{ sub: string; role: string }>(
        dto.refreshToken,
      );
    } catch {
      throw new UnauthorizedException({
        success: false,
        error: {
          code: 'AUTH_TOKEN_INVALID',
          message: 'Invalid refresh token',
        },
      });
    }

    // Revoke old refresh token
    await this.authRepository.revokeRefreshToken(tokenRecord._id);

    // Generate new token pair (token rotation)
    const tokens = await this.generateTokenPair(
      payload.sub,
      payload.role,
      tokenRecord.family,
    );

    return {
      success: true,
      message: 'Token refreshed successfully',
      data: tokens,
    };
  }

  // ============ LOGOUT ============

  async logout(dto: LogoutDto): Promise<{
    success: boolean;
    message: string;
  }> {
    const tokenRecord = await this.authRepository.findRefreshToken(
      dto.refreshToken,
    );

    if (tokenRecord && !tokenRecord.isRevoked) {
      await this.authRepository.revokeRefreshToken(tokenRecord._id);
    }

    return {
      success: true,
      message: 'Logged out successfully',
    };
  }

  // ============ PASSWORD RESET FLOW ============

  async passwordResetSendOtp(dto: PasswordResetSendOtpDto): Promise<{
    success: boolean;
    message: string;
    data: { expiresIn: number; retryAfter: number };
  }> {
    // Check if user exists
    const user = await this.authRepository.findUserByPhone(dto.phone);
    if (!user) {
      // For security, return success even if user doesn't exist
      return {
        success: true,
        message: 'OTP sent successfully',
        data: {
          expiresIn: this.otpExpiryMinutes * 60,
          retryAfter: this.otpResendSeconds,
        },
      };
    }

    // Check for recent OTP request
    const latestOtp = await this.authRepository.findLatestOtpCode(
      dto.phone,
      OtpPurpose.PASSWORD_RESET,
    );

    if (latestOtp && latestOtp.createdAt) {
      const timeSinceCreation =
        (Date.now() - latestOtp.createdAt.getTime()) / 1000;
      if (timeSinceCreation < this.otpResendSeconds) {
        throw new BadRequestException({
          success: false,
          error: {
            code: 'OTP_RATE_LIMITED',
            message: 'Please wait before requesting another OTP',
            details: {
              retryAfter: Math.ceil(this.otpResendSeconds - timeSinceCreation),
            },
          },
        });
      }
    }

    // Generate OTP
    const otpCode = this.generateOtpCode();
    const expiresAt = new Date(Date.now() + this.otpExpiryMinutes * 60 * 1000);

    // Invalidate existing OTPs
    await this.authRepository.invalidateOtpCodes(
      dto.phone,
      OtpPurpose.PASSWORD_RESET,
    );

    // Save OTP
    await this.authRepository.createOtpCode(
      dto.phone,
      otpCode,
      OtpPurpose.PASSWORD_RESET,
      expiresAt,
    );

    // TODO: Send OTP via SMS
    console.log(`Password reset OTP for ${dto.phone}: ${otpCode}`);

    return {
      success: true,
      message: 'OTP sent successfully',
      data: {
        expiresIn: this.otpExpiryMinutes * 60,
        retryAfter: this.otpResendSeconds,
      },
    };
  }

  async passwordResetVerifyOtp(dto: PasswordResetVerifyOtpDto): Promise<{
    success: boolean;
    message: string;
    data: { resetToken: string; expiresIn: number };
  }> {
    const otpRecord = await this.authRepository.findLatestOtpCode(
      dto.phone,
      OtpPurpose.PASSWORD_RESET,
    );

    if (!otpRecord) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'OTP_INVALID',
          message: 'Invalid or expired OTP',
        },
      });
    }

    if (otpRecord.attempts >= this.maxOtpAttempts) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'OTP_MAX_ATTEMPTS',
          message: 'Maximum OTP verification attempts exceeded',
        },
      });
    }

    if (otpRecord.code !== dto.otp) {
      await this.authRepository.incrementOtpAttempts(otpRecord._id);
      throw new BadRequestException({
        success: false,
        error: {
          code: 'OTP_INVALID',
          message: 'Invalid OTP code',
        },
      });
    }

    if (otpRecord.expiresAt < new Date()) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'OTP_EXPIRED',
          message: 'OTP has expired',
        },
      });
    }

    await this.authRepository.markOtpAsVerified(otpRecord._id);

    // Generate reset token
    const resetToken = this.jwtService.sign(
      { phone: dto.phone, purpose: 'password_reset' },
      { expiresIn: '10m' },
    );

    return {
      success: true,
      message: 'OTP verified successfully',
      data: {
        resetToken,
        expiresIn: 600,
      },
    };
  }

  async passwordResetUpdate(
    resetToken: string,
    dto: PasswordResetUpdateDto,
  ): Promise<{
    success: boolean;
    message: string;
    data: { tokens: TokenPair };
  }> {
    // Verify reset token
    let payload: { phone?: string; email?: string };
    try {
      payload = this.jwtService.verify<{ phone?: string; email?: string }>(
        resetToken,
      );
    } catch {
      throw new UnauthorizedException({
        success: false,
        error: {
          code: 'AUTH_TOKEN_INVALID',
          message: 'Invalid or expired reset token',
        },
      });
    }

    // Validate passwords match
    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Passwords do not match',
        },
      });
    }

    const identifier = payload.phone || payload.email;
    if (!identifier) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid reset token',
        },
      });
    }

    // Find user
    const user = await this.authRepository.findUserByEmailOrPhone(identifier);
    if (!user) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'RESOURCE_NOT_FOUND',
          message: 'User not found',
        },
      });
    }

    // Check if new password is same as old password
    if (user.password) {
      const isSamePassword = await bcrypt.compare(
        dto.newPassword,
        user.password,
      );
      if (isSamePassword) {
        throw new BadRequestException({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'New password cannot be the same as old password',
          },
        });
      }
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(dto.newPassword, 12);

    // Update password
    await this.authRepository.updateUser(user._id, {
      password: hashedPassword,
    });

    // Revoke all existing refresh tokens for security
    await this.authRepository.revokeAllUserTokens(user._id);

    // Generate new tokens (auto-login)
    const tokens = await this.generateTokenPair(user._id.toString(), user.role);

    return {
      success: true,
      message: 'Password updated successfully',
      data: { tokens },
    };
  }

  // ============ EMAIL PASSWORD RESET FLOW ============

  async emailPasswordResetSendOtp(dto: EmailPasswordResetSendOtpDto): Promise<{
    success: boolean;
    message: string;
    data: { expiresIn: number; retryAfter: number };
  }> {
    // Check if user exists
    const user = await this.authRepository.findUserByEmail(dto.email);
    if (!user) {
      // For security, return success even if user doesn't exist
      return {
        success: true,
        message: 'OTP sent successfully',
        data: {
          expiresIn: this.otpExpiryMinutes * 60,
          retryAfter: this.otpResendSeconds,
        },
      };
    }

    // Check for recent OTP request
    const latestOtp = await this.authRepository.findLatestOtpCode(
      dto.email,
      OtpPurpose.PASSWORD_RESET,
    );

    if (latestOtp && latestOtp.createdAt) {
      const timeSinceCreation =
        (Date.now() - latestOtp.createdAt.getTime()) / 1000;
      if (timeSinceCreation < this.otpResendSeconds) {
        throw new BadRequestException({
          success: false,
          error: {
            code: 'EMAIL_OTP_RATE_LIMITED',
            message: 'Please wait before requesting another OTP',
            details: {
              retryAfter: Math.ceil(this.otpResendSeconds - timeSinceCreation),
            },
          },
        });
      }
    }

    // Generate OTP
    const otpCode = this.generateOtpCode();
    const expiresAt = new Date(Date.now() + this.otpExpiryMinutes * 60 * 1000);

    // Invalidate existing OTPs
    await this.authRepository.invalidateOtpCodes(
      dto.email,
      OtpPurpose.PASSWORD_RESET,
    );

    // Save OTP
    await this.authRepository.createOtpCode(
      dto.email,
      otpCode,
      OtpPurpose.PASSWORD_RESET,
      expiresAt,
    );

    // Send OTP via email
    try {
      await this.mailService.sendOtpEmail({
        to: dto.email,
        otp: otpCode,
        purpose: 'password-reset',
        expiresInMinutes: this.otpExpiryMinutes,
      });
    } catch (error) {
      this.logger.error(
        `Failed to send password reset email OTP to ${this.maskEmail(dto.email)}`,
        {
          error: error instanceof Error ? error.message : String(error),
        },
      );
      // Don't throw - OTP is still saved, user can request resend
    }

    return {
      success: true,
      message: 'OTP sent successfully',
      data: {
        expiresIn: this.otpExpiryMinutes * 60,
        retryAfter: this.otpResendSeconds,
      },
    };
  }

  async emailPasswordResetVerifyOtp(
    dto: EmailPasswordResetVerifyOtpDto,
  ): Promise<{
    success: boolean;
    message: string;
    data: { resetToken: string; expiresIn: number };
  }> {
    const otpRecord = await this.authRepository.findLatestOtpCode(
      dto.email,
      OtpPurpose.PASSWORD_RESET,
    );

    if (!otpRecord) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'EMAIL_OTP_INVALID',
          message: 'Invalid or expired OTP',
        },
      });
    }

    if (otpRecord.attempts >= this.maxOtpAttempts) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'OTP_MAX_ATTEMPTS',
          message: 'Maximum OTP verification attempts exceeded',
        },
      });
    }

    if (otpRecord.code !== dto.otp) {
      await this.authRepository.incrementOtpAttempts(otpRecord._id);
      throw new BadRequestException({
        success: false,
        error: {
          code: 'EMAIL_OTP_INVALID',
          message: 'Invalid OTP code',
        },
      });
    }

    if (otpRecord.expiresAt < new Date()) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'EMAIL_OTP_EXPIRED',
          message: 'OTP has expired',
        },
      });
    }

    await this.authRepository.markOtpAsVerified(otpRecord._id);

    // Generate reset token
    const resetToken = this.jwtService.sign(
      { email: dto.email, purpose: 'password_reset' },
      { expiresIn: '10m' },
    );

    return {
      success: true,
      message: 'OTP verified successfully',
      data: {
        resetToken,
        expiresIn: 600,
      },
    };
  }

  // ============ HELPER METHODS ============

  private generateOtpCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private async generateTokenPair(
    userId: string,
    role: string,
    tokenFamily?: string,
  ): Promise<TokenPair> {
    const family = tokenFamily ?? uuidv4();

    const accessToken = this.jwtService.sign(
      {
        sub: userId,
        role,
      },
      {
        expiresIn: this.jwtAccessExpiry,
      } as any,
    );

    const refreshToken = this.jwtService.sign(
      {
        sub: userId,
        role,
        family,
      },
      {
        expiresIn: this.jwtRefreshExpiry,
      } as any,
    );

    // Calculate refresh token expiry
    const expiryMs = this.parseExpiryToMs(this.jwtRefreshExpiry);
    const expiresAt = new Date(Date.now() + expiryMs);

    // Save refresh token to database
    await this.authRepository.createRefreshToken(
      new Types.ObjectId(userId),
      refreshToken,
      family,
      expiresAt,
    );

    // Calculate access token expiry in seconds
    const accessExpirySeconds =
      this.parseExpiryToMs(this.jwtAccessExpiry) / 1000;

    return {
      accessToken,
      refreshToken,
      expiresIn: accessExpirySeconds,
    };
  }

  private parseExpiryToMs(expiry: string): number {
    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match) return 900000; // default 15 minutes

    const value = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {
      case 's':
        return value * 1000;
      case 'm':
        return value * 60 * 1000;
      case 'h':
        return value * 60 * 60 * 1000;
      case 'd':
        return value * 24 * 60 * 60 * 1000;
      default:
        return 900000;
    }
  }

  // Secret endpoint to promote user to admin (temporary - remove later)
  async promoteToAdmin(userId: string) {
    const user = await this.authRepository.findUserById(userId);
    if (!user) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'RESOURCE_NOT_FOUND',
          message: 'User not found',
        },
      });
    }

    const updatedUser = await this.authRepository.updateUser(userId, {
      role: UserRole.ADMIN,
    });

    if (!updatedUser) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'RESOURCE_NOT_FOUND',
          message: 'User not found',
        },
      });
    }

    return {
      success: true,
      message: 'User promoted to admin successfully',
      data: {
        userId: updatedUser._id.toString(),
        role: updatedUser.role,
      },
    };
  }

  /**
   * Send OTP to add email to authenticated user's account
   */
  async sendEmailVerificationOtp(
    userId: string,
    dto: AddEmailDto,
  ): Promise<{
    success: boolean;
    message: string;
    data: { expiresIn: number; retryAfter: number };
  }> {
    const startTime = Date.now();
    const maskedEmail = this.maskEmail(dto.email);

    this.logger.info('Email verification OTP request received', {
      context: 'AuthService',
      method: 'sendEmailVerificationOtp',
      userId,
      email: maskedEmail,
    });

    try {
      // Check if email is already in use by another user
      const existingUser = await this.authRepository.findUserByEmail(dto.email);
      if (existingUser && existingUser._id.toString() !== userId) {
        const executionTime = Date.now() - startTime;
        this.logger.warn(
          'Email verification OTP request failed - email already in use',
          {
            context: 'AuthService',
            method: 'sendEmailVerificationOtp',
            userId,
            email: maskedEmail,
            errorCode: 'EMAIL_ALREADY_IN_USE',
            executionTime: `${executionTime}ms`,
          },
        );
        throw new ConflictException({
          success: false,
          error: {
            code: 'EMAIL_ALREADY_IN_USE',
            message: 'This email address is already in use by another account',
          },
        });
      }

      // Check for recent OTP request (rate limiting)
      const latestOtp = await this.authRepository.findLatestOtpCode(
        dto.email,
        OtpPurpose.EMAIL_VERIFICATION,
      );

      if (latestOtp && latestOtp.createdAt) {
        const timeSinceCreation =
          (Date.now() - latestOtp.createdAt.getTime()) / 1000;
        if (timeSinceCreation < this.otpResendSeconds) {
          const retryAfter = Math.ceil(
            this.otpResendSeconds - timeSinceCreation,
          );
          const executionTime = Date.now() - startTime;
          this.logger.warn('Email verification OTP request rate limited', {
            context: 'AuthService',
            method: 'sendEmailVerificationOtp',
            userId,
            email: maskedEmail,
            errorCode: 'EMAIL_OTP_RATE_LIMITED',
            retryAfter: `${retryAfter}s`,
            executionTime: `${executionTime}ms`,
          });
          throw new BadRequestException({
            success: false,
            error: {
              code: 'EMAIL_OTP_RATE_LIMITED',
              message: 'Please wait before requesting another OTP',
              details: {
                retryAfter,
              },
            },
          });
        }
      }

      // Generate 6-digit OTP
      const otpCode = this.generateOtpCode();
      const expiresAt = new Date(
        Date.now() + this.otpExpiryMinutes * 60 * 1000,
      );

      // Invalidate any existing OTPs for this email
      await this.authRepository.invalidateOtpCodes(
        dto.email,
        OtpPurpose.EMAIL_VERIFICATION,
      );

      // Save OTP to database
      await this.authRepository.createOtpCode(
        dto.email,
        otpCode,
        OtpPurpose.EMAIL_VERIFICATION,
        expiresAt,
      );

      // Send OTP via email service
      try {
        await this.mailService.sendOtpEmail({
          to: dto.email,
          otp: otpCode,
          purpose: 'email-verification',
          expiresInMinutes: this.otpExpiryMinutes,
        });
      } catch (error) {
        this.logger.error(
          `Failed to send email verification OTP to ${this.maskEmail(dto.email)}`,
          {
            error: error instanceof Error ? error.message : String(error),
          },
        );
        // Don't throw - OTP is still saved, user can request resend
      }

      const executionTime = Date.now() - startTime;
      const response = {
        success: true,
        message: 'OTP sent successfully',
        data: {
          expiresIn: this.otpExpiryMinutes * 60,
          retryAfter: this.otpResendSeconds,
        },
      };

      this.logger.info('Email verification OTP sent successfully', {
        context: 'AuthService',
        method: 'sendEmailVerificationOtp',
        userId,
        email: maskedEmail,
        expiresIn: `${this.otpExpiryMinutes * 60}s`,
        retryAfter: `${this.otpResendSeconds}s`,
        executionTime: `${executionTime}ms`,
      });

      return response;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      if (
        error instanceof ConflictException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error(
        'Email verification OTP request failed with unexpected error',
        {
          context: 'AuthService',
          method: 'sendEmailVerificationOtp',
          userId,
          email: maskedEmail,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          executionTime: `${executionTime}ms`,
        },
      );
      throw error;
    }
  }

  /**
   * Verify OTP and add email to authenticated user's account
   */
  async verifyEmailVerificationOtp(
    userId: string,
    dto: VerifyEmailVerificationOtpDto,
  ): Promise<{
    success: boolean;
    message: string;
    data: { email: string; isEmailVerified: boolean };
  }> {
    const startTime = Date.now();
    const maskedEmail = this.maskEmail(dto.email);
    const maskedOtp = this.maskOtp();

    this.logger.info('Email verification OTP verification request received', {
      context: 'AuthService',
      method: 'verifyEmailVerificationOtp',
      userId,
      email: maskedEmail,
      otp: maskedOtp,
    });

    try {
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

      // Find OTP record
      const otpRecord = await this.authRepository.findLatestOtpCode(
        dto.email,
        OtpPurpose.EMAIL_VERIFICATION,
      );

      if (!otpRecord) {
        const executionTime = Date.now() - startTime;
        this.logger.warn(
          'Email verification OTP verification failed - OTP not found',
          {
            context: 'AuthService',
            method: 'verifyEmailVerificationOtp',
            userId,
            email: maskedEmail,
            errorCode: 'EMAIL_OTP_INVALID',
            executionTime: `${executionTime}ms`,
          },
        );
        throw new BadRequestException({
          success: false,
          error: {
            code: 'EMAIL_OTP_INVALID',
            message: 'Invalid or expired OTP',
          },
        });
      }

      // Check max attempts
      if (otpRecord.attempts >= this.maxOtpAttempts) {
        const executionTime = Date.now() - startTime;
        this.logger.warn(
          'Email verification OTP verification failed - max attempts exceeded',
          {
            context: 'AuthService',
            method: 'verifyEmailVerificationOtp',
            userId,
            email: maskedEmail,
            errorCode: 'OTP_MAX_ATTEMPTS',
            attempts: otpRecord.attempts,
            maxAttempts: this.maxOtpAttempts,
            executionTime: `${executionTime}ms`,
          },
        );
        throw new BadRequestException({
          success: false,
          error: {
            code: 'OTP_MAX_ATTEMPTS',
            message: 'Maximum OTP verification attempts exceeded',
          },
        });
      }

      // Check if OTP matches
      if (otpRecord.code !== dto.otp) {
        await this.authRepository.incrementOtpAttempts(otpRecord._id);
        const executionTime = Date.now() - startTime;
        this.logger.warn(
          'Email verification OTP verification failed - invalid OTP code',
          {
            context: 'AuthService',
            method: 'verifyEmailVerificationOtp',
            userId,
            email: maskedEmail,
            errorCode: 'EMAIL_OTP_INVALID',
            attempts: otpRecord.attempts + 1,
            maxAttempts: this.maxOtpAttempts,
            executionTime: `${executionTime}ms`,
          },
        );
        throw new BadRequestException({
          success: false,
          error: {
            code: 'EMAIL_OTP_INVALID',
            message: 'Invalid OTP code',
          },
        });
      }

      // Check if OTP expired
      if (otpRecord.expiresAt < new Date()) {
        const executionTime = Date.now() - startTime;
        this.logger.warn(
          'Email verification OTP verification failed - OTP expired',
          {
            context: 'AuthService',
            method: 'verifyEmailVerificationOtp',
            userId,
            email: maskedEmail,
            errorCode: 'EMAIL_OTP_EXPIRED',
            expiresAt: otpRecord.expiresAt.toISOString(),
            executionTime: `${executionTime}ms`,
          },
        );
        throw new BadRequestException({
          success: false,
          error: {
            code: 'EMAIL_OTP_EXPIRED',
            message: 'OTP has expired',
          },
        });
      }

      // Mark OTP as verified
      await this.authRepository.markOtpAsVerified(otpRecord._id);

      // Update user's email and verification status
      const updatedUser = await this.authRepository.updateUser(userId, {
        email: dto.email,
        isEmailVerified: true,
      });

      if (!updatedUser) {
        throw new NotFoundException({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found',
          },
        });
      }

      const executionTime = Date.now() - startTime;
      const response = {
        success: true,
        message: 'Email verified and added to account successfully',
        data: {
          email: updatedUser.email || dto.email,
          isEmailVerified: updatedUser.isEmailVerified,
        },
      };

      this.logger.info('Email verification OTP verified successfully', {
        context: 'AuthService',
        method: 'verifyEmailVerificationOtp',
        userId,
        email: maskedEmail,
        executionTime: `${executionTime}ms`,
      });

      return response;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      this.logger.error(
        'Email verification OTP verification failed with unexpected error',
        {
          context: 'AuthService',
          method: 'verifyEmailVerificationOtp',
          userId,
          email: maskedEmail,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          executionTime: `${executionTime}ms`,
        },
      );
      throw error;
    }
  }

  /**
   * Upload profile picture for authenticated user
   */
  async uploadProfilePicture(
    userId: string,
    file: Express.Multer.File,
  ): Promise<{
    success: boolean;
    message: string;
    data: { avatar: string };
  }> {
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

    // Validate image type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'INVALID_IMAGE_TYPE',
          message: 'Image must be JPEG, JPG, PNG, or WebP',
        },
      });
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB in bytes
    if (file.size > maxSize) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'FILE_TOO_LARGE',
          message: 'Image size must be less than 5MB',
        },
      });
    }

    try {
      // Upload to Cloudinary
      const uploadResult = await this.cloudinaryService.uploadImage(file);
      const avatarUrl = (uploadResult as { secure_url: string }).secure_url;

      // Update user's avatar
      const updatedUser = await this.authRepository.updateUser(userId, {
        avatar: avatarUrl,
      });

      if (!updatedUser) {
        throw new NotFoundException({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found',
          },
        });
      }

      this.logger.info('Profile picture uploaded successfully', {
        context: 'AuthService',
        method: 'uploadProfilePicture',
        userId,
      });

      return {
        success: true,
        message: 'Profile picture uploaded successfully',
        data: {
          avatar: updatedUser.avatar || avatarUrl,
        },
      };
    } catch (error) {
      this.logger.error('Failed to upload profile picture', {
        context: 'AuthService',
        method: 'uploadProfilePicture',
        userId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      throw new BadRequestException({
        success: false,
        error: {
          code: 'UPLOAD_FAILED',
          message: 'Failed to upload profile picture',
        },
      });
    }
  }
}

import {
  Controller,
  Get,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiHeader,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
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
import { VerifyAdminLoginCodeDto } from './dto/verify-admin-login-code.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('phone/send-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send OTP for phone registration' })
  @ApiResponse({
    status: 200,
    description: 'OTP sent successfully',
    schema: {
      example: {
        success: true,
        message: 'OTP sent successfully',
        data: {
          expiresIn: 300,
          retryAfter: 30,
        },
      },
    },
  })
  @ApiResponse({
    status: 409,
    description: 'Phone already registered',
  })
  @ApiResponse({
    status: 429,
    description: 'Rate limit exceeded',
  })
  async sendOtp(@Body() dto: SendOtpDto) {
    return this.authService.sendOtp(dto);
  }

  @Post('phone/verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify OTP for phone registration' })
  @ApiResponse({
    status: 200,
    description: 'OTP verified successfully',
    schema: {
      example: {
        success: true,
        message: 'OTP verified successfully',
        data: {
          verificationToken: 'temp_token_12345',
          expiresIn: 600,
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid or expired OTP',
  })
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
  }

  @Post('phone/resend-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend OTP' })
  @ApiResponse({
    status: 200,
    description: 'OTP resent successfully',
  })
  async resendOtp(@Body() dto: ResendOtpDto) {
    return this.authService.resendOtp(dto);
  }

  @Post('email/send-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send OTP for email registration' })
  @ApiResponse({
    status: 200,
    description: 'OTP sent successfully',
    schema: {
      example: {
        success: true,
        message: 'OTP sent successfully',
        data: {
          expiresIn: 300,
          retryAfter: 30,
        },
      },
    },
  })
  @ApiResponse({
    status: 409,
    description: 'Email already registered',
  })
  @ApiResponse({
    status: 429,
    description: 'Rate limit exceeded',
  })
  async sendEmailOtp(@Body() dto: SendEmailOtpDto) {
    return this.authService.sendEmailOtp(dto);
  }

  @Post('email/verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify OTP for email registration' })
  @ApiResponse({
    status: 200,
    description: 'OTP verified successfully',
    schema: {
      example: {
        success: true,
        message: 'OTP verified successfully',
        data: {
          verificationToken: 'temp_token_12345',
          expiresIn: 600,
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid or expired OTP',
  })
  async verifyEmailOtp(@Body() dto: VerifyEmailOtpDto) {
    return this.authService.verifyEmailOtp(dto);
  }

  @Post('admin/pickup/verify-login-code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Verify pickup admin login code sent when the admin user was created',
  })
  @ApiResponse({
    status: 200,
    description: 'Admin login code verified successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid or expired admin login code',
  })
  async verifyAdminLoginCode(@Body() dto: VerifyAdminLoginCodeDto) {
    return this.authService.verifyAdminLoginCode({
      email: dto.email,
      code: dto.code,
    });
  }

  @Post('email/resend-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend OTP for email registration' })
  @ApiResponse({
    status: 200,
    description: 'OTP resent successfully',
  })
  @ApiResponse({
    status: 429,
    description: 'Rate limit exceeded',
  })
  async resendEmailOtp(@Body() dto: ResendEmailOtpDto) {
    return this.authService.resendEmailOtp(dto);
  }

  @Post('password/create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create password after OTP verification' })
  @ApiHeader({
    name: 'X-Verification-Token',
    description: 'Verification token from OTP verification',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Password created successfully',
    schema: {
      example: {
        success: true,
        message: 'Password created successfully',
        data: {
          userId: '507f1f77bcf86cd799439011',
          requiresProfileCompletion: true,
          tokens: {
            accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            expiresIn: 3600,
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid or expired verification token',
  })
  async createPassword(
    @Headers('x-verification-token') verificationToken: string,
    @Body() dto: CreatePasswordDto,
  ) {
    return this.authService.createPassword(verificationToken, dto);
  }

  @Post('admin/pickup/create-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Create password for an existing pickup admin after verifying login code',
  })
  @ApiHeader({
    name: 'X-Verification-Token',
    description:
      'Verification token from /auth/admin/pickup/verify-login-code response',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Password created successfully and admin logged in',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error (e.g. passwords do not match)',
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid or expired verification token',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  async createPasswordForPickupAdmin(
    @Headers('x-verification-token') verificationToken: string,
    @Body() dto: CreatePasswordDto,
  ) {
    return this.authService.createPasswordForExistingUser(
      verificationToken,
      dto,
    );
  }

  @Post('profile/complete')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Complete user profile during onboarding' })
  @ApiHeader({
    name: 'X-Verification-Token',
    description: 'Verification token from OTP verification',
    required: true,
  })
  @ApiResponse({
    status: 201,
    description: 'Profile completed successfully',
    schema: {
      example: {
        success: true,
        message: 'Profile completed successfully',
        data: {
          user: {
            id: '507f1f77bcf86cd799439011',
            firstName: 'Sure',
            lastName: 'Spot',
            phone: '+2349014226320',
            birthday: '1995-05-17',
            email: null,
            createdAt: '2025-11-23T10:30:00.000Z',
          },
          tokens: {
            accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            expiresIn: 900,
          },
        },
      },
    },
  })
  async completeProfile(
    @Headers('x-verification-token') verificationToken: string,
    @Body() dto: CompleteProfileDto,
  ) {
    return this.authService.completeProfile(verificationToken, dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with phone and password' })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    schema: {
      example: {
        success: true,
        message: 'Login successful',
        data: {
          user: {
            id: '507f1f77bcf86cd799439011',
            firstName: 'Sure',
            lastName: 'Spot',
            phone: '+2349014226320',
            email: 'demo@surespot.app',
          },
          tokens: {
            accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            expiresIn: 900,
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials',
  })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({
    status: 200,
    description: 'Token refreshed successfully',
    schema: {
      example: {
        success: true,
        message: 'Token refreshed successfully',
        data: {
          accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
          refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
          expiresIn: 900,
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid or expired refresh token',
  })
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout user' })
  @ApiResponse({
    status: 200,
    description: 'Logged out successfully',
    schema: {
      example: {
        success: true,
        message: 'Logged out successfully',
      },
    },
  })
  async logout(@Body() dto: LogoutDto) {
    return this.authService.logout(dto);
  }

  @Post('password/reset/send-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send OTP for password reset' })
  @ApiResponse({
    status: 200,
    description: 'OTP sent successfully',
    schema: {
      example: {
        success: true,
        message: 'OTP sent successfully',
        data: {
          expiresIn: 300,
          retryAfter: 30,
        },
      },
    },
  })
  async passwordResetSendOtp(@Body() dto: PasswordResetSendOtpDto) {
    return this.authService.passwordResetSendOtp(dto);
  }

  @Post('password/reset/verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify OTP for password reset' })
  @ApiResponse({
    status: 200,
    description: 'OTP verified successfully',
    schema: {
      example: {
        success: true,
        message: 'OTP verified successfully',
        data: {
          resetToken: 'reset_token_12345',
          expiresIn: 600,
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid or expired OTP',
  })
  async passwordResetVerifyOtp(@Body() dto: PasswordResetVerifyOtpDto) {
    return this.authService.passwordResetVerifyOtp(dto);
  }

  @Post('password/reset/update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update password after OTP verification' })
  @ApiHeader({
    name: 'X-Reset-Token',
    description: 'Reset token from password reset OTP verification',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Password updated successfully',
    schema: {
      example: {
        success: true,
        message: 'Password updated successfully',
        data: {
          tokens: {
            accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            expiresIn: 900,
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid or expired reset token',
  })
  async passwordResetUpdate(
    @Headers('x-reset-token') resetToken: string,
    @Body() dto: PasswordResetUpdateDto,
  ) {
    return this.authService.passwordResetUpdate(resetToken, dto);
  }

  @Post('password/reset/email/send-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send OTP for email password reset' })
  @ApiResponse({
    status: 200,
    description: 'OTP sent successfully',
    schema: {
      example: {
        success: true,
        message: 'OTP sent successfully',
        data: {
          expiresIn: 300,
          retryAfter: 30,
        },
      },
    },
  })
  @ApiResponse({
    status: 429,
    description: 'Rate limit exceeded',
  })
  async emailPasswordResetSendOtp(@Body() dto: EmailPasswordResetSendOtpDto) {
    return this.authService.emailPasswordResetSendOtp(dto);
  }

  @Post('password/reset/email/verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify OTP for email password reset' })
  @ApiResponse({
    status: 200,
    description: 'OTP verified successfully',
    schema: {
      example: {
        success: true,
        message: 'OTP verified successfully',
        data: {
          resetToken: 'reset_token_12345',
          expiresIn: 600,
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid or expired OTP',
  })
  async emailPasswordResetVerifyOtp(
    @Body() dto: EmailPasswordResetVerifyOtpDto,
  ) {
    return this.authService.emailPasswordResetVerifyOtp(dto);
  }

  @Post('pizza-wierdo')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Secret endpoint to promote user to admin (temporary)',
  })
  @ApiResponse({
    status: 200,
    description: 'User promoted to admin successfully',
    schema: {
      example: {
        success: true,
        message: 'User promoted to admin successfully',
        data: {
          userId: '507f1f77bcf86cd799439011',
          role: 'admin',
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async promoteToAdmin(@CurrentUser() user: { id: string }) {
    return this.authService.promoteToAdmin(user.id);
  }

  @Post('account/add-email')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send OTP to add email to account' })
  @ApiResponse({
    status: 200,
    description: 'OTP sent successfully',
    schema: {
      example: {
        success: true,
        message: 'OTP sent successfully',
        data: {
          expiresIn: 300,
          retryAfter: 30,
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid email or rate limit exceeded',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 409,
    description: 'Email already in use',
  })
  async addEmail(
    @CurrentUser() user: { id: string },
    @Body() dto: AddEmailDto,
  ) {
    return this.authService.sendEmailVerificationOtp(user.id, dto);
  }

  @Post('account/verify-email-otp')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify OTP and add email to account' })
  @ApiResponse({
    status: 200,
    description: 'Email verified and added successfully',
    schema: {
      example: {
        success: true,
        message: 'Email verified and added to account successfully',
        data: {
          email: 'user@example.com',
          isEmailVerified: true,
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid or expired OTP',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  async verifyEmailVerificationOtp(
    @CurrentUser() user: { id: string },
    @Body() dto: VerifyEmailVerificationOtpDto,
  ) {
    return this.authService.verifyEmailVerificationOtp(user.id, dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get current authenticated user profile' })
  @ApiResponse({
    status: 200,
    description: 'User profile retrieved successfully',
    schema: {
      example: {
        success: true,
        data: {
          id: '507f1f77bcf86cd799439011',
          firstName: 'Sure',
          lastName: 'Spot',
          phone: '+2349014226320',
          email: 'demo@surespot.app',
          birthday: '1995-05-17',
          avatar: 'https://res.cloudinary.com/your-cloud/image/upload/v1234567890/surespot/avatar.jpg',
          role: 'user',
          isRider: false,
          isPhoneVerified: true,
          isEmailVerified: true,
          isActive: true,
          createdAt: '2025-11-23T10:30:00.000Z',
          lastLoginAt: '2025-11-23T15:45:00.000Z',
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  async getCurrentUser(@CurrentUser() user: { id: string }) {
    return this.authService.getCurrentUser(user.id);
  }

  @Post('profile/avatar')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('image'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload profile picture' })
  @ApiBody({
    description: 'Profile picture image file',
    schema: {
      type: 'object',
      properties: {
        image: {
          type: 'string',
          format: 'binary',
          description: 'Image file (JPEG, JPG, PNG, or WebP, max 5MB)',
        },
      },
      required: ['image'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Profile picture uploaded successfully',
    schema: {
      example: {
        success: true,
        message: 'Profile picture uploaded successfully',
        data: {
          avatar:
            'https://res.cloudinary.com/your-cloud/image/upload/v1234567890/surespot/avatar.jpg',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid image type or file too large',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  async uploadProfilePicture(
    @CurrentUser() user: { id: string },
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'FILE_REQUIRED',
          message: 'Image file is required',
        },
      });
    }

    return this.authService.uploadProfilePicture(user.id, file);
  }
}

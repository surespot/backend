import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthRepository } from './auth.repository';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { User, UserSchema } from './schemas/user.schema';
import { OtpCode, OtpCodeSchema } from './schemas/otp-code.schema';
import { RolesGuard } from './guards/roles.guard';
import {
  RefreshToken,
  RefreshTokenSchema,
} from './schemas/refresh-token.schema';
import { MailModule } from '../mail/mail.module';
import { SmsModule } from '../sms/sms.module';
import { RidersModule } from '../riders/riders.module';

@Module({
  imports: [
    // Register Mongoose models
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: OtpCode.name, schema: OtpCodeSchema },
      { name: RefreshToken.name, schema: RefreshTokenSchema },
    ]),

    // Passport module for JWT strategy
    PassportModule.register({ defaultStrategy: 'jwt' }),

    // Configure JWT module
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') ?? 'default-secret-key',
      }),
    }),

    // Mail module for sending OTP emails
    MailModule,

    // SMS module for sending OTP SMS
    SmsModule,
    forwardRef(() => RidersModule),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthRepository,
    JwtStrategy,
    GoogleStrategy,
    RolesGuard,
  ],
  exports: [AuthService, AuthRepository, JwtStrategy, RolesGuard],
})
export class AuthModule {}

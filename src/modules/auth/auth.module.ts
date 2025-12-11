import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthRepository } from './auth.repository';
import { JwtStrategy } from './strategies/jwt.strategy';
import { User, UserSchema } from './schemas/user.schema';
import { OtpCode, OtpCodeSchema } from './schemas/otp-code.schema';
import { RolesGuard } from './guards/roles.guard';
import {
  RefreshToken,
  RefreshTokenSchema,
} from './schemas/refresh-token.schema';

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
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthRepository, JwtStrategy, RolesGuard],
  exports: [AuthService, AuthRepository, JwtStrategy, RolesGuard],
})
export class AuthModule {}

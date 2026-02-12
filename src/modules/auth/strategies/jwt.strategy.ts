import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthRepository } from '../auth.repository';

export interface JwtPayload {
  sub: string; // userId
  role: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly authRepository: AuthRepository,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('JWT_SECRET') ?? 'default-secret-key',
    });
  }

  async validate(payload: JwtPayload) {
    const userId = payload.sub;

    if (!userId) {
      throw new UnauthorizedException({
        success: false,
        error: {
          code: 'AUTH_TOKEN_INVALID',
          message: 'Invalid token payload',
        },
      });
    }

    // Verify user exists and is active
    const user = await this.authRepository.findUserById(userId);
    if (!user) {
      throw new UnauthorizedException({
        success: false,
        error: {
          code: 'AUTH_USER_NOT_FOUND',
          message: 'User not found',
        },
      });
    }

    if (!user.isActive) {
      throw new UnauthorizedException({
        success: false,
        error: {
          code: 'AUTH_ACCOUNT_SUSPENDED',
          message: 'Account is suspended',
        },
      });
    }

    // Return user object that will be attached to req.user
    return {
      id: user._id.toString(),
      role: user.role,
      email: user.email,
      phone: user.phone,
      pickupLocationId: user.pickupLocationId
        ? user.pickupLocationId.toString()
        : undefined,
    };
  }
}

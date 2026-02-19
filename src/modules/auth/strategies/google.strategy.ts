import { PassportStrategy } from '@nestjs/passport';
import { Strategy, type StrategyOptions } from 'passport-google-oauth20';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface GoogleProfile {
  googleId: string;
  email?: string;
  firstName: string;
  lastName: string;
  avatar?: string;
  birthday?: Date;
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(configService: ConfigService) {
    const clientID = configService.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = configService.get<string>('GOOGLE_CLIENT_SECRET');
    const options: StrategyOptions = {
      clientID: clientID ?? '',
      clientSecret: clientSecret ?? '',
      callbackURL:
        configService.get<string>('GOOGLE_CALLBACK_URL') ??
        'http://localhost:4000/auth/google/callback',
      scope: [
        'email',
        'profile',
        'https://www.googleapis.com/auth/user.birthday.read',
      ],
    };
    super(options);
  }

  async validate(
    accessToken: string,
    _refreshToken: string,
    profile: {
      id: string;
      name?: { givenName?: string; familyName?: string };
      emails?: Array<{ value: string }>;
      photos?: Array<{ value: string }>;
    },
  ): Promise<GoogleProfile> {
    const { id, name, emails, photos } = profile;

    let birthday: Date | undefined;
    try {
      const res = await axios.get<{
        birthdays?: Array<{
          date?: { year?: number; month?: number; day?: number };
        }>;
      }>(
        'https://people.googleapis.com/v1/people/me?personFields=birthdays',
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      const date = res.data?.birthdays?.[0]?.date;
      if (date?.year && date?.month && date?.day) {
        birthday = new Date(date.year, date.month - 1, date.day);
      }
    } catch {
      // Birthday may be private or People API unavailable; continue without it
    }

    return {
      googleId: id,
      email: emails?.[0]?.value,
      firstName: name?.givenName ?? 'User',
      lastName: name?.familyName ?? '',
      avatar: photos?.[0]?.value,
      birthday,
    };
  }
}

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type RiderProfileDocument = HydratedDocument<RiderProfile>;

export enum RiderStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  PENDING = 'pending',
  REJECTED = 'rejected',
}

@Schema({ timestamps: true })
export class RiderProfile {
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: false, index: true })
  userId: Types.ObjectId;

  @Prop({ type: Array<number>, default: [1, 2, 3, 4, 5, 6] })
  schedule: number[];

  @Prop({ type: Number, default: 0 })
  rating: number;

  @Prop({
    type: String,
    enum: RiderStatus,
    default: RiderStatus.PENDING,
    index: true,
  })
  status: RiderStatus;

  // Contact info (stored before User account creation)
  @Prop({ type: String })
  firstName?: string;

  @Prop({ type: String })
  lastName?: string;

  @Prop({ type: String })
  phone?: string;

  @Prop({ type: String })
  email?: string;

  @Prop({ type: Date })
  dateOfBirth?: Date;

  @Prop({ type: String })
  address?: string;

  @Prop({ type: String })
  nin?: string;

  @Prop({ type: Types.ObjectId, ref: 'Region', required: true, index: true })
  regionId: Types.ObjectId;

  @Prop({
    type: String,
    required: true,
    unique: true,
    index: true,
    match: /^\d{16}$/,
  })
  registrationCode: string;

  @Prop({ type: Number, default: 0 })
  totalDistanceToday: number; // in meters

  @Prop({ type: Date })
  sessionStartTime?: Date; // When rider went online today

  @Prop({ type: Number, default: 0 })
  totalOnlineTimeToday: number; // in minutes

  createdAt?: Date;
  updatedAt?: Date;
}

export const RiderProfileSchema = SchemaFactory.createForClass(RiderProfile);

export const DAY_NUMBER_MAP = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
} as const;

// Schedule type to day array mapping
export const SCHEDULE_TYPE_MAP = {
  'full-time': [1, 2, 3, 4, 5, 6], // Mon-Sat
  'part-time-weekdays': [1, 2, 3, 4, 5], // Mon-Fri
  'part-time-weekends': [6, 0], // Sat-Sun
  custom: [], // User-selected array of days
} as const;

export type ScheduleType = keyof typeof SCHEDULE_TYPE_MAP;

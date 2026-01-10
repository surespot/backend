import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

export enum UserRole {
  USER = 'user',
  RIDER = 'rider',
  RESTAURANT = 'restaurant',
  ADMIN = 'admin',
}

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true })
  firstName?: string;

  @Prop({ required: true })
  lastName?: string;

  @Prop({ required: false, unique: true, sparse: true, index: true })
  phone: string;

  @Prop({ required: false, unique: true, sparse: true, index: true })
  email?: string;

  @Prop({ required: false })
  password?: string;

  @Prop()
  birthday?: Date;

  @Prop()
  avatar?: string;

  @Prop({ unique: true, sparse: true, index: true })
  googleId?: string;

  @Prop({ default: false })
  isPhoneVerified: boolean;

  @Prop({ default: false })
  isEmailVerified: boolean;

  @Prop({ type: String, enum: UserRole, default: UserRole.USER })
  role: UserRole;

  @Prop({ default: false })
  isRider: boolean;

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  lastLoginAt?: Date;

  @Prop()
  deletedAt?: Date;

  @Prop({ type: [String], default: [] })
  expoPushTokens?: string[];

  createdAt?: Date;
  updatedAt?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

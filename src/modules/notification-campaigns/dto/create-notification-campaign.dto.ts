import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsArray,
  IsOptional,
  IsMongoId,
  ValidateIf,
} from 'class-validator';
import { NewsletterAudienceType } from '../../mail/schemas/newsletter.schema';
import {
  NotificationCampaignChannel,
  NotificationCampaignTargetMode,
} from '../schemas/notification-campaign.schema';

export class CreateNotificationCampaignDto {
  @ApiProperty({
    description: 'Delivery channel',
    enum: NotificationCampaignChannel,
    example: NotificationCampaignChannel.SMS,
  })
  @IsEnum(NotificationCampaignChannel)
  channel: NotificationCampaignChannel;

  @ApiProperty({
    description: 'How recipients are targeted',
    enum: NotificationCampaignTargetMode,
    example: NotificationCampaignTargetMode.DEMOGRAPHIC,
  })
  @IsEnum(NotificationCampaignTargetMode)
  targetMode: NotificationCampaignTargetMode;

  @ApiPropertyOptional({
    description: 'Target audience type (required for demographic targetMode)',
    enum: NewsletterAudienceType,
  })
  @ValidateIf(
    (dto: CreateNotificationCampaignDto) =>
      dto.targetMode === NotificationCampaignTargetMode.DEMOGRAPHIC,
  )
  @IsEnum(NewsletterAudienceType)
  audience?: NewsletterAudienceType;

  @ApiPropertyOptional({
    description: 'Pickup location IDs (for pickup-locations audience)',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  targetPickupLocationIds?: string[];

  @ApiPropertyOptional({
    description: 'Region IDs (for regions audience)',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  targetRegionIds?: string[];

  @ApiPropertyOptional({
    description: 'Specific user IDs (required for specific-users targetMode)',
    type: [String],
  })
  @ValidateIf(
    (dto: CreateNotificationCampaignDto) =>
      dto.targetMode === NotificationCampaignTargetMode.SPECIFIC_USERS,
  )
  @IsArray()
  @IsMongoId({ each: true })
  targetUserIds?: string[];

  @ApiPropertyOptional({
    description: 'Email subject (required for email channel)',
  })
  @ValidateIf(
    (dto: CreateNotificationCampaignDto) =>
      dto.channel === NotificationCampaignChannel.EMAIL,
  )
  @IsString()
  @IsNotEmpty()
  subject?: string;

  @ApiPropertyOptional({
    description: 'Push notification title (required for push channel)',
  })
  @ValidateIf(
    (dto: CreateNotificationCampaignDto) =>
      dto.channel === NotificationCampaignChannel.PUSH,
  )
  @IsString()
  @IsNotEmpty()
  title?: string;

  @ApiProperty({
    description: 'Message body (HTML for email, plain text for sms/push)',
  })
  @IsString()
  @IsNotEmpty()
  body: string;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
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

export class PreviewNotificationCampaignDto {
  @ApiProperty({
    description: 'Delivery channel',
    enum: NotificationCampaignChannel,
  })
  @IsEnum(NotificationCampaignChannel)
  channel: NotificationCampaignChannel;

  @ApiProperty({
    description: 'How recipients are targeted',
    enum: NotificationCampaignTargetMode,
  })
  @IsEnum(NotificationCampaignTargetMode)
  targetMode: NotificationCampaignTargetMode;

  @ApiPropertyOptional({
    description: 'Target audience type (required for demographic targetMode)',
    enum: NewsletterAudienceType,
  })
  @ValidateIf(
    (dto: PreviewNotificationCampaignDto) =>
      dto.targetMode === NotificationCampaignTargetMode.DEMOGRAPHIC,
  )
  @IsEnum(NewsletterAudienceType)
  audience?: NewsletterAudienceType;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  targetPickupLocationIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  targetRegionIds?: string[];

  @ApiPropertyOptional({
    description: 'Specific user IDs (required for specific-users targetMode)',
    type: [String],
  })
  @ValidateIf(
    (dto: PreviewNotificationCampaignDto) =>
      dto.targetMode === NotificationCampaignTargetMode.SPECIFIC_USERS,
  )
  @IsArray()
  @IsMongoId({ each: true })
  targetUserIds?: string[];
}

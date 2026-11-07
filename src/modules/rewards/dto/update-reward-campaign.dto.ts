import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateRewardCampaignDto } from './create-reward-campaign.dto';

/** The trigger is fixed once created: grants already earned depend on it. */
export class UpdateRewardCampaignDto extends PartialType(
  OmitType(CreateRewardCampaignDto, ['trigger'] as const),
) {}

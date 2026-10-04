import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  Matches,
  ValidateIf,
} from 'class-validator';
import { SubscriberChannel } from '../schemas/newsletter-subscriber.schema';

export class SubscribeNewsletterDto {
  @ApiProperty({ enum: SubscriberChannel, example: SubscriberChannel.EMAIL })
  @IsEnum(SubscriberChannel)
  channel: SubscriberChannel;

  @ApiPropertyOptional({ example: 'you@example.com' })
  @ValidateIf(
    (o: SubscribeNewsletterDto) => o.channel === SubscriberChannel.EMAIL,
  )
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    example: '+2348163395600',
    description: 'Nigerian mobile: +234XXXXXXXXXX or 0XXXXXXXXXX',
  })
  @ValidateIf(
    (o: SubscribeNewsletterDto) => o.channel === SubscriberChannel.WHATSAPP,
  )
  @Matches(/^(\+234|0)[789][01]\d{8}$/, {
    message: 'phone must be a valid Nigerian mobile number',
  })
  phone?: string;

  @ApiPropertyOptional({ example: 'landing-page' })
  @IsOptional()
  @Matches(/^[a-z0-9-]{1,32}$/)
  source?: string;
}

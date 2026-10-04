import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  NewsletterSubscriber,
  NewsletterSubscriberDocument,
  SubscriberChannel,
} from './schemas/newsletter-subscriber.schema';
import { SubscribeNewsletterDto } from './dto/subscribe-newsletter.dto';

@Injectable()
export class NewsletterSubscribersService {
  constructor(
    @InjectModel(NewsletterSubscriber.name)
    private readonly model: Model<NewsletterSubscriberDocument>,
  ) {}

  async subscribe(dto: SubscribeNewsletterDto): Promise<void> {
    const filter =
      dto.channel === SubscriberChannel.EMAIL
        ? { email: dto.email!.trim().toLowerCase() }
        : { phone: this.normalisePhone(dto.phone!) };

    // Upsert; re-subscribing re-activates a previously unsubscribed contact.
    await this.model.updateOne(
      filter,
      {
        $set: { isActive: true },
        $unset: { unsubscribedAt: '' },
        $setOnInsert: {
          channel: dto.channel,
          source: dto.source ?? 'landing-page',
        },
      },
      { upsert: true },
    );
  }

  /** Active email subscribers, for the `subscribers` newsletter audience. */
  async findActiveEmails(): Promise<string[]> {
    const rows = await this.model
      .find({ channel: SubscriberChannel.EMAIL, isActive: true })
      .select('email')
      .lean()
      .exec();
    return rows.map((r) => r.email).filter((e): e is string => !!e);
  }

  private normalisePhone(phone: string): string {
    return phone.startsWith('0') ? `+234${phone.slice(1)}` : phone;
  }
}

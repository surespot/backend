import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Newsletter, NewsletterDocument } from './schemas/newsletter.schema';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class NewsletterService {
  private readonly logger = new Logger(NewsletterService.name);

  constructor(
    @InjectModel(Newsletter.name)
    private readonly newsletterModel: Model<NewsletterDocument>,
    @InjectQueue('newsletters') private readonly newsletterQueue: Queue,
  ) {}

  /**
   * Create a newsletter draft
   */
  async create(
    subject: string,
    body: string,
    audience: string,
    targetPickupLocationIds: string[] | undefined,
    targetRegionIds: string[] | undefined,
    createdBy: string,
  ): Promise<NewsletterDocument> {
    const newsletter = await this.newsletterModel.create({
      subject,
      body,
      audience,
      targetPickupLocationIds: targetPickupLocationIds?.map(
        (id) => new Types.ObjectId(id),
      ),
      targetRegionIds: targetRegionIds?.map((id) => new Types.ObjectId(id)),
      createdBy: new Types.ObjectId(createdBy),
      status: 'draft',
    });

    this.logger.log(`Newsletter created: ${newsletter._id}`);
    return newsletter;
  }

  /**
   * Send a newsletter (queue it for processing)
   */
  async send(newsletterId: string): Promise<void> {
    const newsletter = await this.newsletterModel.findById(newsletterId);

    if (!newsletter) {
      throw new NotFoundException('Newsletter not found');
    }

    if (newsletter.status === 'sent') {
      throw new Error('Newsletter already sent');
    }

    if (newsletter.status === 'sending') {
      throw new Error('Newsletter is already being sent');
    }

    // Mark as sending
    await this.newsletterModel.updateOne(
      { _id: newsletter._id },
      { $set: { status: 'sending' } },
    );

    // Queue the newsletter
    await this.newsletterQueue.add('send-newsletter', {
      newsletterId: newsletter._id.toString(),
    });

    this.logger.log(`Newsletter ${newsletterId} queued for sending`);
  }

  /**
   * Get all newsletters
   */
  async findAll(): Promise<NewsletterDocument[]> {
    return this.newsletterModel
      .find()
      .sort({ createdAt: -1 })
      .populate('createdBy', 'firstName lastName email')
      .exec();
  }

  /**
   * Get newsletter by ID
   */
  async findById(id: string): Promise<NewsletterDocument | null> {
    return this.newsletterModel
      .findById(id)
      .populate('createdBy', 'firstName lastName email')
      .exec();
  }
}

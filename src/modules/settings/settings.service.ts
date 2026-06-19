import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SiteSettings, SiteSettingsDocument } from './schemas/site-settings.schema';
import { UpdateSiteSettingsDto } from './dto/update-site-settings.dto';

@Injectable()
export class SettingsService {
  constructor(
    @InjectModel(SiteSettings.name)
    private readonly settingsModel: Model<SiteSettingsDocument>,
  ) {}

  async get(): Promise<SiteSettingsDocument> {
    let settings = await this.settingsModel.findOne({ key: 'global' }).exec();
    if (!settings) {
      settings = await this.settingsModel.create({ key: 'global' });
    }
    return settings;
  }

  async update(dto: UpdateSiteSettingsDto): Promise<SiteSettingsDocument> {
    const settings = await this.settingsModel
      .findOneAndUpdate(
        { key: 'global' },
        { $set: dto },
        { upsert: true, new: true },
      )
      .exec();
    return settings!;
  }
}

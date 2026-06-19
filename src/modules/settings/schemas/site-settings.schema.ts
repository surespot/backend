import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SiteSettingsDocument = HydratedDocument<SiteSettings>;

@Schema({ timestamps: true })
export class SiteSettings {
  @Prop({ required: true, unique: true, default: 'global' })
  key: string; // singleton: always 'global'

  @Prop({ type: Number, default: 30000, min: 0 })
  packagingFeeKobo: number; // packaging fee added to orders with per_pack items (in kobo)

  @Prop({ type: Number, default: 20, min: 0, max: 23 })
  orderCutoffHour: number; // hour (WAT, 24h) after which new orders are rejected (default 20 = 8PM)
}

export const SiteSettingsSchema = SchemaFactory.createForClass(SiteSettings);

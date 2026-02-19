import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SmsService } from './sms.service';
import { SmsMessageBuilderService } from './sms-message-builder.service';
import { BulksmsSmsProvider } from './providers/bulksms-sms.provider';
import { TermiiSmsProvider } from './providers/termii-sms.provider';
import { ISmsProvider } from './interfaces/sms-provider.interface';
import { SMS_PROVIDER } from './sms.constants';

@Module({
  imports: [ConfigModule],
  providers: [
    BulksmsSmsProvider,
    TermiiSmsProvider,
    {
      provide: SMS_PROVIDER,
      useFactory: (
        config: ConfigService,
        bulksms: BulksmsSmsProvider,
        termii: TermiiSmsProvider,
      ): ISmsProvider => {
        const provider =
          config.get<'bulksms' | 'termii'>('SMS_PROVIDER') ?? 'bulksms';
        return provider === 'termii' ? termii : bulksms;
      },
      inject: [ConfigService, BulksmsSmsProvider, TermiiSmsProvider],
    },
    SmsService,
    SmsMessageBuilderService,
  ],
  exports: [SmsService, SmsMessageBuilderService],
})
export class SmsModule {}

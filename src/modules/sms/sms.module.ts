import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SmsService } from './sms.service';
import { SmsMessageBuilderService } from './sms-message-builder.service';

@Module({
  imports: [ConfigModule],
  providers: [SmsService, SmsMessageBuilderService],
  exports: [SmsService, SmsMessageBuilderService],
})
export class SmsModule {}

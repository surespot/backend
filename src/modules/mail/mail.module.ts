import { Module } from '@nestjs/common';
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';
import { join } from 'path';

@Module({
  imports: [
    MailerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const host = config.get<string>('SMTP_HOST') ?? 'smtp.gmail.com';
        const port = Number(config.get<string>('SMTP_PORT')) || 587;
        const user =
          config.get<string>('SMTP_USER') ?? config.get<string>('GMAIL_USER');
        const pass =
          config.get<string>('SMTP_PASSWORD') ??
          config.get<string>('GMAIL_APP_PASSWORD');
        const fromName =
          config.get<string>('SMTP_FROM_NAME') ??
          config.get<string>('MAIL_FROM_NAME') ??
          'SureSpot';

        return {
          transport: {
            host,
            port,
            // requireTLS: true,
            secure: port === 465,
            auth: {
              user,
              pass,
            },
          },
          defaults: {
            from: `"${fromName}" <${user}>`,
          },
          template: {
            dir: join(__dirname, 'templates'),
            adapter: new HandlebarsAdapter({
              helpers: {
                eq: (a: any, b: any) => a === b,
                currentYear: () => new Date().getFullYear(),
              },
            } as any),
            options: {
              strict: true,
            },
          },
        };
      },
    }),
  ],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}

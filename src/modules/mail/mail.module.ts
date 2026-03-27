import { Module, forwardRef } from '@nestjs/common';
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { MailService } from './mail.service';
import { NewsletterService } from './newsletter.service';
import { NewslettersProcessor } from './newsletters.processor';
import { Newsletter, NewsletterSchema } from './schemas/newsletter.schema';
import { User, UserSchema } from '../auth/schemas/user.schema';
import { OrdersModule } from '../orders/orders.module';
import { existsSync } from 'fs';
import { join } from 'path';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'newsletters',
    }),
    MongooseModule.forFeature([
      { name: Newsletter.name, schema: NewsletterSchema },
      { name: User.name, schema: UserSchema },
    ]),
    forwardRef(() => OrdersModule),
    MailerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        let templateDir = join(__dirname, 'templates');
        if (!existsSync(join(templateDir, 'otp.hbs'))) {
          const fallback = join(
            process.cwd(),
            'src',
            'modules',
            'mail',
            'templates',
          );
          if (existsSync(join(fallback, 'otp.hbs'))) {
            templateDir = fallback;
          }
        }

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
            dir: templateDir,
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
  providers: [MailService, NewsletterService, NewslettersProcessor],
  exports: [MailService, NewsletterService],
})
export class MailModule {}

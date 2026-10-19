import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../config';
import { MailService } from './mail.service';
import { MAILER, SmtpMailer } from './mailer';

/** One mail setup for the whole API. Without SMTP_URL there is no mailer and emails are skipped. */
@Global()
@Module({
  providers: [
    MailService,
    {
      provide: MAILER,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => (config.smtpUrl ? new SmtpMailer(config.smtpUrl, config.mailFrom) : null),
    },
  ],
  exports: [MailService],
})
export class MailModule {}

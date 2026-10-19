import { Module } from '@nestjs/common';
import { APP_CONFIG, AppConfig, DEFAULT_GEMINI_MODEL } from '../config';
import { GeminiClient } from '../llm/gemini.client';
import { LLM_CLIENT } from '../llm/llm-client';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { ConfirmationMessageService } from './confirmation-message.service';
import { ReferenceGenerator } from './reference.generator';

@Module({
  controllers: [BookingsController],
  providers: [
    BookingsService,
    ReferenceGenerator,
    ConfirmationMessageService,
    {
      // FR-11 is optional: without GEMINI_API_KEY there's no client and the template is used.
      provide: LLM_CLIENT,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        config.geminiApiKey ? new GeminiClient(config.geminiApiKey, config.geminiModel ?? DEFAULT_GEMINI_MODEL) : null,
    },
  ],
})
export class BookingsModule {}

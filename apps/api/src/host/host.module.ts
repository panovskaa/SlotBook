import { Module } from '@nestjs/common';
import { HostController } from './host.controller';
import { HostService } from './host.service';
import { InsightsService } from './insights.service';

@Module({ controllers: [HostController], providers: [HostService, InsightsService] })
export class HostModule {}

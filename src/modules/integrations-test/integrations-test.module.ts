import { Module } from '@nestjs/common';
import { IntegrationsTestService } from './integrations-test.service';
import { IntegrationsTestController } from './integrations-test.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [IntegrationsTestController],
  providers: [IntegrationsTestService],
  exports: [IntegrationsTestService],
})
export class IntegrationsTestModule {}

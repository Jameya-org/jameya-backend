import { Module } from '@nestjs/common';
import { RefreshTokenCleanupJob } from './refresh-token-cleanup.job';

@Module({
  providers: [RefreshTokenCleanupJob],
  exports: [RefreshTokenCleanupJob],
})
export class JobsModule {}

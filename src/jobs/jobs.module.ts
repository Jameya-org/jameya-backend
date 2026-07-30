import { Module } from '@nestjs/common';
import { RefreshTokenCleanupJob } from './refresh-token-cleanup.job';
import { ReservationExpiryJob } from './reservation-expiry.job';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [RefreshTokenCleanupJob, ReservationExpiryJob],
  exports: [RefreshTokenCleanupJob, ReservationExpiryJob],
})
export class JobsModule {}

import { Module } from '@nestjs/common';
import { RefreshTokenCleanupJob } from './refresh-token-cleanup.job';
import { ReservationExpiryJob } from './reservation-expiry.job';
import { InstallmentCollectionJob } from './installment-collection.job';
import { PrismaModule } from '../prisma/prisma.module';
import { InstallmentsModule } from '../modules/installments/installments.module';
import { PaymentsModule } from '../modules/payments/payments.module';

import { NotificationsModule } from '../modules/notifications/notifications.module';

@Module({
  imports: [PrismaModule, InstallmentsModule, PaymentsModule, NotificationsModule],
  providers: [RefreshTokenCleanupJob, ReservationExpiryJob, InstallmentCollectionJob],
  exports: [RefreshTokenCleanupJob, ReservationExpiryJob, InstallmentCollectionJob],
})
export class JobsModule {}

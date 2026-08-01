import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { LedgerService } from './ledger.service';
import { PaymentMethodsService } from './payment-methods.service';
import { CustomerPaymentMethodsController } from './customer-payment-methods.controller';
import { PaymentsWebhookController } from './payments-webhook.controller';
import { MockCardGatewayProvider } from './providers/mock-card-gateway.provider';
import { PAYMENT_GATEWAY } from './providers/payment-gateway.interface';

import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [CustomerPaymentMethodsController, PaymentsWebhookController],
  providers: [
    LedgerService,
    PaymentMethodsService,
    {
      provide: PAYMENT_GATEWAY,
      useClass: MockCardGatewayProvider,
    },
  ],
  exports: [LedgerService, PaymentMethodsService, PAYMENT_GATEWAY],
})
export class PaymentsModule {}

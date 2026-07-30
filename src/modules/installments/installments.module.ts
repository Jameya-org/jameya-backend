import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { PaymentsModule } from '../payments/payments.module';
import { InstallmentsService } from './installments.service';
import { CustomerInstallmentsController } from './customer-installments.controller';

@Module({
  imports: [PrismaModule, PaymentsModule],
  controllers: [CustomerInstallmentsController],
  providers: [InstallmentsService],
  exports: [InstallmentsService],
})
export class InstallmentsModule {}

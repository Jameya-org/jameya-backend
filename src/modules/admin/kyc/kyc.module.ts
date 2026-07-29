import { Module } from '@nestjs/common';
import { KycController } from './kyc.controller';
import { KycService } from './kyc.service';
import { CustomersRepository } from 'src/modules/customers/customers.repository';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [KycController],
  providers: [KycService, CustomersRepository],
})
export class KycModule {}


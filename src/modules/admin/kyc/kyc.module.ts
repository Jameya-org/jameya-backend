import { Module } from '@nestjs/common';
import { KycController } from './kyc.controller';
import { KycService } from './kyc.service';
import { CustomersRepository } from 'src/modules/customers/customers.repository';

@Module({
  controllers: [KycController],
  providers: [KycService, CustomersRepository],
})
export class KycModule {}

import { Module } from '@nestjs/common';
import { CirclesController } from './circles.controller';
import { CirclesService } from './circles.service';
import { FeePoliciesController } from './fee-policies/fee-policies.controller';
import { FeePoliciesService } from './fee-policies/fee-policies.service';
import { FeeCalculatorService } from './fee-calculator.service';
import { CustomerCirclesController } from './customer-circles.controller';
import { CustomerCirclesService } from './customer-circles.service';
import { MembershipsService } from './memberships.service';
import { AuditModule } from '../admin/audit/audit.module';
import { ContractsModule } from '../contracts/contracts.module';
import { AuthModule } from '../auth/auth.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [AuditModule, ContractsModule, AuthModule, PaymentsModule],
  controllers: [
    CirclesController,
    FeePoliciesController,
    CustomerCirclesController,
  ],
  providers: [
    CirclesService,
    FeePoliciesService,
    FeeCalculatorService,
    CustomerCirclesService,
    MembershipsService,
  ],
  exports: [
    CirclesService,
    FeePoliciesService,
    FeeCalculatorService,
    CustomerCirclesService,
    MembershipsService,
  ],
})
export class CirclesModule {}

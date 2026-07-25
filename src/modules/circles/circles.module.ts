import { Module } from '@nestjs/common';
import { CirclesController } from './circles.controller';
import { CirclesService } from './circles.service';
import { FeePoliciesController } from './fee-policies/fee-policies.controller';
import { FeePoliciesService } from './fee-policies/fee-policies.service';
import { FeeCalculatorService } from './fee-calculator.service';
import { AuditModule } from '../admin/audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [CirclesController, FeePoliciesController],
  providers: [CirclesService, FeePoliciesService, FeeCalculatorService],
  exports: [CirclesService, FeePoliciesService, FeeCalculatorService],
})
export class CirclesModule {}

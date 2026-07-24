import { Module } from '@nestjs/common';
import { CirclesController } from './circles.controller';
import { CirclesService } from './circles.service';
import { FeePoliciesController } from './fee-policies/fee-policies.controller';
import { FeePoliciesService } from './fee-policies/fee-policies.service';

@Module({
  controllers: [CirclesController, FeePoliciesController],
  providers: [CirclesService, FeePoliciesService],
  exports: [CirclesService, FeePoliciesService],
})
export class CirclesModule {}

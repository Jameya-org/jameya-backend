import { Controller } from '@nestjs/common';
import { FeePoliciesService } from './fee-policies.service';

@Controller('circles/fee-policies')
export class FeePoliciesController {
  constructor(private readonly feePoliciesService: FeePoliciesService) {}
}

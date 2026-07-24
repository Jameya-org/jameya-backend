import { Controller } from '@nestjs/common';
import { AuditService } from './audit.service';

@Controller('admin/audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}
}

import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { QueryAuditDto } from './dto/query-audit.dto';
import { AdminJwtGuard } from '../auth/guards/admin-jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';

@ApiTags('Admin – Audit Log Viewer (ADM-15)')
@ApiBearerAuth('access-token')
@UseGuards(AdminJwtGuard, RolesGuard)
@Controller('admin/audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @RequirePermissions('admins:read')
  @ApiOperation({
    summary: 'Search & query administrative audit logs (ADM-15)',
  })
  @ApiResponse({ status: 200, description: 'Paginated list of audit events' })
  getAuditEvents(@Query() query: QueryAuditDto) {
    return this.auditService.getAuditEvents(query);
  }
}


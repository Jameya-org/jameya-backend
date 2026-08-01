import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { AdminJwtGuard } from '../auth/guards/admin-jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';

@ApiTags('Admin – Financial & Operational Reports (ADM-13)')
@ApiBearerAuth('access-token')
@UseGuards(AdminJwtGuard, RolesGuard)
@Controller('admin/reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('collections')
  @RequirePermissions('dashboard:read')
  @ApiOperation({ summary: 'Collection rate, due vs paid amounts, and channel breakdown (ADM-13)' })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  getCollectionsReport(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportsService.getCollectionsReport(startDate, endDate);
  }

  @Get('customers')
  @RequirePermissions('customers:read')
  @ApiOperation({ summary: 'Customer status distribution, active obligations, and KYC breakdown (ADM-13)' })
  getCustomersReport() {
    return this.reportsService.getCustomersReport();
  }

  @Get('risk')
  @RequirePermissions('customers:read')
  @ApiOperation({ summary: 'Risk score distribution, average trust score, and manual overrides (ADM-13)' })
  getRiskReport() {
    return this.reportsService.getRiskReport();
  }

  @Get('audit')
  @RequirePermissions('admins:read')
  @ApiOperation({ summary: 'Summary of administrative activity by action type and admin user (ADM-13)' })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  getAuditReport(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportsService.getAuditReport(startDate, endDate);
  }
}

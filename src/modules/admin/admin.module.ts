import { Module } from '@nestjs/common';
import { AdminUsersController } from './admin-users/admin-users.controller';
import { AdminUsersService } from './admin-users/admin-users.service';
import { AuditController } from './audit/audit.controller';
import { AuditService } from './audit/audit.service';
import { DashboardController } from './dashboard/dashboard.controller';
import { RolesService } from './roles/roles.service';

@Module({
  controllers: [AdminUsersController, AuditController, DashboardController],
  providers: [AdminUsersService, RolesService, AuditService],
  exports: [AdminUsersService, RolesService, AuditService],
})
export class AdminModule {}

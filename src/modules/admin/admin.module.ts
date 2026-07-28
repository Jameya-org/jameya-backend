import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

// Admin Users
import { AdminUsersController } from './admin-users/admin-users.controller';
import { AdminUsersService } from './admin-users/admin-users.service';

// Audit & Dashboard
import { AuditController } from './audit/audit.controller';
import { AuditService } from './audit/audit.service';
import { DashboardController } from './dashboard/dashboard.controller';
import { RolesService } from './roles/roles.service';

// Admin Auth
import { AdminAuthController } from './auth/admin-auth.controller';
import { AdminAuthService } from './auth/admin-auth.service';
import { AdminJwtStrategy } from './auth/strategies/admin-jwt.strategy';
import { AdminJwtRefreshStrategy } from './auth/strategies/admin-jwt-refresh.strategy';

// Admin Circles
import { AdminCirclesController } from './circles/admin-circles.controller';
import { CirclesModule } from '../circles/circles.module';

import { AuditModule } from './audit/audit.module';
import { KycModule } from './kyc/kyc.module';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({}),
    CirclesModule,
    AuditModule,
    KycModule,
  ],
  controllers: [
    AdminAuthController,
    AdminUsersController,
    AuditController,
    DashboardController,
    AdminCirclesController,
  ],
  providers: [
    AdminAuthService,
    AdminJwtStrategy,
    AdminJwtRefreshStrategy,
    AdminUsersService,
    RolesService,
  ],
  exports: [AdminAuthService, AdminUsersService, RolesService, AuditModule],
})
export class AdminModule {}

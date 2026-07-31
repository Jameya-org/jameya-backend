import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

// Admin Auth
import { AdminAuthController } from './auth/admin-auth.controller';
import { AdminAuthService } from './auth/admin-auth.service';
import { AdminJwtStrategy } from './auth/strategies/admin-jwt.strategy';
import { AdminJwtRefreshStrategy } from './auth/strategies/admin-jwt-refresh.strategy';

// Profile
import { AdminProfileController } from './profile/admin-profile.controller';
import { AdminProfileService } from './profile/admin-profile.service';

// Dashboard
import { DashboardController } from './dashboard/dashboard.controller';
import { DashboardService } from './dashboard/dashboard.service';

// Admin User Management
import { AdminUsersController } from './admin-users/admin-users.controller';
import { AdminUsersService } from './admin-users/admin-users.service';

// Customer Management
import { AdminCustomersController } from './customers/admin-customers.controller';
import { AdminCustomersService } from './customers/admin-customers.service';

// Payments
import { AdminPaymentsController } from './payments/admin-payments.controller';
import { AdminPaymentsService } from './payments/admin-payments.service';

// Audit & Roles
import { AuditController } from './audit/audit.controller';
import { AuditService } from './audit/audit.service';
import { RolesController } from './roles/roles.controller';
import { RolesService } from './roles/roles.service';

// Admin Circles & Memberships
import { AdminCirclesController } from './circles/admin-circles.controller';
import { AdminMembershipsController } from './memberships/admin-memberships.controller';
import { AdminMembershipsService } from './memberships/admin-memberships.service';
import { CirclesModule } from '../circles/circles.module';

// KYC (has its own module with AuditModule imported inside)
import { KycModule } from './kyc/kyc.module';
import { AuditModule } from './audit/audit.module';
import { AdminInstallmentsController } from './installments/admin-installments.controller';

import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({}),
    CirclesModule,
    AuditModule,
    KycModule,
    NotificationsModule,
  ],
  controllers: [
    AdminAuthController,
    AdminProfileController,
    DashboardController,
    AdminUsersController,
    AdminCustomersController,
    AdminPaymentsController,
    AuditController,
    RolesController,
    AdminCirclesController,
    AdminMembershipsController,
    AdminInstallmentsController,
  ],
  providers: [
    AdminAuthService,
    AdminJwtStrategy,
    AdminJwtRefreshStrategy,
    AdminProfileService,
    DashboardService,
    AdminUsersService,
    AdminCustomersService,
    AdminPaymentsService,
    AuditService,
    RolesService,
    AdminMembershipsService,
  ],
  exports: [
    AdminAuthService,
    AdminUsersService,
    RolesService,
    AuditModule,
    AdminMembershipsService,
  ],
})
export class AdminModule {}

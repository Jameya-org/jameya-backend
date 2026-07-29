import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { UpdateAdminStatusDto } from './dto/update-admin-status.dto';
import { UpdateAdminRoleDto } from './dto/update-admin-role.dto';
import { randomBytes, scryptSync } from 'node:crypto';

function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(plain, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

const SAFE_ADMIN_SELECT = {
  id: true,
  email: true,
  status: true,
  mfaEnabled: true,
  lastLoginAt: true,
  createdAt: true,
  role: { select: { id: true, name: true, permissions: true } },
} as const;

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async listAdmins() {
    return this.prisma.adminUser.findMany({
      select: SAFE_ADMIN_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async createAdmin(dto: CreateAdminUserDto, actorAdminId: string) {
    const existing = await this.prisma.adminUser.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('An admin with this email already exists');
    }

    let targetRoleId = dto.roleId;
    if (!targetRoleId) {
      const superAdminRole = await this.prisma.role.findUnique({
        where: { name: 'SUPER_ADMIN' },
      });
      if (!superAdminRole) {
        throw new NotFoundException('Default SUPER_ADMIN role not found');
      }
      targetRoleId = superAdminRole.id;
    } else {
      const role = await this.prisma.role.findUnique({ where: { id: targetRoleId } });
      if (!role) throw new NotFoundException('Role not found');
    }

    const admin = await this.prisma.adminUser.create({
      data: {
        email: dto.email,
        passwordHash: hashPassword(dto.password),
        roleId: targetRoleId,
        mfaEnabled: false,
      },
      select: SAFE_ADMIN_SELECT,
    });

    await this.auditService.log({
      actorAdminId,
      action: 'admin.created',
      entityType: 'AdminUser',
      entityId: admin.id,
      newValue: { email: admin.email, roleId: targetRoleId },
    });

    return admin;
  }

  async updateStatus(
    targetId: string,
    dto: UpdateAdminStatusDto,
    actorAdminId: string,
    ipAddress?: string,
  ) {
    const admin = await this.prisma.adminUser.findUnique({
      where: { id: targetId },
      select: SAFE_ADMIN_SELECT,
    });
    if (!admin) throw new NotFoundException('Admin not found');

    if (admin.status === dto.status) {
      throw new BadRequestException(`Admin is already ${dto.status}`);
    }

    const updated = await this.prisma.adminUser.update({
      where: { id: targetId },
      data: { status: dto.status },
      select: SAFE_ADMIN_SELECT,
    });

    // If suspending — revoke all active sessions
    if (dto.status === 'SUSPENDED' || dto.status === 'INACTIVE') {
      await this.prisma.refreshToken.updateMany({
        where: { adminId: targetId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    await this.auditService.log({
      actorAdminId,
      action: 'admin.status_changed',
      entityType: 'AdminUser',
      entityId: targetId,
      oldValue: { status: admin.status },
      newValue: { status: updated.status },
      reason: dto.reason,
      ipAddress,
    });

    return updated;
  }

  async updateRole(
    targetId: string,
    dto: UpdateAdminRoleDto,
    actorAdminId: string,
    ipAddress?: string,
  ) {
    const admin = await this.prisma.adminUser.findUnique({
      where: { id: targetId },
      select: SAFE_ADMIN_SELECT,
    });
    if (!admin) throw new NotFoundException('Admin not found');

    const role = await this.prisma.role.findUnique({ where: { id: dto.roleId } });
    if (!role) throw new NotFoundException('Role not found');

    const updated = await this.prisma.adminUser.update({
      where: { id: targetId },
      data: { roleId: dto.roleId },
      select: SAFE_ADMIN_SELECT,
    });

    await this.auditService.log({
      actorAdminId,
      action: 'admin.role_changed',
      entityType: 'AdminUser',
      entityId: targetId,
      oldValue: { roleId: admin.role.id, roleName: admin.role.name },
      newValue: { roleId: dto.roleId, roleName: role.name },
      reason: dto.reason,
      ipAddress,
    });

    return updated;
  }
}

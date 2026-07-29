import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { scryptSync, timingSafeEqual, randomBytes } from 'node:crypto';

function verifyPassword(plain: string, stored: string): boolean {
  const [salt, storedHash] = stored.split(':');
  if (!salt || !storedHash) return false;
  const derivedHash = scryptSync(plain, salt, 64).toString('hex');
  return timingSafeEqual(Buffer.from(derivedHash), Buffer.from(storedHash));
}

function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(plain, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

@Injectable()
export class AdminProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async getProfile(adminId: string) {
    const admin = await this.prisma.adminUser.findUnique({
      where: { id: adminId },
      select: {
        id: true,
        email: true,
        status: true,
        mfaEnabled: true,
        lastLoginAt: true,
        createdAt: true,
        role: {
          select: { id: true, name: true, permissions: true },
        },
      },
    });

    if (!admin) throw new NotFoundException('Admin not found');
    return admin;
  }

  async changePassword(adminId: string, dto: ChangePasswordDto, ipAddress?: string) {
    const admin = await this.prisma.adminUser.findUnique({
      where: { id: adminId },
      select: { id: true, passwordHash: true },
    });

    if (!admin) throw new NotFoundException('Admin not found');

    if (!verifyPassword(dto.currentPassword, admin.passwordHash)) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const newHash = hashPassword(dto.newPassword);

    await this.prisma.adminUser.update({
      where: { id: adminId },
      data: { passwordHash: newHash },
    });

    // Revoke all existing refresh tokens on password change (force re-login)
    await this.prisma.refreshToken.updateMany({
      where: { adminId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await this.auditService.log({
      actorAdminId: adminId,
      action: 'admin.password_changed',
      entityType: 'AdminUser',
      entityId: adminId,
      ipAddress,
    });

    return { message: 'Password changed successfully. Please log in again.' };
  }
}

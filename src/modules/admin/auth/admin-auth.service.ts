import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/prisma/prisma.service';
import { AdminLoginDto } from './dto/admin-login.dto';
import * as bcrypt from 'bcrypt';
import { scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * Verifies a password against a stored scrypt hash (format: "salt:hash")
 * This matches the seed.ts hashing function
 */
function verifyScryptPassword(plain: string, stored: string): boolean {
  const [salt, storedHash] = stored.split(':');
  if (!salt || !storedHash) return false;
  const derivedHash = scryptSync(plain, salt, 64).toString('hex');
  return timingSafeEqual(Buffer.from(derivedHash), Buffer.from(storedHash));
}

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Validates email/password credentials and returns a JWT pair
   */
  async login(dto: AdminLoginDto) {
    const admin = await this.prisma.adminUser.findUnique({
      where: { email: dto.email },
      include: { role: true },
    });

    if (!admin) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (admin.status !== 'ACTIVE') {
      throw new UnauthorizedException('Admin account is inactive or suspended');
    }

    const passwordValid = verifyScryptPassword(dto.password, admin.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Update last login timestamp
    await this.prisma.adminUser.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });

    return this.generateTokens(admin.id, admin.email, admin.role.name);
  }

  /**
   * Rotates admin refresh token and issues a new token pair
   */
  async refreshTokens(refreshToken: string) {
    let payload: any;
    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('ADMIN_JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const savedTokens = await this.prisma.refreshToken.findMany({
      where: {
        adminId: payload.sub,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    let currentTokenRecord: (typeof savedTokens)[number] | null = null;
    for (const record of savedTokens) {
      const isMatch = await bcrypt.compare(refreshToken, record.tokenHash);
      if (isMatch) {
        currentTokenRecord = record;
        break;
      }
    }

    if (!currentTokenRecord) {
      throw new UnauthorizedException('Refresh token is invalid or has been revoked');
    }

    // Revoke used token (rotation)
    await this.prisma.refreshToken.update({
      where: { id: currentTokenRecord.id },
      data: { revokedAt: new Date() },
    });

    const admin = await this.prisma.adminUser.findUnique({
      where: { id: payload.sub },
      include: { role: true },
    });

    if (!admin) throw new NotFoundException('Admin not found');

    return this.generateTokens(admin.id, admin.email, admin.role.name);
  }

  /**
   * Revokes all active refresh tokens for the admin
   */
  async logout(adminId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { adminId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return { message: 'Logged out successfully' };
  }

  /**
   * Helper: Signs JWT pair with admin-specific secrets and persists hashed refresh token
   */
  private async generateTokens(adminId: string, email: string, role: string) {
    const payload = { sub: adminId, email, role, type: 'admin' };

    const accessExpiresIn = (this.configService.get<string>('ADMIN_JWT_ACCESS_EXPIRATION') || '15m') as any;
    const refreshExpiresIn = (this.configService.get<string>('ADMIN_JWT_REFRESH_EXPIRATION') || '8h') as any;

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('ADMIN_JWT_ACCESS_SECRET'),
      expiresIn: accessExpiresIn,
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('ADMIN_JWT_REFRESH_SECRET'),
      expiresIn: refreshExpiresIn,
    });

    const tokenHash = await bcrypt.hash(refreshToken, 10);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 8); // 8h refresh window

    await this.prisma.refreshToken.create({
      data: {
        adminId,
        tokenHash,
        expiresAt,
      },
    });

    return { accessToken, refreshToken };
  }
}

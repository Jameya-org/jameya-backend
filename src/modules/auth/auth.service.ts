import {
  Injectable,
  Inject,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/prisma/prisma.service';
import type { IOtpProvider } from './providers/otp-provider.interface';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    @Inject('OTP_PROVIDER') private otpProvider: IOtpProvider,
  ) {}

  /**
   * Determines the logical OTP purpose ('login' | 'registration') if not explicitly provided.
   */
  private async resolvePurpose(target: string, purposeInput?: string): Promise<string> {
    if (purposeInput) return purposeInput;
    const isEmail = target.includes('@');
    const existing = isEmail
      ? await this.prisma.customer.findFirst({ where: { email: target } })
      : await this.prisma.customer.findUnique({ where: { mobileNumber: target } });

    return existing ? 'login' : 'registration';
  }

  /**
   * Generates and sends a 6-digit OTP code stored securely in DB as a bcrypt hash with cooldown and expiry.
   */
  async requestOtp(target: string, purposeInput?: string) {
    if (!target) {
      throw new BadRequestException('Email or mobile number is required');
    }

    const purpose = await this.resolvePurpose(target, purposeInput);
    const now = new Date();

    // 1. Check for active resend cooldown
    const existingCooldown = await this.prisma.otpRequest.findFirst({
      where: {
        target,
        purpose,
        usedAt: null,
        cooldownUntil: { gt: now },
      },
    });

    if (existingCooldown) {
      throw new BadRequestException(
        'Please wait before requesting another OTP code (cooldown active)',
      );
    }

    // 2. Generate 6-digit OTP code & hash it
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const codeHash = await bcrypt.hash(otpCode, 10);

    const expiresAt = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes
    const cooldownUntil = new Date(now.getTime() + 60 * 1000); // 60 seconds

    // 3. Save OTP request record to DB
    await this.prisma.otpRequest.create({
      data: {
        target,
        purpose,
        codeHash,
        expiresAt,
        cooldownUntil,
        maxAttempts: 5,
      },
    });

    // 4. Dispatch via configured OTP Provider
    await this.otpProvider.sendOtp(target, otpCode);

    return { message: 'OTP verification code sent successfully', purpose };
  }

  /**
   * Verifies OTP against DB-stored hash, enforces attempt limits & purpose matching, upserts customer, and returns JWT tokens.
   */
  async verifyOtp(target: string, otp: string, purposeInput?: string) {
    if (!target) {
      throw new BadRequestException('Email or mobile number is required');
    }

    const purpose = await this.resolvePurpose(target, purposeInput);
    const now = new Date();

    // 1. Find latest active, unexpired, unused OTP record matching target + purpose
    const otpRecord = await this.prisma.otpRequest.findFirst({
      where: {
        target,
        purpose,
        usedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord) {
      throw new BadRequestException(
        'No valid or unexpired OTP found for this request. Please request a new OTP code.',
      );
    }

    // 2. Enforce max verification attempt limits
    if (otpRecord.attempts >= otpRecord.maxAttempts) {
      throw new BadRequestException(
        'OTP verification attempt limit exceeded. Please request a new OTP code.',
      );
    }

    // 3. Verify OTP hash
    const isMatch = await bcrypt.compare(otp, otpRecord.codeHash);
    if (!isMatch) {
      // Increment attempt counter on failed verification
      await this.prisma.otpRequest.update({
        where: { id: otpRecord.id },
        data: { attempts: { increment: 1 } },
      });

      throw new BadRequestException('Invalid OTP code');
    }

    // 4. Mark OTP record as used
    await this.prisma.otpRequest.update({
      where: { id: otpRecord.id },
      data: { usedAt: now },
    });

    // 5. Upsert Customer (with DB-level unique constraint handling for race conditions)
    const isEmail = target.includes('@');
    let customer = isEmail
      ? await this.prisma.customer.findFirst({ where: { email: target } })
      : await this.prisma.customer.findUnique({ where: { mobileNumber: target } });

    if (!customer) {
      try {
        customer = await this.prisma.customer.create({
          data: {
            mobileNumber: isEmail
              ? `email_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
              : target,
            email: isEmail ? target : null,
            status: 'ACTIVE',
          },
        });
      } catch (err) {
        // Fallback for concurrent insertion race condition (DB unique constraint violation P2002)
        customer = isEmail
          ? await this.prisma.customer.findFirst({ where: { email: target } })
          : await this.prisma.customer.findUnique({ where: { mobileNumber: target } });

        if (!customer) throw err;
      }
    }

    // 6. Generate Access & Refresh Token pair
    return this.generateTokens(customer.id, customer.email || customer.mobileNumber);
  }

  /**
   * Rotates tokens: Revokes old Refresh Token and issues a fresh Access + Refresh pair
   */
  async refreshTokens(refreshToken: string) {
    let payload: any;
    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // 1. Fetch active session matching customer
    const savedTokens = await this.prisma.refreshToken.findMany({
      where: {
        customerId: payload.sub,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    // 2. Find matching hashed token
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

    // 3. Revoke used Refresh Token (Token Rotation)
    await this.prisma.refreshToken.update({
      where: { id: currentTokenRecord.id },
      data: { revokedAt: new Date() },
    });

    // 4. Issue new token pair
    return this.generateTokens(payload.sub, payload.identifier || payload.mobileNumber);
  }

  /**
   * Revokes all active refresh tokens for the customer upon logout
   */
  async logout(customerId: string) {
    await this.prisma.refreshToken.updateMany({
      where: {
        customerId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return { message: 'Logged out successfully' };
  }

  /**
   * Helper: Signs JWT pair and persists hashed Refresh Token in DB
   */
  private async generateTokens(customerId: string, identifier: string) {
    const payload = { sub: customerId, identifier };

    const accessExpiresIn = (this.configService.get<string>('JWT_ACCESS_EXPIRATION') || '15m') as any;
    const refreshExpiresIn = (this.configService.get<string>('JWT_REFRESH_EXPIRATION') || '30d') as any;

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: accessExpiresIn,
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: refreshExpiresIn,
    });

    // Hash refresh token before saving to DB
    const tokenHash = await bcrypt.hash(refreshToken, 10);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 Days

    await this.prisma.refreshToken.create({
      data: {
        customerId,
        tokenHash,
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken,
    };
  }
}
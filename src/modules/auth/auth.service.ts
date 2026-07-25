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

const otpStore = new Map<string, { code: string; expiresAt: number }>();

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    @Inject('OTP_PROVIDER') private otpProvider: IOtpProvider,
  ) {}

  /**
   * Generates and sends a 6-digit OTP code to the requested email or mobile number
   */
  async requestOtp(target: string) {
    if (!target) {
      throw new BadRequestException('Email is required');
    }

    // 1. Generate 6-digit OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 Minutes Validity

    // 2. Save OTP code
    otpStore.set(target, { code: otpCode, expiresAt });

    // 3. Dispatch via configured OTP Provider
    await this.otpProvider.sendOtp(target, otpCode);

    return { message: 'OTP verification code sent successfully' };
  }

  /**
   * Verifies OTP, upserts customer, and returns JWT Access & Refresh token pair
   */
  async verifyOtp(target: string, otp: string) {
    if (!target) {
      throw new BadRequestException('Email is required');
    }

    const cachedOtp = otpStore.get(target);

    // 1. Validate OTP presence & expiration
    if (!cachedOtp) {
      throw new BadRequestException('No OTP requested for this address');
    }

    if (Date.now() > cachedOtp.expiresAt) {
      otpStore.delete(target);
      throw new BadRequestException('OTP code has expired');
    }

    if (cachedOtp.code !== otp) {
      throw new BadRequestException('Invalid OTP code');
    }

    // Clear used OTP
    otpStore.delete(target);

    // 2. Upsert Customer (Create if new, fetch if existing)
    const isEmail = target.includes('@');
    let customer = isEmail
      ? await this.prisma.customer.findFirst({ where: { email: target } })
      : await this.prisma.customer.findUnique({ where: { mobileNumber: target } });

    if (!customer) {
      customer = await this.prisma.customer.create({
        data: {
          mobileNumber: isEmail ? `email_${Date.now()}` : target,
          email: isEmail ? target : null,
          status: 'ACTIVE',
        },
      });
    }

    // 3. Generate Access Token & Refresh Token Pair
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
    } catch (e) {
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
    return this.generateTokens(payload.sub, payload.mobileNumber);
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
        revokedAt: new Date() 
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
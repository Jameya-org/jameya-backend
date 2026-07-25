import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/prisma/prisma.service';

export interface AdminJwtPayload {
  sub: string;    // AdminUser ID
  email: string;
  role: string;   // Role name for RBAC
  type: 'admin';  // Discriminator to prevent token cross-use
}

@Injectable()
export class AdminJwtStrategy extends PassportStrategy(Strategy, 'admin-jwt') {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('ADMIN_JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: AdminJwtPayload) {
    // Reject tokens that aren't explicitly typed as admin
    if (payload.type !== 'admin') {
      throw new UnauthorizedException('Invalid token type for admin access');
    }

    const admin = await this.prisma.adminUser.findUnique({
      where: { id: payload.sub },
      include: { role: true },
    });

    if (!admin || admin.status !== 'ACTIVE') {
      throw new UnauthorizedException('Admin account is inactive or does not exist');
    }

    return admin; // Attaches to req.user
  }
}

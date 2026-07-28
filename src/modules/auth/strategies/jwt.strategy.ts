import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/prisma/prisma.service';

export interface JwtPayload {
  sub: string;       // Customer or Admin ID
  mobileNumber?: string;
  role?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: payload.sub },
    });

    if (!customer || customer.status === 'BLOCKED' || customer.status === 'SUSPENDED') {
      throw new UnauthorizedException('User account is inactive or blocked');
    }

    // Return normalized shape — matches AuthenticatedRequest interface
    return {
      id: customer.id,
      email: customer.email,
      mobileNumber: customer.mobileNumber,
    };
  }
}
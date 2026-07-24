import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OtpRepository } from './otp/otp.repository';
import { OtpService } from './otp/otp.service';
import { RefreshTokenRepository } from './tokens/refresh-token.repository';
import { TokenService } from './tokens/token.service';
import { AdminJwtStrategy } from './strategies/admin-jwt.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    OtpService,
    OtpRepository,
    TokenService,
    RefreshTokenRepository,
    JwtStrategy,
    AdminJwtStrategy,
  ],
  exports: [AuthService, TokenService],
})
export class AuthModule {}

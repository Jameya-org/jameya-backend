import { Injectable } from '@nestjs/common';
import { OtpService } from './otp/otp.service';
import { TokenService } from './tokens/token.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly otpService: OtpService,
    private readonly tokenService: TokenService,
  ) {}
}

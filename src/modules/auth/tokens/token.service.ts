import { Injectable } from '@nestjs/common';
import { RefreshTokenRepository } from './refresh-token.repository';

@Injectable()
export class TokenService {
  constructor(
    private readonly refreshTokenRepository: RefreshTokenRepository,
  ) {}
}

import { Injectable } from '@nestjs/common';

@Injectable()
export class JwtStrategy {
  validate(payload: { sub: string; email?: string }) {
    return { id: payload.sub, email: payload.email };
  }
}

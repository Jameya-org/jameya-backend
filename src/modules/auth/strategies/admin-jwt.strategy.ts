import { Injectable } from '@nestjs/common';

@Injectable()
export class AdminJwtStrategy {
  validate(payload: { sub: string; roles?: string[] }) {
    return { id: payload.sub, roles: payload.roles ?? [] };
  }
}

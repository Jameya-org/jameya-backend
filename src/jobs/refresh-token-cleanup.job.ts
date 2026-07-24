import { Injectable } from '@nestjs/common';

@Injectable()
export class RefreshTokenCleanupJob {
  async run(): Promise<void> {
    // TODO: delete expired refresh tokens
  }
}

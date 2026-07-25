import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class SessionCleanupService {
  private readonly logger = new Logger(SessionCleanupService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Runs every day at 3:00 AM
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleSessionCleanup() {
    this.logger.log('🧹 Starting daily session cleanup...');

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const now = new Date();

    try {
      const result = await this.prisma.refreshToken.deleteMany({
        where: {
          OR: [
            // Delete sessions expired for more than 7 days
            {
              expiresAt: {
                lt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
              },
            },
            // Delete sessions revoked more than 30 days ago
            {
              revokedAt: {
                lt: thirtyDaysAgo,
              },
            },
          ],
        },
      });

      this.logger.log(`✅ Cleanup complete: Removed ${result.count} stale session records.`);
    } catch (error) {
      this.logger.error(`❌ Failed to clean up sessions: ${error.message}`, error.stack);
    }
  }
}
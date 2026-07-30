import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { MembershipStatus } from '@prisma/client';

@Injectable()
export class ReservationExpiryJob {
  private readonly logger = new Logger(ReservationExpiryJob.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleExpiredReservations(): Promise<void> {
    const now = new Date();

    const expiredMemberships = await this.prisma.membership.findMany({
      where: {
        status: MembershipStatus.PENDING_SIGNATURE,
        reservedUntil: {
          lt: now,
        },
      },
    });

    if (expiredMemberships.length === 0) {
      return;
    }

    this.logger.log(
      `Found ${expiredMemberships.length} expired position reservation(s). Cleaning up...`,
    );

    for (const membership of expiredMemberships) {
      try {
        await this.prisma.$transaction(async (tx) => {
          // 1. Cancel reservation
          await tx.membership.update({
            where: { id: membership.id },
            data: {
              status: MembershipStatus.CANCELLED,
              reservedUntil: null,
            },
          });

          // 2. Write AuditEvent
          await tx.auditEvent.create({
            data: {
              entityType: 'membership',
              entityId: membership.id,
              action: 'reservation_expired',
              reason: 'auto-expired, position released',
            },
          });

          // 3. Notify customer via InAppNotification
          await tx.inAppNotification.create({
            data: {
              customerId: membership.customerId,
              title: 'Reservation Expired',
              body: `Your position reservation for payout position #${membership.payoutPosition} has expired. You may restart the join flow to claim an available position.`,
            },
          });
        });

        this.logger.log(
          `Successfully expired reservation ${membership.id} (Position #${membership.payoutPosition})`,
        );
      } catch (err: any) {
        this.logger.error(
          `Failed to process expired reservation ${membership.id}: ${err.message}`,
          err.stack,
        );
      }
    }
  }
}

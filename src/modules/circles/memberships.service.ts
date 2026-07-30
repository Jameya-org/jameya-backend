import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MembershipStatus, InstallmentStatus, Prisma } from '@prisma/client';

@Injectable()
export class MembershipsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calculates the customer's current total active obligation across all circles.
   * Includes both ACTIVE memberships and PENDING_SIGNATURE memberships whose reservedUntil has not expired.
   */
  async getActiveObligationTotal(
    customerId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Prisma.Decimal> {
    const client = tx || this.prisma;
    const now = new Date();

    const activeMemberships = await client.membership.findMany({
      where: {
        customerId,
        OR: [
          { status: MembershipStatus.ACTIVE },
          {
            status: MembershipStatus.PENDING_SIGNATURE,
            reservedUntil: { gt: now },
          },
        ],
      },
      select: {
        circle: {
          select: {
            contributionAmount: true,
          },
        },
      },
    });

    let total = new Prisma.Decimal(0);
    for (const membership of activeMemberships) {
      total = total.add(membership.circle.contributionAmount);
    }

    return total;
  }

  /**
   * Checks if customer has any late / unpaid installments across all circles.
   * Returns true if there is an installment with status OVERDUE or (PENDING with dueDate < now).
   */
  async hasOverdueInstallments(
    customerId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const client = tx || this.prisma;
    const now = new Date();

    const overdueCount = await client.installment.count({
      where: {
        membership: {
          customerId,
          status: { in: [MembershipStatus.ACTIVE, MembershipStatus.PENDING_SIGNATURE] },
        },
        OR: [
          { status: InstallmentStatus.OVERDUE },
          {
            status: InstallmentStatus.PENDING,
            dueDate: { lt: now },
          },
        ],
      },
    });

    return overdueCount > 0;
  }
}

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MembershipStatus, Prisma } from '@prisma/client';

@Injectable()
export class MembershipsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calculates the customer's current total active obligation across all circles.
   * Defined as the sum of contributionAmount across all Membership rows with status = ACTIVE
   * for the given customerId.
   */
  async getActiveObligationTotal(customerId: string): Promise<Prisma.Decimal> {
    const activeMemberships = await this.prisma.membership.findMany({
      where: {
        customerId,
        status: MembershipStatus.ACTIVE,
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
}

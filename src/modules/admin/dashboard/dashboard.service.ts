import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      // KYC
      pendingReview,
      approvedToday,
      rejectedToday,
      // Customers — total + by KYC status
      totalCustomers,
      kycNotStarted,
      kycPending,
      kycUnderReview,
      kycApproved,
      kycRejected,
      // Circles
      upcomingCircles,
      inProgressCircles,
      completedCircles,
      totalMembers,
      // Fee policy
      activeFeePolicy,
    ] = await Promise.all([
      // KYC queue — customers whose KYC is UNDER_REVIEW
      this.prisma.identityProfile.count({ where: { kycStatus: 'UNDER_REVIEW' } }),
      this.prisma.identityProfile.count({
        where: { kycStatus: 'APPROVED', updatedAt: { gte: todayStart } },
      }),
      this.prisma.identityProfile.count({
        where: { kycStatus: 'REJECTED', updatedAt: { gte: todayStart } },
      }),

      // Customer counts
      this.prisma.customer.count({ where: { deletedAt: null } }),
      this.prisma.identityProfile.count({ where: { kycStatus: 'NOT_STARTED' } }),
      this.prisma.identityProfile.count({ where: { kycStatus: 'PENDING' } }),
      this.prisma.identityProfile.count({ where: { kycStatus: 'UNDER_REVIEW' } }),
      this.prisma.identityProfile.count({ where: { kycStatus: 'APPROVED' } }),
      this.prisma.identityProfile.count({ where: { kycStatus: 'REJECTED' } }),

      // Circle counts
      this.prisma.circle.count({ where: { status: 'UPCOMING' } }),
      this.prisma.circle.count({ where: { status: 'IN_PROGRESS' } }),
      this.prisma.circle.count({ where: { status: 'COMPLETED' } }),
      this.prisma.membership.count({
        where: {
          status: 'ACTIVE',
          circle: { status: 'IN_PROGRESS' },
        },
      }),

      // Active fee policy (most recent per duration)
      this.prisma.feePolicy.findFirst({
        where: { status: 'ACTIVE' },
        orderBy: { effectiveFrom: 'desc' },
        select: { version: true, effectiveFrom: true, durationMonths: true },
      }),
    ]);

    return {
      kyc: {
        pendingReview,
        approvedToday,
        rejectedToday,
      },
      customers: {
        total: totalCustomers,
        byKycStatus: {
          NOT_STARTED: kycNotStarted,
          PENDING: kycPending,
          UNDER_REVIEW: kycUnderReview,
          APPROVED: kycApproved,
          REJECTED: kycRejected,
        },
      },
      circles: {
        upcoming: upcomingCircles,
        inProgress: inProgressCircles,
        completed: completedCircles,
        totalActiveMembers: totalMembers,
      },
      feePolicy: activeFeePolicy ?? null,
    };
  }
}

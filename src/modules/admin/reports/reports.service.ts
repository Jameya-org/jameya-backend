import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { InstallmentStatus, CustomerStatus, KycStatus, Prisma } from '@prisma/client';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * ADM-13: Collections Report
   */
  async getCollectionsReport(startDate?: string, endDate?: string) {
    const whereInstallments: Prisma.InstallmentWhereInput = {};
    if (startDate || endDate) {
      whereInstallments.dueDate = {};
      if (startDate) whereInstallments.dueDate.gte = new Date(startDate);
      if (endDate) whereInstallments.dueDate.lte = new Date(endDate);
    }

    const installments = await this.prisma.installment.findMany({
      where: whereInstallments,
      select: {
        amount: true,
        status: true,
        dueDate: true,
        paidDate: true,
      },
    });

    let totalDue = new Prisma.Decimal(0);
    let totalCollected = new Prisma.Decimal(0);
    let totalOverdue = new Prisma.Decimal(0);
    let totalPending = new Prisma.Decimal(0);

    for (const inst of installments) {
      const amt = new Prisma.Decimal(inst.amount);
      totalDue = totalDue.add(amt);
      if (inst.status === InstallmentStatus.PAID) {
        totalCollected = totalCollected.add(amt);
      } else if (inst.status === InstallmentStatus.OVERDUE) {
        totalOverdue = totalOverdue.add(amt);
      } else {
        totalPending = totalPending.add(amt);
      }
    }

    const collectionRate = totalDue.gt(0)
      ? Number(totalCollected.div(totalDue).mul(100).toFixed(2))
      : 0;

    // Channel breakdown from settled transactions within the same period
    const txWhere: any = { status: 'SETTLED' };
    if (startDate || endDate) {
      txWhere.createdAt = {};
      if (startDate) txWhere.createdAt.gte = new Date(startDate);
      if (endDate) txWhere.createdAt.lte = new Date(endDate);
    }

    const transactions = await this.prisma.transaction.findMany({
      where: txWhere,
      select: { channelType: true, amount: true },
    });

    const channelTotals: Record<string, number> = {};
    for (const tx of transactions) {
      const channel = tx.channelType || 'UNKNOWN';
      channelTotals[channel] = (channelTotals[channel] || 0) + Number(tx.amount);
    }

    return {
      period: { startDate: startDate || null, endDate: endDate || null },
      totalDueAmount: totalDue.toFixed(2),
      totalCollectedAmount: totalCollected.toFixed(2),
      totalOverdueAmount: totalOverdue.toFixed(2),
      totalPendingAmount: totalPending.toFixed(2),
      collectionRatePercentage: collectionRate,
      channelBreakdown: channelTotals,
    };
  }

  /**
   * ADM-13: Customers Report
   */
  async getCustomersReport() {
    const statusCounts = await this.prisma.customer.groupBy({
      by: ['status'],
      _count: { _all: true },
    });

    const kycCounts = await this.prisma.identityProfile.groupBy({
      by: ['kycStatus'],
      _count: { _all: true },
    });

    const activeMemberships = await this.prisma.membership.findMany({
      where: { status: 'ACTIVE' },
      include: { circle: { select: { contributionAmount: true } } },
    });

    let totalActiveObligation = new Prisma.Decimal(0);
    for (const m of activeMemberships) {
      totalActiveObligation = totalActiveObligation.add(m.circle.contributionAmount);
    }

    const overdueInstallmentsCount = await this.prisma.installment.count({
      where: { status: InstallmentStatus.OVERDUE },
    });

    return {
      customerStatuses: statusCounts.reduce((acc, curr) => {
        acc[curr.status] = curr._count._all;
        return acc;
      }, {} as Record<string, number>),
      kycStatuses: kycCounts.reduce((acc, curr) => {
        acc[curr.kycStatus] = curr._count._all;
        return acc;
      }, {} as Record<string, number>),
      totalActiveMemberships: activeMemberships.length,
      totalActiveObligation: totalActiveObligation.toFixed(2),
      totalOverdueInstallments: overdueInstallmentsCount,
    };
  }

  /**
   * ADM-13: Risk & Eligibility Report
   * Only considers the most recent eligibility decision per customer.
   */
  async getRiskReport() {
    // Get only the latest decision per customer using raw groupBy trick:
    // fetch all decisions ordered by decidedAt desc, then reduce to one per customer.
    const decisions = await this.prisma.eligibilityDecision.findMany({
      select: {
        customerId: true,
        trustScore: true,
        status: true,
        overrideAdminId: true,
      },
      orderBy: { decidedAt: 'desc' },
    });

    // Deduplicate — keep only the latest decision per customer
    const latestPerCustomer = new Map<string, typeof decisions[0]>();
    for (const d of decisions) {
      if (!latestPerCustomer.has(d.customerId)) {
        latestPerCustomer.set(d.customerId, d);
      }
    }

    const latestDecisions = Array.from(latestPerCustomer.values());

    let lowRiskCount = 0;
    let mediumRiskCount = 0;
    let highRiskCount = 0;
    let overrideCount = 0;
    let scoreSum = 0;

    for (const d of latestDecisions) {
      scoreSum += d.trustScore;
      if (d.trustScore >= 75) lowRiskCount++;
      else if (d.trustScore >= 50) mediumRiskCount++;
      else highRiskCount++;

      if (d.overrideAdminId) overrideCount++;
    }

    const averageTrustScore =
      latestDecisions.length > 0
        ? Number((scoreSum / latestDecisions.length).toFixed(1))
        : 0;

    return {
      totalCustomersEvaluated: latestDecisions.length,
      averageTrustScore,
      riskTiers: {
        lowRisk: lowRiskCount,
        mediumRisk: mediumRiskCount,
        highRisk: highRiskCount,
      },
      manualOverridesCount: overrideCount,
    };
  }


  /**
   * ADM-13: Audit Activity Summary Report
   */
  async getAuditReport(startDate?: string, endDate?: string) {
    const where: Prisma.AuditEventWhereInput = {};
    if (startDate || endDate) {
      where.occurredAt = {};
      if (startDate) where.occurredAt.gte = new Date(startDate);
      if (endDate) where.occurredAt.lte = new Date(endDate);
    }

    const actionCounts = await this.prisma.auditEvent.groupBy({
      by: ['action'],
      where,
      _count: { _all: true },
    });

    const adminCounts = await this.prisma.auditEvent.groupBy({
      by: ['actorAdminId'],
      where: { ...where, actorAdminId: { not: null } },
      _count: { _all: true },
    });

    return {
      period: { startDate: startDate || null, endDate: endDate || null },
      actionsBreakdown: actionCounts.reduce((acc, curr) => {
        acc[curr.action] = curr._count._all;
        return acc;
      }, {} as Record<string, number>),
      adminActivityBreakdown: adminCounts.reduce((acc, curr) => {
        if (curr.actorAdminId) {
          acc[curr.actorAdminId] = curr._count._all;
        }
        return acc;
      }, {} as Record<string, number>),
    };
  }
}

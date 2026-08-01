import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationService } from '../../notifications/notifications.service';
import {
  PayoutStatus,
  LedgerAccount,
  NotificationType,
  Prisma,
} from '@prisma/client';

export interface GetPayoutsQuery {
  status?: string;
  search?: string;
  page?: string;
  limit?: string;
}

@Injectable()
export class AdminPayoutsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  async getPayouts(query: GetPayoutsQuery) {
    const page = query.page ? Math.max(1, parseInt(query.page, 10)) : 1;
    const limit = query.limit ? Math.max(1, parseInt(query.limit, 10)) : 10;
    const skip = (page - 1) * limit;

    const whereClause: Prisma.PayoutWhereInput = {};
    const now = new Date();

    if (query.status && query.status.trim() !== '') {
      const statusKey = query.status.trim().toUpperCase() as PayoutStatus;
      if (Object.values(PayoutStatus).includes(statusKey)) {
        whereClause.status = statusKey;
      }
    } else {
      // Default: show SCHEDULED payouts due today or earlier (scheduledAt <= now)
      whereClause.status = PayoutStatus.SCHEDULED;
      whereClause.scheduledAt = { lte: now };
    }

    if (query.search && query.search.trim() !== '') {
      const searchStr = query.search.trim();
      whereClause.membership = {
        customer: {
          OR: [
            { legalName: { contains: searchStr, mode: 'insensitive' } },
            { mobileNumber: { contains: searchStr, mode: 'insensitive' } },
          ],
        },
      };
    }

    // Calculate total count and total sum of netAmount across ALL matching payouts
    const [totalCount, agg, payouts] = await Promise.all([
      this.prisma.payout.count({ where: whereClause }),
      this.prisma.payout.aggregate({
        where: whereClause,
        _sum: {
          netAmount: true,
        },
      }),
      this.prisma.payout.findMany({
        where: whereClause,
        orderBy: { scheduledAt: 'asc' },
        skip,
        take: limit,
        include: {
          membership: {
            include: {
              customer: {
                select: {
                  id: true,
                  legalName: true,
                  mobileNumber: true,
                  email: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const totalSumNetAmount = new Prisma.Decimal(
      agg._sum.netAmount || 0,
    ).toFixed(2);

    const data = payouts.map((p) => {
      const customer = p.membership?.customer;
      return {
        id: p.id,
        membershipId: p.membershipId,
        netAmount: new Prisma.Decimal(p.netAmount).toFixed(2),
        grossAmount: new Prisma.Decimal(p.grossAmount).toFixed(2),
        feeAmount: new Prisma.Decimal(p.feeAmount).toFixed(2),
        customerName: customer?.legalName || 'N/A',
        mobileNumber: customer?.mobileNumber || 'N/A',
        customerEmail: customer?.email || null,
        payoutPosition: p.membership?.payoutPosition ?? null,
        scheduledAt: p.scheduledAt,
        disbursedAt: p.disbursedAt,
        status: p.status,
        beneficiaryToken: p.beneficiaryToken,
      };
    });

    const totalPages = Math.ceil(totalCount / limit) || 1;

    return {
      summary: {
        totalSumNetAmount,
        totalCount,
      },
      data,
      meta: {
        total: totalCount,
        page,
        limit,
        totalPages,
      },
    };
  }

  async confirmPayout(
    payoutId: string,
    adminId?: string,
    requestContext?: { ipAddress?: string; deviceInfo?: string },
  ) {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
      include: {
        membership: {
          include: {
            customer: true,
          },
        },
      },
    });

    if (!payout) {
      throw new NotFoundException(`Payout with ID ${payoutId} not found`);
    }

    // Idempotency guard: if payout is already DISBURSED, throw 409 Conflict
    if (payout.status === PayoutStatus.DISBURSED) {
      throw new ConflictException('Payout has already been disbursed');
    }

    const now = new Date();
    const grossDecimal = new Prisma.Decimal(payout.grossAmount);
    const netDecimal = new Prisma.Decimal(payout.netAmount);
    const feeDecimal = new Prisma.Decimal(payout.feeAmount);

    return await this.prisma.$transaction(async (tx) => {
      // 1. Update payout status to DISBURSED and set disbursedAt
      const updatedPayout = await tx.payout.update({
        where: { id: payoutId },
        data: {
          status: PayoutStatus.DISBURSED,
          disbursedAt: now,
        },
      });

      // 2. Post balanced double-entry LedgerEntry records
      // Debit: ESCROW_ACCOUNT (payout payable) for grossAmount
      // Credit: PAYOUT_OUTFLOW (disbursement clearing) for netAmount
      // Credit: FEE_REVENUE (platform fee revenue) for feeAmount
      await tx.ledgerEntry.createMany({
        data: [
          {
            payoutId: payout.id,
            account: LedgerAccount.ESCROW_ACCOUNT,
            debit: grossDecimal,
            credit: new Prisma.Decimal(0),
            currency: 'EGP',
            postedAt: now,
          },
          {
            payoutId: payout.id,
            account: LedgerAccount.PAYOUT_OUTFLOW,
            debit: new Prisma.Decimal(0),
            credit: netDecimal,
            currency: 'EGP',
            postedAt: now,
          },
          {
            payoutId: payout.id,
            account: LedgerAccount.FEE_REVENUE,
            debit: new Prisma.Decimal(0),
            credit: feeDecimal,
            currency: 'EGP',
            postedAt: now,
          },
        ],
      });

      // 3. Write AuditEvent
      await tx.auditEvent.create({
        data: {
          actorAdminId: adminId || null,
          action: 'disbursed',
          entityType: 'payout',
          entityId: payout.id,
          reason: null,
          ipAddress: requestContext?.ipAddress || null,
          deviceInfo: requestContext?.deviceInfo || null,
          oldValue: { status: payout.status },
          newValue: { status: PayoutStatus.DISBURSED, disbursedAt: now },
        },
      });

      // 4. Send customer notification
      if (payout.membership?.customerId) {
        await this.notificationService.notify(
          payout.membership.customerId,
          NotificationType.ACCOUNT_STATUS_CHANGED,
          {
            payoutId: payout.id,
            amount: netDecimal.toFixed(2),
            message: `Your payout of EGP ${netDecimal.toFixed(2)} has been disbursed.`,
            relatedEntityType: 'Payout',
            relatedEntityId: payout.id,
          },
        );
      }

      return {
        id: updatedPayout.id,
        membershipId: updatedPayout.membershipId,
        grossAmount: grossDecimal.toFixed(2),
        feeAmount: feeDecimal.toFixed(2),
        netAmount: netDecimal.toFixed(2),
        status: updatedPayout.status,
        scheduledAt: updatedPayout.scheduledAt,
        disbursedAt: updatedPayout.disbursedAt,
        beneficiaryToken: updatedPayout.beneficiaryToken,
      };
    });
  }
}

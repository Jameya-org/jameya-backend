import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ListCustomersQueryDto } from './dto/list-customers-query.dto';
import { UpdateCustomerStatusDto } from './dto/update-customer-status.dto';
import { Prisma, NotificationType } from '@prisma/client';
import { NotificationService } from '../../notifications/notifications.service';

@Injectable()
export class AdminCustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
  ) {}

  async listCustomers(query: ListCustomersQueryDto) {
    const { page = 1, limit = 20, status, kycStatus, search } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.CustomerWhereInput = {
      deletedAt: null,
      ...(status && { status }),
      ...(kycStatus && {
        identityProfile: { kycStatus },
      }),
      ...(search && {
        OR: [
          { legalName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { mobileNumber: { contains: search } },
        ],
      }),
    };

    const [customers, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          legalName: true,
          email: true,
          mobileNumber: true,
          status: true,
          createdAt: true,
          identityProfile: {
            select: { kycStatus: true },
          },
        },
      }),
      this.prisma.customer.count({ where }),
    ]);

    return {
      data: customers,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getCustomerById(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        identityProfile: true,
        documents: {
          orderBy: { submittedAt: 'desc' },
        },
        eligibilityDecisions: {
          orderBy: { decidedAt: 'desc' },
          take: 5,
        },
        memberships: {
          include: {
            circle: {
              select: {
                id: true,
                amount: true,
                durationMonths: true,
                status: true,
                startDate: true,
              },
            },
            installments: {
              orderBy: { dueDate: 'asc' },
              include: {
                transactions: {
                  orderBy: { createdAt: 'desc' },
                  take: 1,
                },
              },
            },
          },
          orderBy: { joinedAt: 'desc' },
        },
      },
    });

    if (!customer) throw new NotFoundException('Customer not found');

    // Aggregate installments across all memberships
    const allInstallments = customer.memberships.flatMap((m) =>
      m.installments.map((inst) => {
        const lastTx = inst.transactions[0];
        return {
          id: inst.id,
          membershipId: m.id,
          circleId: m.circleId,
          circleDurationMonths: m.circle.durationMonths,
          circleAmount: inst.amount,
          cycleNumber: inst.cycleNumber,
          dueDate: inst.dueDate,
          amount: inst.amount,
          status: inst.status,
          paidDate: inst.paidDate,
          paymentChannel: lastTx ? lastTx.channelType : null,
        };
      }),
    );

    const totalInstallments = allInstallments.length;
    const paidInstallments = allInstallments.filter((i) => i.status === 'PAID').length;
    const overdueInstallments = allInstallments.filter((i) => i.status === 'OVERDUE').length;
    const pendingInstallments = allInstallments.filter((i) => i.status === 'PENDING').length;

    // Trust Score Calculation
    const latestDecision = customer.eligibilityDecisions[0];
    const score = latestDecision ? latestDecision.trustScore : 90;

    const paymentCommitment =
      totalInstallments > 0
        ? Math.round((paidInstallments / totalInstallments) * 100)
        : 100;

    const identityVerification =
      customer.identityProfile?.kycStatus === 'APPROVED'
        ? 100
        : customer.identityProfile?.kycStatus === 'UNDER_REVIEW' ||
          customer.identityProfile?.kycStatus === 'PENDING'
        ? 50
        : 0;

    return {
      ...customer,
      trustScore: {
        score,
        paymentCommitment,
        identityVerification,
      },
      paymentsSummary: {
        total: totalInstallments,
        paid: paidInstallments,
        overdue: overdueInstallments,
        pending: pendingInstallments,
      },
      installments: allInstallments,
    };
  }

  async updateCustomerStatus(
    customerId: string,
    dto: UpdateCustomerStatusDto,
    actorAdminId: string,
    ipAddress?: string,
  ) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, status: true, legalName: true },
    });

    if (!customer) throw new NotFoundException('Customer not found');

    const updated = await this.prisma.customer.update({
      where: { id: customerId },
      data: { status: dto.status },
      select: { id: true, status: true, legalName: true, email: true, mobileNumber: true },
    });

    await this.notificationService.notify(
      customerId,
      NotificationType.ACCOUNT_STATUS_CHANGED,
      {
        status: dto.status,
        reason: dto.reason,
        relatedEntityType: 'Customer',
        relatedEntityId: customerId,
      },
    );

    await this.auditService.log({
      actorAdminId,
      action: 'customer.status_changed',
      entityType: 'Customer',
      entityId: customerId,
      oldValue: { status: customer.status },
      newValue: { status: updated.status },
      reason: dto.reason,
      ipAddress,
    });

    return updated;
  }
}

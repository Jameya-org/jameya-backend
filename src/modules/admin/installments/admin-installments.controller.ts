import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AdminJwtGuard } from '../auth/guards/admin-jwt.guard';
import { PrismaService } from '../../../prisma/prisma.service';
import { InstallmentStatus, Prisma } from '@prisma/client';

export function calculateDaysLate(dueDate: Date | string, referenceDate: Date = new Date()): number {
  const due = new Date(dueDate);
  const ref = new Date(referenceDate);
  due.setHours(0, 0, 0, 0);
  ref.setHours(0, 0, 0, 0);
  const diffTime = ref.getTime() - due.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 3600 * 24));
  return diffDays > 0 ? diffDays : 0;
}

@ApiTags('Admin - Installments')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard)
@Controller('admin/installments')
export class AdminInstallmentsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Get installments filterable by status, search, with pagination' })
  async getInstallments(
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('circleId') circleId?: string,
    @Query('customerId') customerId?: string,
    @Query('page') pageStr?: string,
    @Query('limit') limitStr?: string,
  ) {
    const page = pageStr ? Math.max(1, parseInt(pageStr, 10)) : 1;
    const limit = limitStr ? Math.max(1, parseInt(limitStr, 10)) : 10;
    const skip = (page - 1) * limit;

    const whereClause: Prisma.InstallmentWhereInput = {};

    if (status) {
      whereClause.status = status.toUpperCase() as InstallmentStatus;
    }

    const membershipWhere: Prisma.MembershipWhereInput = {};

    if (circleId) {
      membershipWhere.circleId = circleId;
    }

    if (customerId) {
      membershipWhere.customerId = customerId;
    }

    if (search && search.trim() !== '') {
      const query = search.trim();
      membershipWhere.customer = {
        OR: [
          { legalName: { contains: query, mode: 'insensitive' } },
          { mobileNumber: { contains: query, mode: 'insensitive' } },
        ],
      };
    }

    if (Object.keys(membershipWhere).length > 0) {
      whereClause.membership = membershipWhere;
    }

    const [total, installments] = await Promise.all([
      this.prisma.installment.count({ where: whereClause }),
      this.prisma.installment.findMany({
        where: whereClause,
        orderBy: { dueDate: 'asc' },
        skip,
        take: limit,
        include: {
          membership: {
            include: {
              customer: {
                select: {
                  id: true,
                  email: true,
                  legalName: true,
                  mobileNumber: true,
                },
              },
              circle: {
                select: {
                  id: true,
                  amount: true,
                  durationMonths: true,
                },
              },
            },
          },
          transactions: {
            orderBy: { createdAt: 'desc' },
          },
        },
      }),
    ]);

    const data = installments.map((inst) => ({
      id: inst.id,
      installmentId: inst.id,
      membershipId: inst.membershipId,
      customerId: inst.membership.customerId,
      customerName: inst.membership.customer?.legalName || 'N/A',
      customerEmail: inst.membership.customer?.email || null,
      mobileNumber: inst.membership.customer?.mobileNumber || 'N/A',
      customerMobile: inst.membership.customer?.mobileNumber || 'N/A',
      circleId: inst.membership.circleId,
      cycleNumber: inst.cycleNumber,
      payoutPosition: inst.membership.payoutPosition,
      dueDate: inst.dueDate,
      daysLate: calculateDaysLate(inst.dueDate),
      amount: new Prisma.Decimal(inst.amount).toFixed(2),
      status: inst.status,
      paidDate: inst.paidDate,
      retryAttempt: inst.retryAttempt,
      nextRetryAt: inst.nextRetryAt,
      attemptCount: inst.transactions.length,
    }));

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages,
      },
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get late payment installment detail by ID' })
  async getInstallmentDetail(@Param('id') id: string) {
    const installment = await this.prisma.installment.findUnique({
      where: { id },
      include: {
        membership: {
          include: {
            customer: {
              select: {
                id: true,
                email: true,
                legalName: true,
                mobileNumber: true,
              },
            },
            circle: {
              select: {
                id: true,
                amount: true,
                durationMonths: true,
              },
            },
          },
        },
        transactions: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!installment) {
      throw new NotFoundException(`Installment with ID ${id} not found`);
    }

    return {
      id: installment.id,
      amount: new Prisma.Decimal(installment.amount).toFixed(2),
      dueDate: installment.dueDate,
      daysLate: calculateDaysLate(installment.dueDate),
      status: installment.status,
      cycleNumber: installment.cycleNumber,
      paidDate: installment.paidDate,
      customer: {
        id: installment.membership.customer?.id,
        name: installment.membership.customer?.legalName || 'N/A',
        email: installment.membership.customer?.email || null,
        mobileNumber: installment.membership.customer?.mobileNumber || 'N/A',
        photo: null,
      },
      membership: {
        id: installment.membershipId,
        payoutPosition: installment.membership.payoutPosition,
        circleId: installment.membership.circleId,
      },
      transactions: installment.transactions.map((t) => ({
        id: t.id,
        amount: new Prisma.Decimal(t.amount).toFixed(2),
        status: t.status,
        createdAt: t.createdAt,
        settledAt: t.settledAt,
      })),
    };
  }
}

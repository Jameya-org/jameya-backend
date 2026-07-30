import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AdminJwtGuard } from '../auth/guards/admin-jwt.guard';
import { PrismaService } from '../../../prisma/prisma.service';
import { InstallmentStatus, Prisma } from '@prisma/client';

@ApiTags('Admin - Installments')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard)
@Controller('admin/installments')
export class AdminInstallmentsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Get installments filterable by status (e.g. status=overdue)' })
  async getInstallments(
    @Query('status') status?: string,
    @Query('circleId') circleId?: string,
    @Query('customerId') customerId?: string,
  ) {
    const whereClause: Prisma.InstallmentWhereInput = {};

    if (status) {
      whereClause.status = status.toUpperCase() as InstallmentStatus;
    }

    if (circleId) {
      whereClause.membership = { circleId };
    }

    if (customerId) {
      whereClause.membership = { ...whereClause.membership as any, customerId };
    }

    const installments = await this.prisma.installment.findMany({
      where: whereClause,
      orderBy: { dueDate: 'asc' },
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

    return installments.map((inst) => ({
      installmentId: inst.id,
      membershipId: inst.membershipId,
      customerId: inst.membership.customerId,
      customerName: inst.membership.customer.legalName || 'N/A',
      customerEmail: inst.membership.customer.email,
      customerMobile: inst.membership.customer.mobileNumber,
      circleId: inst.membership.circleId,
      cycleNumber: inst.cycleNumber,
      dueDate: inst.dueDate,
      amount: new Prisma.Decimal(inst.amount).toFixed(2),
      status: inst.status,
      paidDate: inst.paidDate,
      retryAttempt: inst.retryAttempt,
      nextRetryAt: inst.nextRetryAt,
      attemptCount: inst.transactions.length,
    }));
  }
}

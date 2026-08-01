import {
  Injectable,
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCircleDto } from './dto/create-circle.dto';
import { CircleStatus, CycleFrequency, FeePolicyStatus, Prisma } from '@prisma/client';
import { AuditService } from '../admin/audit/audit.service';

const ALLOWED_DURATIONS = [6, 10, 12];

const VALID_TRANSITIONS: Record<CircleStatus, CircleStatus[]> = {
  [CircleStatus.DRAFT]: [CircleStatus.UPCOMING, CircleStatus.CANCELLED],
  [CircleStatus.UPCOMING]: [CircleStatus.IN_PROGRESS, CircleStatus.CANCELLED],
  [CircleStatus.IN_PROGRESS]: [CircleStatus.COMPLETED, CircleStatus.CANCELLED],
  [CircleStatus.COMPLETED]: [],
  [CircleStatus.CANCELLED]: [],
};

@Injectable()
export class CirclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Creates a new circle in DRAFT status.
   * Auto-looks up the currently active FeePolicy for the specified durationMonths.
   */
  async createCircle(dto: CreateCircleDto, actorAdminId?: string) {
    // 1. Validate durationMonths (must be 6, 10, or 12)
    if (!ALLOWED_DURATIONS.includes(dto.durationMonths)) {
      throw new BadRequestException(
        `durationMonths must be one of [6, 10, 12]. Received ${dto.durationMonths}.`,
      );
    }

    // Auto-assign memberCapacity from durationMonths if omitted
    const memberCapacity = dto.memberCapacity ?? dto.durationMonths;
    // Auto-assign cycleFrequency to MONTHLY if omitted
    const cycleFrequency = dto.cycleFrequency ?? CycleFrequency.MONTHLY;

    // 2. Validate memberCapacity === durationMonths for standard monthly circles
    if (memberCapacity !== dto.durationMonths) {
      throw new BadRequestException(
        `memberCapacity (${memberCapacity}) must equal durationMonths (${dto.durationMonths}) for standard monthly circles.`,
      );
    }

    // 3. Business logic: total amount must equal contributionAmount × memberCapacity
    const expectedTotal = dto.contributionAmount * memberCapacity;
    if (Number(dto.amount) !== expectedTotal) {
      throw new BadRequestException(
        `Total amount (${dto.amount}) must equal contribution (${dto.contributionAmount}) × capacity (${memberCapacity}) = ${expectedTotal}`,
      );
    }

    // 4. Look up active fee policy for durationMonths
    const feePolicy = await this.prisma.feePolicy.findFirst({
      where: {
        durationMonths: dto.durationMonths,
        status: FeePolicyStatus.ACTIVE,
      },
      orderBy: { effectiveFrom: 'desc' },
    });

    if (!feePolicy) {
      throw new UnprocessableEntityException(
        `No active fee policy found for ${dto.durationMonths}-month duration. Circle creation rejected.`,
      );
    }

    const start = new Date(dto.startDate);
    const end = new Date(start);
    end.setMonth(end.getMonth() + dto.durationMonths);

    // 5. Create Circle record with deep-cloned feePolicySnapshot
    const circle = await this.prisma.circle.create({
      data: {
        amount: dto.amount,
        contributionAmount: dto.contributionAmount,
        durationMonths: dto.durationMonths,
        memberCapacity,
        cycleFrequency,
        startDate: start,
        endDate: end,
        status: CircleStatus.DRAFT,
        feePolicyId: feePolicy.id,
        // Snapshot the fee policy at creation time — future policy changes will never affect this circle
        feePolicySnapshot: JSON.parse(JSON.stringify(feePolicy.positionFees)),
      },
      include: {
        feePolicy: true,
      },
    });

    // 6. Audit log
    await this.auditService.log({
      actorAdminId,
      action: 'create',
      entityType: 'circle',
      entityId: circle.id,
      newValue: circle as unknown as Record<string, any>,
    });

    return this.getCircleById(circle.id);
  }

  async getAllCircles(status?: CircleStatus) {
    return this.prisma.circle.findMany({
      where: status ? { status } : {},
      include: {
        feePolicy: true,
        _count: {
          select: { memberships: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getCircleById(id: string) {
    const circle = await this.prisma.circle.findUnique({
      where: { id },
      include: {
        feePolicy: true,
        memberships: {
          include: {
            customer: {
              select: {
                id: true,
                legalName: true,
                mobileNumber: true,
                email: true,
              },
            },
            installments: {
              orderBy: { cycleNumber: 'asc' },
            },
          },
          orderBy: { payoutPosition: 'asc' },
        },
      },
    });

    if (!circle) {
      throw new NotFoundException(`Circle with ID ${id} not found`);
    }

    const circleCode = `JMY-${new Date(circle.startDate).getFullYear()}-${id.slice(0, 6).toUpperCase()}`;

    // Flatten all installments across all memberships
    const allInstallments = circle.memberships.flatMap((m) => m.installments);

    const totalValue = Number(circle.amount);
    const totalCollectedAmount = allInstallments
      .filter((inst) => inst.status === 'PAID')
      .reduce((sum, inst) => sum + Number(inst.amount), 0);

    const totalRemainingAmount = Math.max(0, totalValue - totalCollectedAmount);
    const completionPercentage =
      totalValue > 0 ? Math.min(100, Math.round((totalCollectedAmount / totalValue) * 100)) : 0;

    // Determine current active cycle number (earliest cycle with non-PAID installments, or default to 1)
    const unpaidCycleNumbers = allInstallments
      .filter((inst) => inst.status !== 'PAID')
      .map((inst) => inst.cycleNumber);

    const currentCycleNumber =
      unpaidCycleNumbers.length > 0 ? Math.min(...unpaidCycleNumbers) : 1;

    // Current month collection metrics
    const currentCycleInstallments = allInstallments.filter(
      (inst) => inst.cycleNumber === currentCycleNumber,
    );
    const currentMonthPaidInstallments = currentCycleInstallments.filter(
      (inst) => inst.status === 'PAID',
    );
    const currentMonthCollectedAmount = currentMonthPaidInstallments.reduce(
      (sum, inst) => sum + Number(inst.amount),
      0,
    );
    const currentMonthTargetAmount =
      Number(circle.contributionAmount) * circle.memberCapacity;

    // Format Members list with current cycle payment status
    const members = circle.memberships.map((m) => {
      const currentInst = m.installments.find(
        (inst) => inst.cycleNumber === currentCycleNumber,
      );
      const paidCount = m.installments.filter((inst) => inst.status === 'PAID').length;

      return {
        id: m.id,
        customerId: m.customerId,
        legalName: m.customer?.legalName || 'N/A',
        mobileNumber: m.customer?.mobileNumber || 'N/A',
        email: m.customer?.email || null,
        payoutPosition: m.payoutPosition,
        membershipStatus: m.status,
        currentCycleStatus: currentInst ? currentInst.status : 'PENDING',
        paidInstallmentsCount: paidCount,
        totalInstallmentsCount: m.installments.length,
      };
    });

    // Build Payments / Collection Rounds summary by cycle (1 to durationMonths)
    const cycles = Array.from({ length: circle.durationMonths }, (_, i) => {
      const cycleNum = i + 1;
      const cycleInsts = allInstallments.filter((inst) => inst.cycleNumber === cycleNum);

      // Determine due date from existing installments or calculate from startDate
      let dueDate: Date;
      if (cycleInsts.length > 0 && cycleInsts[0].dueDate) {
        dueDate = cycleInsts[0].dueDate;
      } else {
        dueDate = new Date(circle.startDate);
        dueDate.setMonth(dueDate.getMonth() + i);
      }

      const paidCount = cycleInsts.filter((inst) => inst.status === 'PAID').length;
      const pendingCount = cycleInsts.filter((inst) => inst.status === 'PENDING').length;
      const overdueCount = cycleInsts.filter((inst) => inst.status === 'OVERDUE').length;
      const failedCount = cycleInsts.filter((inst) => inst.status === 'FAILED').length;

      const cycleCollectedAmount = cycleInsts
        .filter((inst) => inst.status === 'PAID')
        .reduce((sum, inst) => sum + Number(inst.amount), 0);

      const cycleTotalAmount =
        cycleInsts.length > 0
          ? cycleInsts.reduce((sum, inst) => sum + Number(inst.amount), 0)
          : Number(circle.contributionAmount) * circle.memberCapacity;

      let cycleStatus: 'COMPLETED' | 'PARTIAL' | 'OVERDUE' | 'UPCOMING';
      if (paidCount > 0 && paidCount === (cycleInsts.length || circle.memberCapacity)) {
        cycleStatus = 'COMPLETED';
      } else if (overdueCount > 0 || failedCount > 0) {
        cycleStatus = 'OVERDUE';
      } else if (paidCount > 0) {
        cycleStatus = 'PARTIAL';
      } else {
        cycleStatus = 'UPCOMING';
      }

      return {
        cycleNumber: cycleNum,
        dueDate,
        status: cycleStatus,
        totalAmount: cycleTotalAmount,
        collectedAmount: cycleCollectedAmount,
        paidCount,
        pendingCount,
        overdueCount,
        failedCount,
        totalMembersCount: cycleInsts.length || circle.memberCapacity,
      };
    });

    const completedRounds = cycles.filter((c) => c.status === 'COMPLETED').length;
    const partialRounds = cycles.filter((c) => c.status === 'PARTIAL').length;
    const overdueRounds = cycles.filter((c) => c.status === 'OVERDUE').length;
    const upcomingRounds = cycles.filter((c) => c.status === 'UPCOMING').length;

    return {
      ...circle,
      circleCode,
      overview: {
        totalValue,
        collectedAmount: totalCollectedAmount,
        remainingAmount: totalRemainingAmount,
        completionPercentage,
        currentMonthGauge: {
          currentCycleNumber,
          targetAmount: currentMonthTargetAmount,
          collectedAmount: currentMonthCollectedAmount,
          paidCount: currentMonthPaidInstallments.length,
          totalMembersCount: circle.memberCapacity,
        },
      },
      formattedMembers: members,
      paymentsSummary: {
        totalRounds: circle.durationMonths,
        completedRounds,
        partialRounds,
        overdueRounds,
        upcomingRounds,
        cycles,
      },
    };
  }

  /**
   * Updates circle status with state machine transition enforcement and audit logging.
   */
  async updateCircleStatus(
    id: string,
    targetStatus: CircleStatus,
    actorAdminId?: string,
    reason?: string,
  ) {
    const circle = await this.prisma.circle.findUnique({ where: { id } });
    if (!circle) {
      throw new NotFoundException(`Circle with ID ${id} not found`);
    }

    if (circle.status === targetStatus) {
      return circle;
    }

    const allowedNextStatuses = VALID_TRANSITIONS[circle.status] || [];
    if (!allowedNextStatuses.includes(targetStatus)) {
      throw new ConflictException(
        `Invalid status transition from '${circle.status}' to '${targetStatus}'. Allowed transitions from '${circle.status}': [${allowedNextStatuses.join(', ')}]`,
      );
    }

    const updatedCircle = await this.prisma.circle.update({
      where: { id },
      data: { status: targetStatus },
    });

    await this.auditService.log({
      actorAdminId,
      action: 'update_status',
      entityType: 'circle',
      entityId: circle.id,
      oldValue: { status: circle.status },
      newValue: { status: updatedCircle.status },
      reason,
    });

    return updatedCircle;
  }

  /**
   * Controlled administrative override endpoint for core circle properties (BR-05).
   * Rejects regular silent updates when status is past DRAFT, requiring explicit reason and audit log.
   */
  async updateCircleProperties(
    id: string,
    updateData: Partial<CreateCircleDto>,
    actorAdminId?: string,
    overrideReason?: string,
  ) {
    const circle = await this.prisma.circle.findUnique({ where: { id } });
    if (!circle) {
      throw new NotFoundException(`Circle with ID ${id} not found`);
    }

    const isCorePropertyChange =
      updateData.amount !== undefined ||
      updateData.contributionAmount !== undefined ||
      updateData.durationMonths !== undefined ||
      updateData.memberCapacity !== undefined;

    if (circle.status !== CircleStatus.DRAFT && isCorePropertyChange) {
      if (!overrideReason) {
        throw new ConflictException(
          `Core circle properties cannot change once circle status is past DRAFT (${circle.status}) except through a controlled administrative exception with an audit reason (BR-05).`,
        );
      }
    }

    const dataToUpdate: Prisma.CircleUpdateInput = {};

    if (updateData.amount !== undefined) dataToUpdate.amount = updateData.amount;
    if (updateData.contributionAmount !== undefined)
      dataToUpdate.contributionAmount = updateData.contributionAmount;
    if (updateData.durationMonths !== undefined) {
      dataToUpdate.durationMonths = updateData.durationMonths;
      if (updateData.memberCapacity === undefined) {
        dataToUpdate.memberCapacity = updateData.durationMonths;
      }
    }
    if (updateData.memberCapacity !== undefined)
      dataToUpdate.memberCapacity = updateData.memberCapacity;
    if (updateData.startDate !== undefined) {
      const start = new Date(updateData.startDate);
      const duration = updateData.durationMonths ?? circle.durationMonths;
      const end = new Date(start);
      end.setMonth(end.getMonth() + duration);
      dataToUpdate.startDate = start;
      dataToUpdate.endDate = end;
    }

    const updated = await this.prisma.circle.update({
      where: { id },
      data: dataToUpdate,
    });

    await this.auditService.log({
      actorAdminId,
      action: 'admin_override_update',
      entityType: 'circle',
      entityId: id,
      oldValue: circle as unknown as Record<string, any>,
      newValue: updated as unknown as Record<string, any>,
      reason: overrideReason || 'Regular DRAFT circle update',
    });

    return updated;
  }
}
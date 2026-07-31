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
          },
        },
      },
    });

    if (!circle) {
      throw new NotFoundException(`Circle with ID ${id} not found`);
    }

    return circle;
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
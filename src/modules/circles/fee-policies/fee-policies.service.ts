import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { FeePolicyStatus, Prisma } from '@prisma/client';
import { CreateFeePolicyDto } from './dto/create-fee-policy.dto';
import { ActivateFeePolicyDto } from './dto/activate-fee-policy.dto';
import { AuditService } from '../../admin/audit/audit.service';

@Injectable()
export class FeePoliciesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Validates positionFees structure:
   * Keys must be string representations of 1..durationMonths with no missing or extra keys.
   */
  private validatePositionFees(
    durationMonths: number,
    positionFees: Record<string, number>,
  ) {
    if (!positionFees || typeof positionFees !== 'object') {
      throw new BadRequestException('positionFees must be an object');
    }

    const keys = Object.keys(positionFees);
    const expectedKeys = Array.from({ length: durationMonths }, (_, i) =>
      (i + 1).toString(),
    );

    if (keys.length !== durationMonths) {
      throw new BadRequestException(
        `positionFees must contain exactly ${durationMonths} position entries (1 to ${durationMonths}). Found ${keys.length}.`,
      );
    }

    for (const expectedKey of expectedKeys) {
      if (!(expectedKey in positionFees)) {
        throw new BadRequestException(
          `positionFees is missing payout position "${expectedKey}". Must cover positions 1 to ${durationMonths} without gaps.`,
        );
      }
      const val = positionFees[expectedKey];
      if (typeof val !== 'number' || isNaN(val)) {
        throw new BadRequestException(
          `positionFees position "${expectedKey}" must be a valid number.`,
        );
      }
    }
  }

  /**
   * Submits a new fee policy as DRAFT
   */
  async createDraft(dto: CreateFeePolicyDto, actorAdminId?: string) {
    this.validatePositionFees(dto.durationMonths, dto.positionFees);

    const policy = await this.prisma.feePolicy.create({
      data: {
        durationMonths: dto.durationMonths,
        positionFees: dto.positionFees as Prisma.InputJsonValue,
        version: dto.version,
        status: FeePolicyStatus.DRAFT,
      },
    });

    await this.auditService.log({
      actorAdminId,
      action: 'create_draft',
      entityType: 'fee_policy',
      entityId: policy.id,
      newValue: policy as unknown as Record<string, any>,
    });

    return policy;
  }

  /**
   * Activates a draft fee policy (DRAFT -> ACTIVE).
   * Transactionally retires any currently active policy for the same duration.
   */
  async activate(
    id: string,
    dto: ActivateFeePolicyDto,
    actorAdminId?: string,
  ) {
    const policy = await this.prisma.feePolicy.findUnique({ where: { id } });
    if (!policy) {
      throw new NotFoundException(`Fee policy with ID ${id} not found`);
    }

    if (policy.status === FeePolicyStatus.ACTIVE) {
      throw new BadRequestException(`Fee policy ${id} is already ACTIVE`);
    }

    if (policy.status === FeePolicyStatus.RETIRED) {
      throw new BadRequestException(
        `Fee policy ${id} is RETIRED and cannot be activated`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Find currently active policy for this durationMonths
      const currentActive = await tx.feePolicy.findFirst({
        where: {
          durationMonths: policy.durationMonths,
          status: FeePolicyStatus.ACTIVE,
        },
      });

      let retiredPolicy: any = null;
      if (currentActive) {
        retiredPolicy = await tx.feePolicy.update({
          where: { id: currentActive.id },
          data: { status: FeePolicyStatus.RETIRED },
        });

        await tx.auditEvent.create({
          data: {
            actorAdminId,
            action: 'retire',
            entityType: 'fee_policy',
            entityId: currentActive.id,
            oldValue: currentActive as unknown as Prisma.InputJsonValue,
            newValue: retiredPolicy as unknown as Prisma.InputJsonValue,
            reason: `Auto-retired upon activation of fee policy ${policy.id}`,
          },
        });
      }

      // Activate new policy
      const activatedPolicy = await tx.feePolicy.update({
        where: { id },
        data: {
          status: FeePolicyStatus.ACTIVE,
          effectiveFrom: new Date(),
        },
      });

      await tx.auditEvent.create({
        data: {
          actorAdminId,
          action: 'activate',
          entityType: 'fee_policy',
          entityId: activatedPolicy.id,
          oldValue: policy as unknown as Prisma.InputJsonValue,
          newValue: activatedPolicy as unknown as Prisma.InputJsonValue,
          reason: dto.reason,
        },
      });

      return activatedPolicy;
    });
  }

  /**
   * Returns the currently active fee policy for a given duration
   */
  async findActiveByDuration(durationMonths: number) {
    if (![6, 10, 12].includes(durationMonths)) {
      throw new BadRequestException(
        'Duration must be 6, 10, or 12 months',
      );
    }

    const policy = await this.prisma.feePolicy.findFirst({
      where: {
        durationMonths,
        status: FeePolicyStatus.ACTIVE,
      },
      orderBy: { effectiveFrom: 'desc' },
    });

    if (!policy) {
      throw new NotFoundException(
        `No active fee policy found for ${durationMonths}-month duration`,
      );
    }

    return policy;
  }

  /**
   * Returns fee policies (optionally filtered by status)
   */
  async findAll(status?: FeePolicyStatus) {
    return this.prisma.feePolicy.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Returns a single fee policy by ID
   */
  async findOne(id: string) {
    const policy = await this.prisma.feePolicy.findUnique({ where: { id } });
    if (!policy) {
      throw new NotFoundException(`Fee policy with ID ${id} not found`);
    }
    return policy;
  }
}

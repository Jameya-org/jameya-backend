import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { QueryMembershipsDto } from './dto/query-memberships.dto';
import { ReleaseMembershipDto } from './dto/release-membership.dto';
import { MembershipStatus, Prisma } from '@prisma/client';

@Injectable()
export class AdminMembershipsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List memberships with support for filtering by status (e.g. pending_signature)
   * or by usedEligibilityOverride flag per ADM-07.
   */
  async getMemberships(query: QueryMembershipsDto) {
    const where: Prisma.MembershipWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.usedEligibilityOverride !== undefined) {
      where.usedEligibilityOverride = query.usedEligibilityOverride === 'true';
    }

    const orderBy: Prisma.MembershipOrderByWithRelationInput =
      query.status === MembershipStatus.PENDING_SIGNATURE
        ? { reservedUntil: 'asc' }
        : { joinedAt: 'desc' };

    const memberships = await this.prisma.membership.findMany({
      where,
      orderBy,
      include: {
        customer: {
          select: {
            id: true,
            legalName: true,
            email: true,
            mobileNumber: true,
          },
        },
        circle: {
          select: {
            id: true,
            amount: true,
            contributionAmount: true,
            durationMonths: true,
            status: true,
          },
        },
        contract: {
          select: {
            id: true,
            docHash: true,
            signedAt: true,
          },
        },
      },
    });

    return {
      total: memberships.length,
      data: memberships,
    };
  }

  /**
   * Manual override to immediately cancel a stuck PENDING_SIGNATURE reservation before its natural expiry.
   * Requires reason (writes AuditEvent).
   */
  async releaseMembership(
    id: string,
    dto: ReleaseMembershipDto,
    adminId: string,
    ipAddress?: string,
  ) {
    const membership = await this.prisma.membership.findUnique({
      where: { id },
    });

    if (!membership) {
      throw new NotFoundException(`Membership with ID ${id} not found`);
    }

    if (membership.status !== MembershipStatus.PENDING_SIGNATURE) {
      throw new UnprocessableEntityException(
        `Cannot release membership in status "${membership.status}". Only PENDING_SIGNATURE reservations can be released.`,
      );
    }

    return await this.prisma.$transaction(async (tx) => {
      // 1. Update status to CANCELLED
      const updated = await tx.membership.update({
        where: { id },
        data: {
          status: MembershipStatus.CANCELLED,
          reservedUntil: null,
        },
      });

      // 2. Write AuditEvent
      await tx.auditEvent.create({
        data: {
          actorAdminId: adminId,
          entityType: 'membership',
          entityId: id,
          action: 'admin_released_reservation',
          reason: dto.reason,
          ipAddress,
        },
      });

      return {
        statusCode: 200,
        message: 'Membership reservation released successfully',
        membershipId: updated.id,
      };
    });
  }
}

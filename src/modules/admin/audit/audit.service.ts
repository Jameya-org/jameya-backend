import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

export interface CreateAuditEventInput {
  actorAdminId?: string;
  action: string;
  entityType: string;
  entityId: string;
  oldValue?: Record<string, any> | Prisma.InputJsonValue | null;
  newValue?: Record<string, any> | Prisma.InputJsonValue | null;
  reason?: string;
  ipAddress?: string;
  deviceInfo?: string;
  correlationId?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Appends an audit log entry to the AuditEvent table.
   * Note: AuditEvent is strictly append-only. Never update or delete audit events.
   */
  async log(input: CreateAuditEventInput) {
    return this.prisma.auditEvent.create({
      data: {
        actorAdminId: input.actorAdminId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        oldValue: input.oldValue ?? Prisma.DbNull,
        newValue: input.newValue ?? Prisma.DbNull,
        reason: input.reason,
        ipAddress: input.ipAddress,
        deviceInfo: input.deviceInfo,
        correlationId: input.correlationId,
      },
    });
  }

  /**
   * Retrieves queryable, paginated audit logs for admin review (ADM-15).
   */
  async getAuditEvents(query: any) {
    const page = Number(query.page || 1);
    const limit = Number(query.limit || 20);
    const skip = (page - 1) * limit;

    const where: Prisma.AuditEventWhereInput = {};

    if (query.actorAdminId) {
      where.actorAdminId = query.actorAdminId;
    }
    if (query.entityType) {
      where.entityType = query.entityType;
    }
    if (query.entityId) {
      where.entityId = query.entityId;
    }
    if (query.action) {
      where.action = query.action;
    }
    if (query.startDate || query.endDate) {
      where.occurredAt = {};
      if (query.startDate) {
        where.occurredAt.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        where.occurredAt.lte = new Date(query.endDate);
      }
    }

    const [total, data] = await Promise.all([
      this.prisma.auditEvent.count({ where }),
      this.prisma.auditEvent.findMany({
        where,
        orderBy: { occurredAt: 'desc' },
        skip,
        take: limit,
        include: {
          actorAdmin: {
            select: {
              id: true,
              email: true,
            },
          },
        },
      }),
    ]);

    return {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      data,
    };
  }
}



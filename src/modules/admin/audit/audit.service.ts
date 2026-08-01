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
}


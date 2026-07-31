import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CustomersRepository } from '../../customers/customers.repository';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../../notifications/notifications.service';
import { ReviewDocumentDto } from './dto/review-document.dto';
import { CreateEligibilityDto } from './dto/create-eligibility.dto';
import { KycStatus, NotificationType, Prisma } from '@prisma/client';

@Injectable()
export class KycService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customersRepo: CustomersRepository,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
  ) {}

  async getPendingDocuments() {
    return this.customersRepo.findPendingDocuments();
  }

  async reviewDocument(documentId: string, adminId: string, dto: ReviewDocumentDto) {
    const document = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!document) throw new NotFoundException('Document not found');

    const updatedDoc = await this.customersRepo.updateDocumentReview(documentId, {
      status: dto.status,
      reviewResult: dto.reviewResult || dto.reason,
      reviewerAdminId: adminId,
    });

    if (dto.status === 'REJECTED') {
      // Any rejection immediately marks the customer's KYC as REJECTED.
      await this.customersRepo.updateKycStatus(document.customerId, KycStatus.REJECTED);

      await this.notificationService.notify(
        document.customerId,
        NotificationType.DOCUMENT_REJECTED,
        {
          docType: document.docType,
          reason: dto.reason || dto.reviewResult || 'Requirements not met',
          documentId,
          relatedEntityType: 'Document',
          relatedEntityId: documentId,
        },
      );
    } else if (dto.status === 'APPROVED') {
      const [pendingCount, rejectedCount] = await Promise.all([
        this.prisma.document.count({ where: { customerId: document.customerId, status: 'PENDING' } }),
        this.prisma.document.count({ where: { customerId: document.customerId, status: 'REJECTED' } }),
      ]);

      if (pendingCount === 0 && rejectedCount === 0) {
        await this.customersRepo.updateKycStatus(document.customerId, KycStatus.APPROVED);
      }

      await this.notificationService.notify(
        document.customerId,
        NotificationType.DOCUMENT_APPROVED,
        {
          docType: document.docType,
          documentId,
          relatedEntityType: 'Document',
          relatedEntityId: documentId,
        },
      );
    }

    await this.auditService.log({
      actorAdminId: adminId,
      action: 'kyc.document.reviewed',
      entityType: 'Document',
      entityId: documentId,
      oldValue: { status: document.status },
      newValue: { status: dto.status },
      reason: dto.reason,
    });

    return updatedDoc;
  }

  async createEligibilityDecision(adminId: string, dto: CreateEligibilityDto) {
    const customer = await this.customersRepo.findById(dto.customerId);
    if (!customer) throw new NotFoundException('Customer not found');

    const decision = await this.prisma.eligibilityDecision.create({
      data: {
        customerId: dto.customerId,
        trustScore: dto.trustScore ?? 500, // Default neutral baseline for MVP
        participationLimit: new Prisma.Decimal(dto.participationLimit),
        reasonCodes: ['MANUAL_ADMIN_APPROVAL'],
        policyVersion: dto.policyVersion,
        inputsSnapshot: { reviewedByAdminId: adminId, setAt: new Date() } as Prisma.InputJsonValue,
        status: dto.status,
        expiresAt: new Date(dto.expiresAt),
        overrideAdminId: adminId,
      },
    });

    await this.notificationService.notify(
      dto.customerId,
      NotificationType.ELIGIBILITY_DECIDED,
      {
        status: dto.status,
        participationLimit: dto.participationLimit,
        decisionId: decision.id,
        relatedEntityType: 'EligibilityDecision',
        relatedEntityId: decision.id,
      },
    );

    await this.auditService.log({
      actorAdminId: adminId,
      action: 'kyc.eligibility.override',
      entityType: 'EligibilityDecision',
      entityId: decision.id,
      newValue: {
        customerId: dto.customerId,
        status: dto.status,
        participationLimit: dto.participationLimit,
      },
      reason: dto.reason,
    });

    return decision;
  }
}
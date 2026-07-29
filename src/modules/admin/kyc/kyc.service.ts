import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CustomersRepository } from 'src/modules/customers/customers.repository';
import { AuditService } from '../audit/audit.service';
import { ReviewDocumentDto } from './dto/review-document.dto';
import { CreateEligibilityDto } from './dto/create-eligibility.dto';
import { KycStatus, Prisma } from '@prisma/client';

@Injectable()
export class KycService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customersRepo: CustomersRepository,
    private readonly auditService: AuditService,
  ) {}

  async getPendingDocuments() {
    return this.customersRepo.findPendingDocuments();
  }

  async reviewDocument(documentId: string, adminId: string, dto: ReviewDocumentDto) {
    const document = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!document) throw new NotFoundException('Document not found');

    const updatedDoc = await this.customersRepo.updateDocumentReview(documentId, {
      status: dto.status,
      reviewResult: dto.reviewResult,
      reviewerAdminId: adminId,
    });

    if (dto.status === 'REJECTED') {
      // Any rejection immediately marks the customer's KYC as REJECTED.
      // They must resubmit via POST /customers/kyc/submit after fixing their documents.
      await this.customersRepo.updateKycStatus(document.customerId, KycStatus.REJECTED);
    } else if (dto.status === 'APPROVED') {
      const [pendingCount, rejectedCount] = await Promise.all([
        this.prisma.document.count({ where: { customerId: document.customerId, status: 'PENDING' } }),
        this.prisma.document.count({ where: { customerId: document.customerId, status: 'REJECTED' } }),
      ]);

      if (pendingCount === 0 && rejectedCount === 0) {
        await this.customersRepo.updateKycStatus(document.customerId, KycStatus.APPROVED);
      }
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
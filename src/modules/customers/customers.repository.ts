import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { 
  Customer, 
  IdentityProfile, 
  Document, 
  EligibilityDecision, 
  KycStatus, 
  DocumentStatus,
  DocumentType,
  Prisma 
} from '@prisma/client';

@Injectable()
export class CustomersRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ==========================================
  // CUSTOMER READ / WRITE
  // ==========================================

  async findById(id: string): Promise<Customer | null> {
    return this.prisma.customer.findUnique({
      where: { id },
    });
  }

  async findByMobile(mobileNumber: string): Promise<Customer | null> {
    return this.prisma.customer.findUnique({
      where: { mobileNumber },
    });
  }

  async findByEmail(email: string): Promise<Customer | null> {
    return this.prisma.customer.findFirst({
      where: { email },
    });
  }

  async updateLegalName(id: string, legalName: string): Promise<Customer> {
    return this.prisma.customer.update({
      where: { id },
      data: { legalName },
    });
  }

  // ==========================================
  // IDENTITY PROFILE (KYC)
  // ==========================================

  async findIdentityProfileByCustomerId(customerId: string): Promise<IdentityProfile | null> {
    return this.prisma.identityProfile.findUnique({
      where: { customerId },
    });
  }

  async upsertIdentityProfile(
    customerId: string,
    data: {
      dateOfBirth: Date;
      nationalIdentifierToken: string;
      address: Prisma.InputJsonValue;
      kycStatus?: KycStatus;
    },
  ): Promise<IdentityProfile> {
    return this.prisma.identityProfile.upsert({
      where: { customerId },
      create: {
        customerId,
        dateOfBirth: data.dateOfBirth,
        nationalIdentifierToken: data.nationalIdentifierToken,
        address: data.address,
        kycStatus: data.kycStatus ?? KycStatus.PENDING,
      },
      update: {
        dateOfBirth: data.dateOfBirth,
        nationalIdentifierToken: data.nationalIdentifierToken,
        address: data.address,
        // Only write kycStatus on update when the caller explicitly provides it.
        // Defaulting to PENDING here would silently downgrade APPROVED profiles.
        ...(data.kycStatus !== undefined && { kycStatus: data.kycStatus }),
      },
    });
  }

  async updateKycStatus(customerId: string, kycStatus: KycStatus): Promise<IdentityProfile> {
    return this.prisma.identityProfile.update({
      where: { customerId },
      data: { kycStatus },
    });
  }

  // ==========================================
  // DOCUMENTS
  // ==========================================

  async upsertDocument(data: {
    customerId: string;
    docType: DocumentType;
    encryptedObjectRef: string;
    issueDate?: Date | null;
    expiryDate?: Date | null;
  }): Promise<Document> {
    return this.prisma.document.create({
      data: {
        customerId: data.customerId,
        docType: data.docType,
        encryptedObjectRef: data.encryptedObjectRef,
        issueDate: data.issueDate,
        expiryDate: data.expiryDate,
        status: DocumentStatus.PENDING,
      },
    });
  }

  async findDocumentsByCustomerId(customerId: string): Promise<Document[]> {
    return this.prisma.document.findMany({
      where: { customerId },
      orderBy: { submittedAt: 'desc' },
    });
  }

  async findPendingDocuments(): Promise<Document[]> {
    return this.prisma.document.findMany({
      where: {
        status: DocumentStatus.PENDING,
        customer: {
          identityProfile: {
            kycStatus: KycStatus.UNDER_REVIEW,
          },
        },
      },
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
      orderBy: { submittedAt: 'asc' },
    });
  }

  async updateDocumentReview(
    documentId: string,
    data: {
      status: DocumentStatus;
      reviewResult?: string;
      reviewerAdminId: string;
    },
  ): Promise<Document> {
    return this.prisma.document.update({
      where: { id: documentId },
      data: {
        status: data.status,
        reviewResult: data.reviewResult,
        reviewerAdminId: data.reviewerAdminId,
        reviewedAt: new Date(),
      },
    });
  }

  // ==========================================
  // AGGREGATED FULL PROFILE (For Status Check)
  // ==========================================

  async getFullCustomerKycState(customerId: string) {
    return this.prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        legalName: true,
        mobileNumber: true,
        email: true,
        status: true,
        identityProfile: true,
        documents: {
          orderBy: { submittedAt: 'desc' },
        },
        eligibilityDecisions: {
          orderBy: { decidedAt: 'desc' },
          take: 1,
        },
      },
    });
  }
}
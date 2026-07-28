import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CustomersRepository } from './customers.repository';
import { CreateIdentityProfileDto } from './dto/create-identity-profile.dto';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { KycStatus, DocumentType, Prisma } from '@prisma/client';

// Document types that satisfy the identity requirement
const IDENTITY_DOC_TYPES: DocumentType[] = [DocumentType.NATIONAL_ID, DocumentType.PASSPORT];

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: CustomersRepository,
  ) {}

  async createOrUpdateProfile(customerId: string, dto: CreateIdentityProfileDto) {
    const dob = new Date(dto.dateOfBirth);

    // Run both writes atomically. The customer.update will throw P2025
    // (record not found) if the customer doesn't exist, eliminating the
    // TOCTOU race that a pre-transaction findUnique check would introduce.
    return this.prisma.$transaction(async (tx) => {
      // Update customer legal name — throws if customer doesn't exist
      const customer = await tx.customer.update({
        where: { id: customerId },
        data: { legalName: dto.legalName },
        include: { identityProfile: true },
      }).catch((e) => {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
          throw new NotFoundException('Customer not found');
        }
        throw e;
      });

      const existingStatus = customer.identityProfile?.kycStatus;

      // Only reset to PENDING if NOT_STARTED or PENDING — never downgrade
      // UNDER_REVIEW, APPROVED, or REJECTED (those are admin-controlled states).
      const shouldResetToPending =
        !existingStatus ||
        existingStatus === KycStatus.NOT_STARTED ||
        existingStatus === KycStatus.PENDING;

      const profile = await tx.identityProfile.upsert({
        where: { customerId },
        create: {
          customerId,
          dateOfBirth: dob,
          nationalIdentifierToken: dto.nationalIdentifierToken,
          address: dto.address as unknown as Prisma.InputJsonValue,
          kycStatus: KycStatus.PENDING,
        },
        update: {
          dateOfBirth: dob,
          nationalIdentifierToken: dto.nationalIdentifierToken,
          address: dto.address as unknown as Prisma.InputJsonValue,
          ...(shouldResetToPending ? { kycStatus: KycStatus.PENDING } : {}),
        },
      });

      return profile;
    });
  }

  async uploadDocument(customerId: string, dto: UploadDocumentDto) {
    const customer = await this.repo.findById(customerId);
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return this.repo.createDocument({
      customerId,
      docType: dto.docType,
      encryptedObjectRef: dto.encryptedObjectRef,
      issueDate: dto.issueDate ? new Date(dto.issueDate) : null,
      expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
    });
  }

  /**
   * Transitions customer KYC from PENDING or REJECTED → UNDER_REVIEW.
   *
   * Required documents before submission:
   *   - 1 identity doc: NATIONAL_ID or PASSPORT
   *   - 1 income doc:   PROOF_OF_INCOME
   *
   * Optional (supplementary): UTILITY_BILL, CAR_LICENSE, SYNDICATE_ID
   */
  async submitKycForReview(customerId: string) {
    const customer = await this.repo.getFullCustomerKycState(customerId);
    if (!customer) throw new NotFoundException('Customer not found');

    const kycStatus = customer.identityProfile?.kycStatus;

    if (!kycStatus || kycStatus === KycStatus.NOT_STARTED) {
      throw new BadRequestException(
        'Please complete your identity profile before submitting for review.',
      );
    }

    if (kycStatus === KycStatus.UNDER_REVIEW) {
      throw new ConflictException('Your KYC submission is already under review.');
    }

    if (kycStatus === KycStatus.APPROVED) {
      throw new ConflictException('Your KYC has already been approved.');
    }

    // Allowed transitions: PENDING (first time) or REJECTED (resubmission after fix)
    const uploadedDocTypes = customer.documents.map((d) => d.docType);

    const hasIdentityDoc = IDENTITY_DOC_TYPES.some((t) => uploadedDocTypes.includes(t));
    if (!hasIdentityDoc) {
      throw new BadRequestException(
        'An identity document is required before submitting (National ID or Passport).',
      );
    }

    const hasIncomeDoc = uploadedDocTypes.includes(DocumentType.PROOF_OF_INCOME);
    if (!hasIncomeDoc) {
      throw new BadRequestException(
        'A proof of income document is required before submitting (PROOF_OF_INCOME).',
      );
    }

    await this.repo.updateKycStatus(customerId, KycStatus.UNDER_REVIEW);

    return {
      message:
        'Your documents have been submitted for review. We will notify you once the review is complete.',
      kycStatus: KycStatus.UNDER_REVIEW,
    };
  }

  async getMyKycStatus(customerId: string) {
    const customer = await this.repo.getFullCustomerKycState(customerId);

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return {
      legalName: customer.legalName,
      kycStatus: customer.identityProfile?.kycStatus ?? KycStatus.NOT_STARTED,
      identityProfile: customer.identityProfile,
      documents: customer.documents,
      latestEligibility: customer.eligibilityDecisions[0] ?? null,
    };
  }
}
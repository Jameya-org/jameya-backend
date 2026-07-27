import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CustomersRepository } from './customers.repository';
import { CreateIdentityProfileDto } from './dto/create-identity-profile.dto';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { KycStatus, Prisma } from '@prisma/client';

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

      // Preserve existing kycStatus on re-submission — only set PENDING on first create.
      // This prevents a profile update (e.g., fixing an address) from silently
      // downgrading a previously APPROVED customer back to PENDING.
      const existingStatus = customer.identityProfile?.kycStatus;

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
          // Only reset to PENDING if the profile was NOT_STARTED or already PENDING.
          // APPROVED / REJECTED statuses are preserved and must be changed via
          // a dedicated admin review action.
          ...((!existingStatus || existingStatus === KycStatus.NOT_STARTED)
            ? { kycStatus: KycStatus.PENDING }
            : {}),
        },
      });

      return profile;
    });
  }

  async uploadDocument(customerId: string, dto: UploadDocumentDto) {
    // Verify customer exists via repository (single source of truth)
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

  async getMyKycStatus(customerId: string) {
    // Delegate to repository — single source of truth for this aggregated query
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
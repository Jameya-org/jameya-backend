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
      // Update customer legal name and mobileNumber — throws if customer doesn't exist
      const customer = await tx.customer.update({
        where: { id: customerId },
        data: {
          legalName: dto.legalName,
          mobileNumber: dto.mobileNumber,
        },
        include: { identityProfile: true },
      }).catch((e) => {
        if (e instanceof Prisma.PrismaClientKnownRequestError) {
          if (e.code === 'P2025') {
            throw new NotFoundException('Customer not found');
          }
          if (e.code === 'P2002') {
            throw new ConflictException('Mobile number is already registered to another account');
          }
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
          nationalIdentifierToken: dto.nationalIdNumber,
          address: dto.address as unknown as Prisma.InputJsonValue,
          kycStatus: KycStatus.PENDING,
        },
        update: {
          dateOfBirth: dob,
          nationalIdentifierToken: dto.nationalIdNumber,
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

    return this.repo.upsertDocument({
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

  async getProfile(customerId: string) {
    const customer = await this.repo.findById(customerId);

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return {
      id: customer.id,
      legalName: customer.legalName,
      email: customer.email,
      mobileNumber: customer.mobileNumber,
      status: customer.status,
      locale: customer.locale,
      createdAt: customer.createdAt,
    };
  }

  /**
   * GET /customer/history
   * Unified customer dashboard & historical activity feed.
   */
  async getCustomerHistory(customerId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        eligibilityDecisions: {
          orderBy: { decidedAt: 'desc' },
          take: 1,
        },
        memberships: {
          include: {
            circle: true,
            installments: {
              orderBy: { cycleNumber: 'asc' },
            },
            payout: true,
            contract: true,
          },
        },
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const latestEligibility = customer.eligibilityDecisions[0];
    const participationLimit = latestEligibility
      ? new Prisma.Decimal(latestEligibility.participationLimit).toFixed(2)
      : '0.00';

    let activeObligationTotal = new Prisma.Decimal(0);
    let overdueCount = 0;
    let nextDueInstallment: any = null;
    let earliestDueDate: Date | null = null;
    let nextPayoutDate: any = null;
    let earliestPayoutDate: Date | null = null;

    const timeline: any[] = [];
    const activeCircles: any[] = [];

    for (const m of customer.memberships) {
      const circleContribution = new Prisma.Decimal(m.circle.contributionAmount);

      if (m.status === 'ACTIVE') {
        activeObligationTotal = activeObligationTotal.add(circleContribution);
        const startMonth = new Date(m.circle.startDate).getMonth() + 1;

        activeCircles.push({
          membershipId: m.id,
          circleId: m.circleId,
          title: `جمعية شهر ${startMonth}`,
          payoutPosition: m.payoutPosition,
          monthlyContribution: circleContribution.toFixed(2),
          durationMonths: m.circle.durationMonths,
          status: m.status,
        });
      }

      // Process Installments
      for (const inst of m.installments) {
        const instAmt = new Prisma.Decimal(inst.amount).toFixed(2);
        const circleTitle = `جمعية شهر ${new Date(m.circle.startDate).getMonth() + 1}`;

        if (inst.status === 'OVERDUE') {
          overdueCount++;
          timeline.push({
            type: 'INSTALLMENT_OVERDUE',
            title: 'قسط متأخر',
            circleTitle,
            cycleNumber: inst.cycleNumber,
            amount: instAmt,
            date: inst.dueDate,
          });
        } else if (inst.status === 'PAID') {
          timeline.push({
            type: 'INSTALLMENT_PAID',
            title: 'تم دفع القسط',
            circleTitle,
            cycleNumber: inst.cycleNumber,
            amount: instAmt,
            date: inst.paidDate || inst.dueDate,
          });
        } else if (inst.status === 'PENDING' && m.status === 'ACTIVE') {
          const instDueDate = new Date(inst.dueDate);
          if (!earliestDueDate || instDueDate < earliestDueDate) {
            earliestDueDate = instDueDate;
            nextDueInstallment = {
              installmentId: inst.id,
              circleTitle,
              amount: instAmt,
              dueDate: inst.dueDate,
            };
          }
        }
      }

      // Process Payout
      if (m.payout) {
        const payoutAmt = new Prisma.Decimal(m.payout.netAmount).toFixed(2);
        const circleTitle = `جمعية شهر ${new Date(m.circle.startDate).getMonth() + 1}`;

        if (m.payout.status === 'DISBURSED') {
          timeline.push({
            type: 'PAYOUT_DISBURSED',
            title: 'تم استلام قبض الجمعية',
            circleTitle,
            amount: payoutAmt,
            date: m.payout.disbursedAt || m.payout.scheduledAt,
          });
        } else if (m.payout.status === 'SCHEDULED' || m.payout.status === 'PROCESSING') {
          const pDate = new Date(m.payout.scheduledAt);
          if (!earliestPayoutDate || pDate < earliestPayoutDate) {
            earliestPayoutDate = pDate;
            nextPayoutDate = {
              payoutId: m.payout.id,
              circleTitle,
              netAmount: payoutAmt,
              scheduledAt: m.payout.scheduledAt,
            };
          }
        }
      }

      // Process Contract
      if (m.contract) {
        timeline.push({
          type: 'CONTRACT_SIGNED',
          title: 'تم توقيع العقد',
          circleTitle: `جمعية شهر ${new Date(m.circle.startDate).getMonth() + 1}`,
          docHash: m.contract.docHash,
          date: m.contract.signedAt,
        });
      }
    }

    // Sort timeline descending by date
    timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return {
      summary: {
        activeObligationTotal: activeObligationTotal.toFixed(2),
        participationLimit,
        overdueCount,
        nextDueInstallment,
        nextPayoutDate,
      },
      activeCircles,
      timeline,
    };
  }
}
import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
  ConflictException,
  GoneException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MembershipsService } from './memberships.service';
import { FeeCalculatorService } from './fee-calculator.service';
import { ContractsService } from '../contracts/contracts.service';
import { AuthService } from '../auth/auth.service';
import { PaymentMethodsService } from '../payments/payment-methods.service';
import { BrowseCirclesQueryDto } from './dto/browse-circles-query.dto';
import { StartJoinDto } from './dto/start-join.dto';
import { AcceptContractDto } from './dto/accept-contract.dto';
import { VerifySignatureOtpDto } from './dto/verify-signature-otp.dto';
import { mapToPublicMemberView } from './dto/public-member-view.dto';
import {
  CircleStatus,
  EligibilityStatus,
  DocumentType,
  MembershipStatus,
  InstallmentStatus,
  PayoutStatus,
  Prisma,
} from '@prisma/client';

const IDENTITY_DOC_TYPES: DocumentType[] = [
  DocumentType.NATIONAL_ID,
  DocumentType.PASSPORT,
];

export interface EligibilityCheckResult {
  isEligible: boolean;
  missingSteps: string[];
  latestDecision?: any;
}

@Injectable()
export class CustomerCirclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly membershipsService: MembershipsService,
    private readonly feeCalculatorService: FeeCalculatorService,
    private readonly contractsService: ContractsService,
    private readonly authService: AuthService,
    private readonly paymentMethodsService: PaymentMethodsService,
  ) {}

  /**
   * Helper to evaluate customer eligibility decision and missing KYC steps.
   */
  async evaluateCustomerEligibility(
    customerId: string,
  ): Promise<EligibilityCheckResult> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        identityProfile: true,
        documents: true,
        eligibilityDecisions: {
          orderBy: { decidedAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const missingSteps: string[] = [];

    // Check identity verification
    const hasIdentityProfile =
      customer.identityProfile &&
      customer.identityProfile.kycStatus !== 'NOT_STARTED';
    const uploadedDocTypes = customer.documents.map((d) => d.docType);
    const hasIdentityDoc = IDENTITY_DOC_TYPES.some((t) =>
      uploadedDocTypes.includes(t),
    );

    if (!hasIdentityProfile || !hasIdentityDoc) {
      missingSteps.push('identity_verification');
    }

    // Check proof of income
    const hasIncomeDoc = uploadedDocTypes.includes(
      DocumentType.PROOF_OF_INCOME,
    );
    if (!hasIncomeDoc) {
      missingSteps.push('proof_of_income');
    }

    // Check active approved eligibility decision
    const latestDecision = customer.eligibilityDecisions[0];
    const now = new Date();
    const isApprovedDecision =
      latestDecision &&
      (latestDecision.status === EligibilityStatus.ELIGIBLE ||
        (latestDecision.status as any) === 'APPROVED') &&
      new Date(latestDecision.expiresAt) > now;

    if (!isApprovedDecision) {
      missingSteps.push('eligibility_decision');
    }

    const isEligible = isApprovedDecision && missingSteps.length === 0;

    return {
      isEligible,
      missingSteps,
      latestDecision: isApprovedDecision ? latestDecision : null,
    };
  }

  /**
   * Endpoint 1: Browse (unfiltered)
   * GET /customer/circles
   */
  async browseCircles(query: BrowseCirclesQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const where: Prisma.CircleWhereInput = {
      status: CircleStatus.UPCOMING,
    };

    if (query.durationMonths) {
      where.durationMonths = Number(query.durationMonths);
    }

    if (query.minAmount !== undefined || query.maxAmount !== undefined) {
      where.amount = {};
      if (query.minAmount !== undefined) {
        where.amount.gte = new Prisma.Decimal(query.minAmount);
      }
      if (query.maxAmount !== undefined) {
        where.amount.lte = new Prisma.Decimal(query.maxAmount);
      }
    }

    const allUpcoming = await this.prisma.circle.findMany({
      where,
      orderBy: { startDate: 'asc' },
    });

    // Filter available capacity (currentMembersCount < memberCapacity)
    const availableCircles = allUpcoming.filter(
      (c) => c.currentMembersCount < c.memberCapacity,
    );

    const total = availableCircles.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const paginated = availableCircles.slice((page - 1) * limit, page * limit);

    const data = paginated.map((c) => ({
      id: c.id,
      amount: c.amount,
      contributionAmount: c.contributionAmount,
      durationMonths: c.durationMonths,
      cycleFrequency: c.cycleFrequency,
      memberCapacity: c.memberCapacity,
      currentMembersCount: c.currentMembersCount,
      startDate: c.startDate,
      status: c.status,
    }));

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages,
      },
    };
  }

  /**
   * Endpoint 2: Circle detail
   * GET /customer/circles/:id
   */
  async getCircleDetail(circleId: string, requestingCustomerId: string) {
    const circle = await this.prisma.circle.findUnique({
      where: { id: circleId },
      include: {
        memberships: {
          include: {
            customer: {
              select: {
                id: true,
                legalName: true,
              },
            },
            installments: true,
          },
        },
      },
    });

    if (!circle) {
      throw new NotFoundException(`Circle with ID ${circleId} not found`);
    }

    const maskedMembers = circle.memberships.map((m) =>
      mapToPublicMemberView(m, requestingCustomerId),
    );

    return {
      id: circle.id,
      amount: circle.amount,
      contributionAmount: circle.contributionAmount,
      durationMonths: circle.durationMonths,
      cycleFrequency: circle.cycleFrequency,
      memberCapacity: circle.memberCapacity,
      currentMembersCount: circle.currentMembersCount,
      startDate: circle.startDate,
      endDate: circle.endDate,
      status: circle.status,
      feePolicyId: circle.feePolicyId,
      memberships: maskedMembers,
    };
  }

  /**
   * Endpoint 3: Home / recommendations
   * GET /customer/home
   */
  async getHomeRecommendations(customerId: string) {
    const eligibilityCheck = await this.evaluateCustomerEligibility(customerId);

    if (!eligibilityCheck.isEligible || !eligibilityCheck.latestDecision) {
      return {
        eligible: false,
        reason: 'eligibility_incomplete',
        missingSteps: eligibilityCheck.missingSteps,
      };
    }

    const participationLimit = new Prisma.Decimal(
      eligibilityCheck.latestDecision.participationLimit,
    );

    // Calculate customer active obligations
    const currentObligation =
      await this.membershipsService.getActiveObligationTotal(customerId);

    // Fetch customer's existing memberships
    const existingMemberships = await this.prisma.membership.findMany({
      where: { customerId },
      select: {
        circleId: true,
        status: true,
        circle: {
          select: { id: true },
        },
        installments: {
          where: {
            status: { in: [InstallmentStatus.PENDING, InstallmentStatus.OVERDUE] },
          },
          orderBy: { dueDate: 'asc' },
          take: 1,
        },
        payout: true,
      },
    });

    const joinedCircleIds = new Set(existingMemberships.map((m) => m.circleId));

    // Fetch open circles
    const openCircles = await this.prisma.circle.findMany({
      where: { status: CircleStatus.UPCOMING },
      orderBy: { startDate: 'asc' },
    });

    const recommendedCircles = openCircles
      .filter((c) => c.currentMembersCount < c.memberCapacity)
      .filter((c) => !joinedCircleIds.has(c.id))
      .filter((c) => {
        const potentialTotal = currentObligation.add(c.contributionAmount);
        return potentialTotal.lte(participationLimit);
      })
      .map((c) => ({
        id: c.id,
        amount: c.amount,
        contributionAmount: c.contributionAmount,
        durationMonths: c.durationMonths,
        cycleFrequency: c.cycleFrequency,
        memberCapacity: c.memberCapacity,
        currentMembersCount: c.currentMembersCount,
        startDate: c.startDate,
        status: c.status,
      }));

    // Calculate dashboard aggregate
    const activeMemberships = existingMemberships.filter(
      (m) => m.status === MembershipStatus.ACTIVE,
    );

    // Find next due installment across active memberships
    let nextDueInstallment: any = null;
    let earliestDueDate: Date | null = null;

    for (const m of activeMemberships) {
      if (m.installments && m.installments.length > 0) {
        const inst = m.installments[0];
        const instDueDate = new Date(inst.dueDate);
        if (!earliestDueDate || instDueDate < earliestDueDate) {
          earliestDueDate = instDueDate;
          nextDueInstallment = {
            installmentId: inst.id,
            circleId: m.circleId,
            amount: inst.amount,
            dueDate: inst.dueDate,
            status: inst.status,
          };
        }
      }
    }

    // Find next payout date across active memberships
    let nextPayoutDate: any = null;
    let earliestPayoutDate: Date | null = null;

    for (const m of activeMemberships) {
      if (
        m.payout &&
        (m.payout.status === PayoutStatus.SCHEDULED ||
          m.payout.status === PayoutStatus.PROCESSING)
      ) {
        const pDate = new Date(m.payout.scheduledAt);
        if (!earliestPayoutDate || pDate < earliestPayoutDate) {
          earliestPayoutDate = pDate;
          nextPayoutDate = {
            payoutId: m.payout.id,
            circleId: m.circleId,
            netAmount: m.payout.netAmount,
            scheduledAt: m.payout.scheduledAt,
          };
        }
      }
    }

    return {
      eligible: true,
      recommendedCircles,
      dashboard: {
        activeCircleCount: activeMemberships.length,
        currentTotalObligation: currentObligation.toFixed(2),
        participationLimit: participationLimit.toFixed(2),
        nextDueInstallment,
        nextPayoutDate,
      },
    };
  }

  /**
   * Endpoint 4: Join-intent pre-check
   * POST /customer/circles/:id/join-intent
   */
  async checkJoinIntent(circleId: string, customerId: string) {
    // 1. Check eligibility decision
    const eligibilityCheck = await this.evaluateCustomerEligibility(customerId);
    if (!eligibilityCheck.isEligible || !eligibilityCheck.latestDecision) {
      throw new UnprocessableEntityException({
        reason: 'eligibility_incomplete',
        missingSteps: eligibilityCheck.missingSteps,
      });
    }

    // 2. Check for overdue installments in another circle
    const hasOverdue = await this.membershipsService.hasOverdueInstallments(customerId);
    if (hasOverdue) {
      throw new UnprocessableEntityException({
        reason: 'has_overdue_installment',
        message: 'You have unpaid overdue installments in another circle.',
      });
    }

    // 3. Check circle existence & capacity
    const circle = await this.prisma.circle.findUnique({
      where: { id: circleId },
    });

    if (!circle) {
      throw new NotFoundException(`Circle with ID ${circleId} not found`);
    }

    if (
      circle.status !== CircleStatus.UPCOMING ||
      circle.currentMembersCount >= circle.memberCapacity
    ) {
      throw new UnprocessableEntityException({
        reason: 'circle_full',
      });
    }

    // 4. Check if customer is already a member of this circle
    const existingMembership = await this.prisma.membership.findFirst({
      where: {
        circleId,
        customerId,
        status: { in: [MembershipStatus.ACTIVE, MembershipStatus.PENDING_SIGNATURE] },
      },
    });

    if (existingMembership) {
      if (
        existingMembership.status === MembershipStatus.ACTIVE ||
        (existingMembership.reservedUntil && new Date(existingMembership.reservedUntil) > new Date())
      ) {
        throw new UnprocessableEntityException({
          reason: 'already_member',
        });
      }
    }

    // 5. Check total active obligation against participation limit
    const currentObligation =
      await this.membershipsService.getActiveObligationTotal(customerId);

    const participationLimit = new Prisma.Decimal(
      eligibilityCheck.latestDecision.participationLimit,
    );

    const circleAmount = new Prisma.Decimal(circle.contributionAmount);
    const newTotalObligation = currentObligation.add(circleAmount);

    if (newTotalObligation.gt(participationLimit)) {
      throw new UnprocessableEntityException({
        reason: 'exceeds_participation_limit',
        currentObligation: currentObligation.toFixed(2),
        limit: participationLimit.toFixed(2),
        circleAmount: circleAmount.toFixed(2),
      });
    }

    // Success response
    return {
      status: 'ok',
      canProceed: true,
    };
  }

  /**
   * Endpoint 5: Live position availability
   * GET /customer/circles/:id/positions
   */
  async getPositionAvailability(circleId: string) {
    const circle = await this.prisma.circle.findUnique({
      where: { id: circleId },
      include: {
        memberships: true,
      },
    });

    if (!circle) {
      throw new NotFoundException(`Circle with ID ${circleId} not found`);
    }

    const now = new Date();

    // A position is occupied ONLY if status == ACTIVE or (status == PENDING_SIGNATURE && reservedUntil > now)
    const activeOrReservedMemberships = circle.memberships.filter(
      (m) =>
        m.status === MembershipStatus.ACTIVE ||
        (m.status === MembershipStatus.PENDING_SIGNATURE &&
          m.reservedUntil &&
          new Date(m.reservedUntil) > now),
    );

    const occupiedPositions = new Set(
      activeOrReservedMemberships.map((m) => m.payoutPosition),
    );

    const positions: Array<{
      position: number;
      isAvailable: boolean;
      feePreview: {
        gross: string;
        feeAmount: string;
        net: string;
        feePercentage: string;
      } | null;
    }> = [];

    for (let pos = 1; pos <= circle.durationMonths; pos++) {
      const isAvailable = !occupiedPositions.has(pos);
      let feePreview: {
        gross: string;
        feeAmount: string;
        net: string;
        feePercentage: string;
      } | null = null;

      if (circle.feePolicySnapshot) {
        try {
          const calcResult = this.feeCalculatorService.calculateNetPayout(
            {
              amount: circle.amount,
              feePolicySnapshot: circle.feePolicySnapshot,
              durationMonths: circle.durationMonths,
            },
            pos,
          );

          feePreview = {
            gross: calcResult.gross.toFixed(2),
            feeAmount: calcResult.feeAmount.toFixed(2),
            net: calcResult.net.toFixed(2),
            feePercentage: calcResult.feePercentage.toFixed(2),
          };
        } catch {
          feePreview = null;
        }
      }

      positions.push({
        position: pos,
        isAvailable,
        feePreview,
      });
    }

    return {
      circleId: circle.id,
      durationMonths: circle.durationMonths,
      positions,
    };
  }

  /**
   * ENDPOINT 1: Start Join (Reservation)
   * POST /customer/circles/:id/join
   */
  async startJoin(circleId: string, customerId: string, dto: StartJoinDto) {
    const eligibilityCheck = await this.evaluateCustomerEligibility(customerId);
    if (!eligibilityCheck.isEligible || !eligibilityCheck.latestDecision) {
      throw new UnprocessableEntityException({
        reason: 'eligibility_incomplete',
        missingSteps: eligibilityCheck.missingSteps,
      });
    }

    const now = new Date();

    // Resolve payment method (either inline cardToken verification OR existing verified paymentMethodId)
    let selectedPaymentMethodId = dto.paymentMethodId;

    if (dto.cardToken) {
      const verifiedResult = await this.paymentMethodsService.verifyAndAddPaymentMethod(
        customerId,
        dto.cardToken,
      );
      selectedPaymentMethodId = verifiedResult.paymentMethodId;
    } else if (selectedPaymentMethodId) {
      const pm = await this.prisma.paymentMethod.findFirst({
        where: {
          id: selectedPaymentMethodId,
          customerId,
          removedAt: null,
          verificationStatus: 'VERIFIED',
        },
      });
      if (!pm) {
        throw new UnprocessableEntityException({
          reason: 'card_verification_failed',
          message: 'Specified payment method is not verified or active.',
        });
      }
    } else {
      throw new UnprocessableEntityException({
        reason: 'card_verification_failed',
        message: 'A valid payment method or card token is required.',
      });
    }

    // Re-verify inside DB Transaction
    return await this.prisma.$transaction(async (tx) => {
      // 1. Check for late/unpaid installments in another circle
      const hasOverdue = await this.membershipsService.hasOverdueInstallments(
        customerId,
        tx,
      );
      if (hasOverdue) {
        throw new UnprocessableEntityException({
          reason: 'has_overdue_installment',
          message:
            'You have unpaid overdue installments in another circle. Settle them before joining.',
        });
      }

      // 2. Fetch circle & capacity
      const circle = await tx.circle.findUnique({
        where: { id: circleId },
      });

      if (!circle) {
        throw new NotFoundException(`Circle with ID ${circleId} not found`);
      }

      if (
        circle.status !== CircleStatus.UPCOMING ||
        circle.currentMembersCount >= circle.memberCapacity
      ) {
        throw new UnprocessableEntityException({ reason: 'circle_full' });
      }

      if (dto.payoutPosition < 1 || dto.payoutPosition > circle.durationMonths) {
        throw new UnprocessableEntityException({
          reason: 'invalid_payout_position',
          message: `Payout position must be between 1 and ${circle.durationMonths}`,
        });
      }

      // 3. Check existing membership for this customer in this circle
      const existingCustomerMembership = await tx.membership.findFirst({
        where: {
          circleId,
          customerId,
        },
      });

      if (existingCustomerMembership) {
        if (
          existingCustomerMembership.status === MembershipStatus.ACTIVE ||
          (existingCustomerMembership.status === MembershipStatus.PENDING_SIGNATURE &&
            existingCustomerMembership.reservedUntil &&
            new Date(existingCustomerMembership.reservedUntil) > now)
        ) {
          throw new UnprocessableEntityException({ reason: 'already_member' });
        } else if (
          existingCustomerMembership.status === MembershipStatus.PENDING_SIGNATURE &&
          existingCustomerMembership.reservedUntil &&
          new Date(existingCustomerMembership.reservedUntil) <= now
        ) {
          // Delete expired reservation row so customer can restart cleanly
          await tx.membership.delete({
            where: { id: existingCustomerMembership.id },
          });
        }
      }

      // 4. Check total active obligation against participation limit
      const currentObligation =
        await this.membershipsService.getActiveObligationTotal(customerId, tx);
      const participationLimit = new Prisma.Decimal(
        eligibilityCheck.latestDecision.participationLimit,
      );
      const circleAmount = new Prisma.Decimal(circle.contributionAmount);

      if (currentObligation.add(circleAmount).gt(participationLimit)) {
        throw new UnprocessableEntityException({
          reason: 'exceeds_participation_limit',
          currentObligation: currentObligation.toFixed(2),
          limit: participationLimit.toFixed(2),
          circleAmount: circleAmount.toFixed(2),
        });
      }

      // 5. Check if requested payoutPosition is currently held by someone else
      const existingPositionMembership = await tx.membership.findUnique({
        where: {
          circleId_payoutPosition: {
            circleId,
            payoutPosition: dto.payoutPosition,
          },
        },
      });

      if (existingPositionMembership) {
        if (
          existingPositionMembership.status === MembershipStatus.ACTIVE ||
          (existingPositionMembership.status === MembershipStatus.PENDING_SIGNATURE &&
            existingPositionMembership.reservedUntil &&
            new Date(existingPositionMembership.reservedUntil) > now)
        ) {
          throw new ConflictException({
            statusCode: 409,
            message: 'position_taken',
          });
        } else if (
          existingPositionMembership.status === MembershipStatus.PENDING_SIGNATURE &&
          existingPositionMembership.reservedUntil &&
          new Date(existingPositionMembership.reservedUntil) <= now
        ) {
          // Clean up expired position reservation
          await tx.membership.delete({
            where: { id: existingPositionMembership.id },
          });
        }
      }

      // 6. Check eligibility override flag
      const usedEligibilityOverride =
        eligibilityCheck.latestDecision.overrideAdminId != null;

      // 7. Create Membership with 15-minute reservation
      const reservedUntil = new Date(now.getTime() + 15 * 60 * 1000);
      let membership: any;
      try {
        membership = await tx.membership.create({
          data: {
            circleId,
            customerId,
            payoutPosition: dto.payoutPosition,
            defaultPaymentMethodId: selectedPaymentMethodId,
            status: MembershipStatus.PENDING_SIGNATURE,
            reservedUntil,
            usedEligibilityOverride,
          },
        });
      } catch (err: any) {
        if (err.code === 'P2002') {
          throw new ConflictException({
            statusCode: 409,
            message: 'position_taken',
          });
        }
        throw err;
      }

      // 8. Generate Draft Contract Reference
      const contractDraftId = await this.contractsService.generateDraft(
        membership.id,
      );

      // 9. Calculate fee preview
      const feeCalc = this.feeCalculatorService.calculateNetPayout(
        {
          amount: circle.amount,
          feePolicySnapshot: circle.feePolicySnapshot,
          durationMonths: circle.durationMonths,
        },
        dto.payoutPosition,
      );

      return {
        membershipId: membership.id,
        reservedUntil: membership.reservedUntil,
        contractDraftId,
        payoutPosition: membership.payoutPosition,
        calculatedPayout: {
          gross: feeCalc.gross.toFixed(2),
          feeAmount: feeCalc.feeAmount.toFixed(2),
          net: feeCalc.net.toFixed(2),
          feePercentage: feeCalc.feePercentage.toFixed(2),
        },
      };
    });
  }

  /**
   * ENDPOINT 3: Accept Terms & Request Signature OTP
   * POST /customer/join/:membershipId/contract/accept
   */
  async acceptContract(
    membershipId: string,
    customerId: string,
    dto: AcceptContractDto,
  ) {
    if (!dto.agreedToTerms || !dto.agreedToInstallmentSchedule || !dto.agreedToLateFees) {
      throw new BadRequestException(
        'Explicit consent is required for all terms, installment schedule, and late fees.',
      );
    }

    const membership = await this.prisma.membership.findUnique({
      where: { id: membershipId },
      include: { customer: true },
    });

    if (!membership || membership.customerId !== customerId) {
      throw new NotFoundException('Membership reservation not found');
    }

    if (membership.status !== MembershipStatus.PENDING_SIGNATURE) {
      throw new UnprocessableEntityException(
        'Membership is not in PENDING_SIGNATURE state',
      );
    }

    const now = new Date();
    if (!membership.reservedUntil || new Date(membership.reservedUntil) <= now) {
      throw new GoneException({
        statusCode: 410,
        message: 'reservation_expired',
      });
    }

    const target = membership.customer.mobileNumber || membership.customer.email;
    if (!target) {
      throw new UnprocessableEntityException('Customer mobile number or email is missing');
    }

    await this.authService.requestOtp(target, 'contract_signature');

    return {
      statusCode: 200,
      message: 'Signature verification code sent successfully',
      membershipId,
      expiresAt: membership.reservedUntil,
    };
  }

  /**
   * ENDPOINT 4: Verify Signature OTP & Finalize Membership
   * POST /customer/join/:membershipId/contract/verify-otp
   */
  async verifyContractOtpAndFinalize(
    membershipId: string,
    customerId: string,
    dto: VerifySignatureOtpDto,
    requestContext?: { ipAddress?: string; deviceInfo?: string },
  ) {
    const membership = await this.prisma.membership.findUnique({
      where: { id: membershipId },
      include: { customer: true, circle: true },
    });

    if (!membership || membership.customerId !== customerId) {
      throw new NotFoundException('Membership reservation not found');
    }

    if (membership.status !== MembershipStatus.PENDING_SIGNATURE) {
      throw new UnprocessableEntityException(
        'Membership is not in PENDING_SIGNATURE state',
      );
    }

    const now = new Date();
    if (!membership.reservedUntil || new Date(membership.reservedUntil) <= now) {
      throw new GoneException({
        statusCode: 410,
        message: 'reservation_expired',
      });
    }

    const target = membership.customer.mobileNumber || membership.customer.email;
    if (!target) {
      throw new UnprocessableEntityException('Customer mobile number or email is missing');
    }

    // Verify OTP using existing OTP service method
    const otpResult = await this.authService.verifyOtp(
      target,
      dto.code,
      'contract_signature',
    );

    // Single DB Transaction for activation
    return await this.prisma.$transaction(async (tx) => {
      // 1. Finalize contract (idempotent)
      const contract = await this.contractsService.finalize(
        membershipId,
        otpResult,
        tx,
        requestContext,
      );

      // 2. Update membership: status = ACTIVE, reservedUntil = null
      const updatedMembership = await tx.membership.update({
        where: { id: membershipId },
        data: {
          status: MembershipStatus.ACTIVE,
          reservedUntil: null,
        },
      });

      // 3. Upfront installment generation
      const installments: any[] = [];
      const startDate = new Date(membership.circle.startDate);

      for (let cycle = 1; cycle <= membership.circle.durationMonths; cycle++) {
        const dueDate = new Date(startDate);
        dueDate.setMonth(dueDate.getMonth() + (cycle - 1));

        const installment = await tx.installment.create({
          data: {
            membershipId,
            cycleNumber: cycle,
            dueDate,
            amount: membership.circle.contributionAmount,
            status: InstallmentStatus.PENDING,
          },
        });
        installments.push(installment);
      }

      // 4. Audit Event
      await tx.auditEvent.create({
        data: {
          entityType: 'membership',
          entityId: membershipId,
          action: 'joined',
          reason: null,
        },
      });

      // 5. Increment Circle currentMembersCount
      await tx.circle.update({
        where: { id: membership.circleId },
        data: {
          currentMembersCount: { increment: 1 },
        },
      });

      return {
        status: 'active',
        membershipId: updatedMembership.id,
        contract: {
          id: contract.id,
          docHash: contract.docHash,
          renderedFileRef: contract.renderedFileRef,
          signedAt: contract.signedAt,
        },
        installments: installments.map((i) => ({
          id: i.id,
          cycleNumber: i.cycleNumber,
          dueDate: i.dueDate,
          amount: i.amount,
          status: i.status,
        })),
      };
    });
  }
}

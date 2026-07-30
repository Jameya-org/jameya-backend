import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MembershipsService } from './memberships.service';
import { FeeCalculatorService } from './fee-calculator.service';
import { BrowseCirclesQueryDto } from './dto/browse-circles-query.dto';
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

    // 2. Check circle existence & capacity
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

    // 3. Check if customer is already a member of this circle
    const existingMembership = await this.prisma.membership.findFirst({
      where: {
        circleId,
        customerId,
      },
    });

    if (existingMembership) {
      throw new UnprocessableEntityException({
        reason: 'already_member',
      });
    }

    // 4. Check total active obligation against participation limit
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
        memberships: {
          select: {
            payoutPosition: true,
          },
        },
      },
    });

    if (!circle) {
      throw new NotFoundException(`Circle with ID ${circleId} not found`);
    }

    const occupiedPositions = new Set(
      circle.memberships.map((m) => m.payoutPosition),
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
}

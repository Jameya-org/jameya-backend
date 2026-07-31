import {
  Injectable,
  Inject,
  NotFoundException,
  UnprocessableEntityException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LedgerService } from '../payments/ledger.service';
import {
  IPaymentGateway,
  PAYMENT_GATEWAY,
} from '../payments/providers/payment-gateway.interface';
import { SubmitManualProofDto } from './dto/submit-manual-proof.dto';
import {
  Prisma,
  InstallmentStatus,
  TransactionType,
  PaymentChannelType,
  TransactionStatus,
  ReviewStatus,
} from '@prisma/client';

import { NotificationService } from '../notifications/notifications.service';
import { NotificationType } from '@prisma/client';

@Injectable()
export class InstallmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: LedgerService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: any,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * GET /customer/installments (FR-11)
   * Authoritative posted schedule, next due date/amount, and balance by circle
   */
  async getCustomerSchedule(customerId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: {
        customerId,
      },
      include: {
        circle: true,
        installments: {
          orderBy: { cycleNumber: 'asc' },
          include: {
            transactions: {
              orderBy: { createdAt: 'desc' },
            },
          },
        },
      },
    });

    const now = new Date();
    let totalOutstandingBalance = new Prisma.Decimal(0);
    let nextDueInstallment: any = null;

    const circlesSchedule = memberships.map((m) => {
      const circleContribution = new Prisma.Decimal(m.circle.contributionAmount);
      const circleInstallments = m.installments.map((inst) => {
        const instAmount = new Prisma.Decimal(inst.amount);
        if (inst.status !== InstallmentStatus.PAID) {
          totalOutstandingBalance = totalOutstandingBalance.add(instAmount);

          if (!nextDueInstallment || inst.dueDate < nextDueInstallment.dueDate) {
            nextDueInstallment = {
              installmentId: inst.id,
              circleId: m.circleId,
              cycleNumber: inst.cycleNumber,
              amount: instAmount.toFixed(2),
              dueDate: inst.dueDate,
              status: inst.status,
            };
          }
        }

        return {
          installmentId: inst.id,
          cycleNumber: inst.cycleNumber,
          dueDate: inst.dueDate,
          amount: instAmount.toFixed(2),
          status: inst.status,
          paidDate: inst.paidDate,
          retryAttempt: inst.retryAttempt,
          nextRetryAt: inst.nextRetryAt,
        };
      });

      return {
        membershipId: m.id,
        circleId: m.circleId,
        payoutPosition: m.payoutPosition,
        status: m.status,
        monthlyContribution: circleContribution.toFixed(2),
        installments: circleInstallments,
      };
    });

    return {
      totalOutstandingBalance: totalOutstandingBalance.toFixed(2),
      nextDueInstallment,
      circles: circlesSchedule,
    };
  }

  /**
   * GET /customer/installments/:id (FR-11)
   * Single installment breakdown with transaction history & receipt
   */
  async getInstallmentDetails(customerId: string, installmentId: string) {
    const installment = await this.prisma.installment.findUnique({
      where: { id: installmentId },
      include: {
        membership: {
          include: {
            circle: true,
          },
        },
        transactions: {
          orderBy: { createdAt: 'desc' },
          include: {
            paymentProof: true,
          },
        },
      },
    });

    if (!installment) {
      throw new NotFoundException(`Installment with ID ${installmentId} not found`);
    }

    if (installment.membership.customerId !== customerId) {
      throw new ForbiddenException(`Access denied to installment`);
    }

    const settledTx = installment.transactions.find(
      (tx) => tx.status === TransactionStatus.SETTLED,
    );

    return {
      installmentId: installment.id,
      circleId: installment.membership.circleId,
      cycleNumber: installment.cycleNumber,
      dueDate: installment.dueDate,
      amount: new Prisma.Decimal(installment.amount).toFixed(2),
      status: installment.status,
      paidDate: installment.paidDate,
      retryAttempt: installment.retryAttempt,
      nextRetryAt: installment.nextRetryAt,
      receiptReference: settledTx ? settledTx.providerReference : null,
      attemptHistory: installment.transactions.map((tx) => ({
        transactionId: tx.id,
        type: tx.type,
        channelType: tx.channelType,
        amount: new Prisma.Decimal(tx.amount).toFixed(2),
        status: tx.status,
        failureReason: tx.failureReason,
        failureCategory: tx.failureCategory,
        providerReference: tx.providerReference,
        idempotencyKey: tx.idempotencyKey,
        createdAt: tx.createdAt,
        settledAt: tx.settledAt,
      })),
    };
  }

  /**
   * Process Gateway Collection (Card Auto-Charge / Manual Card Pay)
   * Executes 3-attempt retry policy (Day 0, Day 1, Day 3)
   */
  async processGatewayCollection(installmentId: string) {
    const installment = await this.prisma.installment.findUnique({
      where: { id: installmentId },
      include: {
        membership: {
          include: {
            defaultPaymentMethod: true,
          },
        },
      },
    });

    if (!installment) {
      throw new NotFoundException(`Installment with ID ${installmentId} not found`);
    }

    if (installment.status === InstallmentStatus.PAID) {
      return { status: 'already_paid' };
    }

    const paymentMethod = installment.membership.defaultPaymentMethod;
    if (!paymentMethod || paymentMethod.removedAt) {
      // Missing payment method is non-retryable
      await this.markInstallmentOverdue(
        installment.id,
        installment.membership.customerId,
        'No active payment method linked to membership.',
      );
      return { status: 'overdue', reason: 'no_payment_method' };
    }

    const currentAttempt = installment.retryAttempt + 1;
    const idempotencyKey = `col_${installment.id}_att${currentAttempt}_${Date.now()}`;

    // 1. Create Transaction with status = PENDING
    const transaction = await this.prisma.transaction.create({
      data: {
        installmentId: installment.id,
        type: TransactionType.COLLECTION,
        channelType: PaymentChannelType.CARD,
        amount: installment.amount,
        currency: 'EGP',
        status: TransactionStatus.PENDING,
        idempotencyKey,
      },
    });

    // 2. Call Payment Gateway
    const result = await this.gateway.chargeToken(
      paymentMethod.providerToken,
      Number(installment.amount),
      idempotencyKey,
    );

    if (result.status === 'SETTLED') {
      // Success -> Post double-entry ledger entries & mark PAID
      await this.ledgerService.postInstallmentCollection(transaction.id);
      return { status: 'settled', transactionId: transaction.id };
    }

    if (result.status === 'PENDING_VERIFICATION') {
      // Timeout/Unknown state -> Mark PENDING_VERIFICATION and wait for reconciliation
      await this.prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          status: TransactionStatus.PENDING_VERIFICATION,
          providerReference: result.providerReference,
          failureReason: result.failureReason,
          failureCategory: result.failureCategory,
        },
      });
      return { status: 'pending_verification', transactionId: transaction.id };
    }

    // Failure branch
    const category = result.failureCategory || 'RETRYABLE';
    await this.prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        status: TransactionStatus.FAILED,
        providerReference: result.providerReference,
        failureReason: result.failureReason,
        failureCategory: category,
      },
    });

    // Evaluate 3-attempt timeline: Day 0 (attempt 1), Day 1 (attempt 2), Day 3 (attempt 3)
    if (category === 'NON_RETRYABLE' || currentAttempt >= 3) {
      // Mark OVERDUE immediately
      await this.markInstallmentOverdue(
        installment.id,
        installment.membership.customerId,
        result.failureReason || 'Collection failed after retries.',
      );
      return { status: 'overdue', failureCategory: category, currentAttempt };
    }

    // Schedule next retry: Day 1 after due date for attempt 2, Day 3 after due date for attempt 3
    const now = new Date();
    const nextRetryDate =
      currentAttempt === 1
        ? new Date(now.getTime() + 24 * 60 * 60 * 1000) // Day 1 (+24h)
        : new Date(now.getTime() + 48 * 60 * 60 * 1000); // Day 3 (+48h)

    await this.prisma.installment.update({
      where: { id: installment.id },
      data: {
        retryAttempt: currentAttempt,
        nextRetryAt: nextRetryDate,
      },
    });

    // Send retry notification to customer
    await this.notificationService.notify(
      installment.membership.customerId,
      NotificationType.INSTALLMENT_FAILED,
      {
        amount: installment.amount,
        reason: result.failureReason,
        installmentId: installment.id,
        relatedEntityType: 'Installment',
        relatedEntityId: installment.id,
      },
    );

    return {
      status: 'failed_scheduled_retry',
      failureCategory: category,
      currentAttempt,
      nextRetryAt: nextRetryDate,
    };
  }

  /**
   * Submit Manual Proof (Vodafone Cash / InstaPay)
   * Feature-flagged behind FEATURE_MANUAL_PROOF_ENABLED
   */
  async submitManualProof(
    customerId: string,
    installmentId: string,
    dto: SubmitManualProofDto,
  ) {
    const isFeatureEnabled =
      process.env.FEATURE_MANUAL_PROOF_ENABLED === 'true';
    if (!isFeatureEnabled) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        reason: 'feature_disabled',
        message: 'Manual proof submissions are not enabled for v1.',
      });
    }

    const installment = await this.prisma.installment.findUnique({
      where: { id: installmentId },
      include: {
        membership: true,
      },
    });

    if (!installment) {
      throw new NotFoundException(`Installment with ID ${installmentId} not found`);
    }

    if (installment.membership.customerId !== customerId) {
      throw new ForbiddenException(`Access denied to installment`);
    }

    if (installment.status === InstallmentStatus.PAID) {
      throw new UnprocessableEntityException({
        reason: 'already_paid',
        message: 'Installment is already paid.',
      });
    }

    const idempotencyKey = `manual_${installment.id}_${Date.now()}`;

    // Create Transaction with PENDING_MANUAL_REVIEW & linked PaymentProof
    const transaction = await this.prisma.transaction.create({
      data: {
        installmentId: installment.id,
        type: TransactionType.COLLECTION,
        channelType: dto.paymentChannel,
        amount: new Prisma.Decimal(dto.claimedAmount),
        currency: 'EGP',
        status: TransactionStatus.PENDING_MANUAL_REVIEW,
        idempotencyKey,
        paymentProof: {
          create: {
            paymentChannel: dto.paymentChannel,
            proofScreenshotRef: dto.proofScreenshotRef,
            claimedAmount: new Prisma.Decimal(dto.claimedAmount),
            senderMobileOrRef: dto.senderMobileOrRef,
            reviewStatus: ReviewStatus.PENDING,
          },
        },
      },
      include: {
        paymentProof: true,
      },
    });

    return {
      status: 'pending_review',
      transactionId: transaction.id,
      paymentProofId: transaction.paymentProof?.id,
    };
  }

  /**
   * Helper to mark installment OVERDUE, emit AuditEvent, block joins, and notify customer
   */
  async markInstallmentOverdue(
    installmentId: string,
    customerId: string,
    reasonMessage: string,
  ) {
    await this.prisma.installment.update({
      where: { id: installmentId },
      data: {
        status: InstallmentStatus.OVERDUE,
        nextRetryAt: null,
      },
    });

    // Write system AuditEvent
    await this.prisma.auditEvent.create({
      data: {
        action: 'overdue',
        entityType: 'installment',
        entityId: installmentId,
        reason: null,
      },
    });

    // Fetch installment amount for notification
    const installment = await this.prisma.installment.findUnique({
      where: { id: installmentId },
      select: { amount: true },
    });

    // Customer Notification
    await this.notificationService.notify(
      customerId,
      NotificationType.INSTALLMENT_OVERDUE,
      {
        amount: installment?.amount,
        reason: reasonMessage,
        installmentId,
        relatedEntityType: 'Installment',
        relatedEntityId: installmentId,
      },
    );
  }
}

import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { InstallmentsService } from '../modules/installments/installments.service';
import { LedgerService } from '../modules/payments/ledger.service';
import {
  IPaymentGateway,
  PAYMENT_GATEWAY,
} from '../modules/payments/providers/payment-gateway.interface';
import { NotificationService } from '../modules/notifications/notifications.service';
import { InstallmentStatus, TransactionStatus, NotificationType } from '@prisma/client';

@Injectable()
export class InstallmentCollectionJob {
  private readonly logger = Logger.name;

  constructor(
    private readonly prisma: PrismaService,
    private readonly installmentsService: InstallmentsService,
    private readonly ledgerService: LedgerService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: any,
    private readonly notificationService: NotificationService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async handleDailyReminders(): Promise<void> {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 3);

    const upcomingInstallments = await this.prisma.installment.findMany({
      where: {
        status: InstallmentStatus.PENDING,
        dueDate: {
          gte: new Date(targetDate.setHours(0, 0, 0, 0)),
          lte: new Date(targetDate.setHours(23, 59, 59, 999)),
        },
      },
      include: {
        membership: true,
      },
    });

    for (const inst of upcomingInstallments) {
      await this.notificationService.notify(
        inst.membership.customerId,
        NotificationType.INSTALLMENT_DUE_SOON,
        {
          amount: inst.amount,
          dueDate: inst.dueDate,
          installmentId: inst.id,
          relatedEntityType: 'Installment',
          relatedEntityId: inst.id,
        },
      );
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async handleCollectionsAndRetries(): Promise<void> {
    const now = new Date();

    // 1. Process Day 0 Due Installments or Day 1/3 Scheduled Retries
    const dueInstallments = await this.prisma.installment.findMany({
      where: {
        status: InstallmentStatus.PENDING,
        OR: [
          { dueDate: { lte: now }, retryAttempt: 0 },
          { nextRetryAt: { lte: now } },
        ],
      },
    });

    for (const inst of dueInstallments) {
      try {
        await this.installmentsService.processGatewayCollection(inst.id);
      } catch (err: any) {
        // Log error and skip to next
      }
    }
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  async handleReconciliations(): Promise<void> {
    // Reconcile transactions stuck in PENDING_VERIFICATION
    const pendingTransactions = await this.prisma.transaction.findMany({
      where: {
        status: TransactionStatus.PENDING_VERIFICATION,
        providerReference: { not: null },
      },
      include: {
        installment: {
          include: {
            membership: true,
          },
        },
      },
    });

    for (const tx of pendingTransactions) {
      if (!tx.providerReference) continue;

      const recon = await this.gateway.reconcileTransaction(tx.providerReference);
      if (recon.status === 'SETTLED') {
        await this.ledgerService.postInstallmentCollection(tx.id);
      } else {
        await this.prisma.transaction.update({
          where: { id: tx.id },
          data: {
            status: TransactionStatus.FAILED,
            failureReason: recon.failureReason,
            failureCategory: recon.failureCategory,
          },
        });
      }
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleOverdueFlagging(): Promise<void> {
    const now = new Date();

    // Find installments past due date with no settled transaction and retryAttempt >= 3
    const overdueCandidates = await this.prisma.installment.findMany({
      where: {
        status: InstallmentStatus.PENDING,
        dueDate: { lt: now },
        retryAttempt: { gte: 3 },
      },
      include: {
        membership: true,
      },
    });

    for (const inst of overdueCandidates) {
      await this.installmentsService.markInstallmentOverdue(
        inst.id,
        inst.membership.customerId,
        'All automated collection retries exhausted.',
      );
    }
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  FlagPaymentProofDto,
  HoldTransactionDto,
  ReviewPaymentProofDto,
} from './dto/payment-actions.dto';

@Injectable()
export class AdminPaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async listPendingProofs() {
    return this.prisma.paymentProof.findMany({
      where: { reviewStatus: 'PENDING' },
      include: {
        transaction: {
          select: {
            id: true,
            amount: true,
            channelType: true,
            createdAt: true,
            installment: {
              select: {
                cycleNumber: true,
                dueDate: true,
                membership: {
                  select: {
                    customer: { select: { id: true, legalName: true, mobileNumber: true } },
                    circle: { select: { id: true, durationMonths: true, amount: true } },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { submittedAt: 'asc' },
    });
  }

  async reviewProof(proofId: string, adminId: string, dto: ReviewPaymentProofDto, ipAddress?: string) {
    const proof = await this.prisma.paymentProof.findUnique({ where: { id: proofId } });
    if (!proof) throw new NotFoundException('Payment proof not found');

    const updated = await this.prisma.paymentProof.update({
      where: { id: proofId },
      data: {
        reviewStatus: dto.reviewStatus,
        reviewerAdminId: adminId,
        rejectionReason: dto.reviewStatus === 'REJECTED' ? dto.reason : null,
        reviewedAt: new Date(),
      },
    });

    // If approved, mark the parent transaction as SETTLED
    if (dto.reviewStatus === 'APPROVED') {
      await this.prisma.transaction.update({
        where: { id: proof.transactionId },
        data: { status: 'SETTLED', settledAt: new Date() },
      });
    }

    // If rejected, mark the parent transaction as REJECTED
    if (dto.reviewStatus === 'REJECTED') {
      await this.prisma.transaction.update({
        where: { id: proof.transactionId },
        data: { status: 'REJECTED', failureReason: dto.reason },
      });
    }

    await this.auditService.log({
      actorAdminId: adminId,
      action: 'payment.proof.reviewed',
      entityType: 'PaymentProof',
      entityId: proofId,
      oldValue: { reviewStatus: proof.reviewStatus },
      newValue: { reviewStatus: dto.reviewStatus },
      reason: dto.reason,
      ipAddress,
    });

    return updated;
  }

  async flagProof(proofId: string, adminId: string, dto: FlagPaymentProofDto, ipAddress?: string) {
    const proof = await this.prisma.paymentProof.findUnique({ where: { id: proofId } });
    if (!proof) throw new NotFoundException('Payment proof not found');

    // Flagging escalates to PENDING but records the concern in the rejection_reason field
    // The actual investigation happens offline; the proof stays in the queue
    const updated = await this.prisma.paymentProof.update({
      where: { id: proofId },
      data: {
        rejectionReason: `[FLAGGED] ${dto.reason}`,
        reviewerAdminId: adminId,
      },
    });

    await this.auditService.log({
      actorAdminId: adminId,
      action: 'payment.proof.flagged',
      entityType: 'PaymentProof',
      entityId: proofId,
      oldValue: { reviewStatus: proof.reviewStatus },
      newValue: { reviewStatus: proof.reviewStatus, flagNote: dto.reason },
      reason: dto.reason,
      ipAddress,
    });

    return updated;
  }

  async holdTransaction(transactionId: string, adminId: string, dto: HoldTransactionDto, ipAddress?: string) {
    const transaction = await this.prisma.transaction.findUnique({ where: { id: transactionId } });
    if (!transaction) throw new NotFoundException('Transaction not found');

    const updated = await this.prisma.transaction.update({
      where: { id: transactionId },
      data: {
        status: 'PENDING',
        failureReason: `[ON HOLD] ${dto.reason}`,
      },
    });

    await this.auditService.log({
      actorAdminId: adminId,
      action: 'transaction.held',
      entityType: 'Transaction',
      entityId: transactionId,
      oldValue: { status: transaction.status },
      newValue: { status: 'PENDING', holdReason: dto.reason },
      reason: dto.reason,
      ipAddress,
    });

    return updated;
  }
}

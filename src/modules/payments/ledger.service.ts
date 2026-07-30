import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  Prisma,
  TransactionStatus,
  InstallmentStatus,
  LedgerAccount,
} from '@prisma/client';

@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Unified double-entry ledger poster for installment collection.
   * Executed by both Gateway and Manual (Vodafone Cash / InstaPay) channels.
   */
  async postInstallmentCollection(
    transactionId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;

    const transaction = await client.transaction.findUnique({
      where: { id: transactionId },
      include: {
        installment: {
          include: {
            membership: true,
          },
        },
      },
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction with ID ${transactionId} not found`);
    }

    // Idempotency check: if transaction is already SETTLED, return cleanly (no-op)
    if (transaction.status === TransactionStatus.SETTLED) {
      return {
        alreadySettled: true,
        transaction,
        receiptReference: transaction.providerReference || `RCPT-${transaction.id.slice(0, 8)}`,
      };
    }

    const now = new Date();
    const amountDecimal = new Prisma.Decimal(transaction.amount);
    const receiptReference =
      transaction.providerReference || `RCPT-${Date.now()}-${transaction.id.slice(0, 8)}`;

    // 1. Create balanced LedgerEntry records:
    // Debit: COLLECTION_CLEARING
    // Credit: CUSTOMER_OBLIGATION
    await client.ledgerEntry.createMany({
      data: [
        {
          transactionId: transaction.id,
          account: LedgerAccount.COLLECTION_CLEARING,
          debit: amountDecimal,
          credit: new Prisma.Decimal(0),
          currency: transaction.currency || 'EGP',
          postedAt: now,
        },
        {
          transactionId: transaction.id,
          account: LedgerAccount.CUSTOMER_OBLIGATION,
          debit: new Prisma.Decimal(0),
          credit: amountDecimal,
          currency: transaction.currency || 'EGP',
          postedAt: now,
        },
      ],
    });

    // 2. Update Transaction status to SETTLED
    const updatedTransaction = await client.transaction.update({
      where: { id: transaction.id },
      data: {
        status: TransactionStatus.SETTLED,
        settledAt: now,
        providerReference: receiptReference,
      },
    });

    // 3. Update Installment status to PAID & set paidDate
    await client.installment.update({
      where: { id: transaction.installmentId },
      data: {
        status: InstallmentStatus.PAID,
        paidDate: now,
      },
    });

    // 4. Send customer in-app notification
    await client.inAppNotification.create({
      data: {
        customerId: transaction.installment.membership.customerId,
        title: 'Installment Paid Successfully',
        body: `Your installment of EGP ${amountDecimal.toFixed(2)} (Cycle #${transaction.installment.cycleNumber}) has been paid. Receipt: ${receiptReference}`,
      },
    });

    return {
      alreadySettled: false,
      transaction: updatedTransaction,
      receiptReference,
    };
  }
}

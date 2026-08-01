import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { AdminPayoutsService } from './admin-payouts.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationService } from '../../notifications/notifications.service';
import { calculateDaysLate } from '../installments/admin-installments.controller';
import { PayoutStatus, Prisma, LedgerAccount } from '@prisma/client';

describe('Admin Payouts & Late Payment Logic', () => {
  let service: AdminPayoutsService;
  let prismaService: jest.Mocked<PrismaService>;
  let notificationService: jest.Mocked<NotificationService>;

  beforeEach(async () => {
    const mockPrisma = {
      payout: {
        findUnique: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
        aggregate: jest.fn(),
        findMany: jest.fn(),
      },
      ledgerEntry: {
        createMany: jest.fn(),
      },
      auditEvent: {
        create: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(mockPrisma)),
    };

    const mockNotification = {
      notify: jest.fn().mockResolvedValue({ id: 'notif-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminPayoutsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationService, useValue: mockNotification },
      ],
    }).compile();

    service = module.get<AdminPayoutsService>(AdminPayoutsService);
    prismaService = module.get(PrismaService);
    notificationService = module.get(NotificationService);
  });

  describe('daysLate Calculation Logic', () => {
    const refDate = new Date('2026-08-01T12:00:00.000Z');

    it('should return correct positive daysLate for an overdue installment', () => {
      const dueDate = new Date('2026-07-20T00:00:00.000Z');
      const days = calculateDaysLate(dueDate, refDate);
      expect(days).toBe(12);
    });

    it('should return 0 daysLate when due date is today', () => {
      const dueDate = new Date('2026-08-01T00:00:00.000Z');
      const days = calculateDaysLate(dueDate, refDate);
      expect(days).toBe(0);
    });

    it('should return 0 daysLate when due date is in the future', () => {
      const dueDate = new Date('2026-08-15T00:00:00.000Z');
      const days = calculateDaysLate(dueDate, refDate);
      expect(days).toBe(0);
    });
  });

  describe('Payout Confirmation Idempotency Guard', () => {
    it('should throw 409 ConflictException when confirming an already-DISBURSED payout', async () => {
      prismaService.payout.findUnique.mockResolvedValue({
        id: 'payout-123',
        status: PayoutStatus.DISBURSED,
        grossAmount: new Prisma.Decimal(10000),
        feeAmount: new Prisma.Decimal(1000),
        netAmount: new Prisma.Decimal(9000),
        membershipId: 'mem-1',
        membership: { customerId: 'cust-1' },
      } as any);

      await expect(service.confirmPayout('payout-123', 'admin-1')).rejects.toThrow(
        ConflictException,
      );

      // Verify no ledger entries created or status updated
      expect(prismaService.ledgerEntry.createMany).not.toHaveBeenCalled();
      expect(prismaService.payout.update).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if payout does not exist', async () => {
      prismaService.payout.findUnique.mockResolvedValue(null);

      await expect(service.confirmPayout('payout-nonexistent', 'admin-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('Confirmed Payout Ledger Entries Balancing', () => {
    it('should post balanced ledger entries (Sum of Debits === Sum of Credits)', async () => {
      const grossAmount = new Prisma.Decimal(12000);
      const feeAmount = new Prisma.Decimal(1920); // 16% fee
      const netAmount = new Prisma.Decimal(10080);

      prismaService.payout.findUnique.mockResolvedValue({
        id: 'payout-456',
        status: PayoutStatus.SCHEDULED,
        grossAmount,
        feeAmount,
        netAmount,
        membershipId: 'mem-2',
        membership: { customerId: 'cust-2' },
      } as any);

      prismaService.payout.update.mockResolvedValue({
        id: 'payout-456',
        status: PayoutStatus.DISBURSED,
        disbursedAt: new Date(),
        grossAmount,
        feeAmount,
        netAmount,
      } as any);

      const result = await service.confirmPayout('payout-456', 'admin-1');

      expect(result.status).toBe(PayoutStatus.DISBURSED);
      expect(prismaService.ledgerEntry.createMany).toHaveBeenCalledTimes(1);

      const createdEntriesCall = (prismaService.ledgerEntry.createMany as jest.Mock).mock.calls[0][0];
      const entries: Array<{ account: LedgerAccount; debit: Prisma.Decimal; credit: Prisma.Decimal }> =
        createdEntriesCall.data;

      expect(entries).toHaveLength(3);

      let totalDebit = new Prisma.Decimal(0);
      let totalCredit = new Prisma.Decimal(0);

      for (const entry of entries) {
        totalDebit = totalDebit.add(new Prisma.Decimal(entry.debit));
        totalCredit = totalCredit.add(new Prisma.Decimal(entry.credit));
      }

      // Assert exact double-entry accounting balance
      expect(totalDebit.toString()).toBe(grossAmount.toString());
      expect(totalCredit.toString()).toBe(grossAmount.toString());
      expect(totalDebit.equals(totalCredit)).toBe(true);

      // Verify specific accounts
      const escrowEntry = entries.find((e) => e.account === LedgerAccount.ESCROW_ACCOUNT);
      const outflowEntry = entries.find((e) => e.account === LedgerAccount.PAYOUT_OUTFLOW);
      const feeEntry = entries.find((e) => e.account === LedgerAccount.FEE_REVENUE);

      expect(escrowEntry?.debit.toString()).toBe(grossAmount.toString());
      expect(outflowEntry?.credit.toString()).toBe(netAmount.toString());
      expect(feeEntry?.credit.toString()).toBe(feeAmount.toString());
    });
  });
});

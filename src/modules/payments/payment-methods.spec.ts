import { Test, TestingModule } from '@nestjs/testing';
import { PaymentMethodsService } from './payment-methods.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PAYMENT_GATEWAY } from './providers/payment-gateway.interface';
import { UnprocessableEntityException, NotFoundException } from '@nestjs/common';
import { MembershipStatus } from '@prisma/client';

describe('PaymentMethodsService (Removal Guard & Verification)', () => {
  let service: PaymentMethodsService;
  let prisma: any;
  let gateway: any;

  beforeEach(async () => {
    prisma = {
      paymentMethod: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
      },
      membership: {
        findFirst: jest.fn(),
      },
      $transaction: jest.fn((cb) => cb(prisma)),
    };

    gateway = {
      verifyCardToken: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentMethodsService,
        { provide: PrismaService, useValue: prisma },
        { provide: PAYMENT_GATEWAY, useValue: gateway },
      ],
    }).compile();

    service = module.get<PaymentMethodsService>(PaymentMethodsService);
  });

  describe('deletePaymentMethod', () => {
    it('should throw NotFoundException if payment method does not exist', async () => {
      prisma.paymentMethod.findFirst.mockResolvedValue(null);
      await expect(
        service.deletePaymentMethod('cust_1', 'pm_invalid'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw UnprocessableEntityException (422) if card is attached to an ACTIVE circle', async () => {
      prisma.paymentMethod.findFirst.mockResolvedValue({
        id: 'pm_active_1',
        customerId: 'cust_1',
      });

      prisma.membership.findFirst.mockResolvedValue({
        id: 'mem_123',
        defaultPaymentMethodId: 'pm_active_1',
        status: MembershipStatus.ACTIVE,
      });

      try {
        await service.deletePaymentMethod('cust_1', 'pm_active_1');
        fail('Should have thrown 422');
      } catch (err: any) {
        expect(err).toBeInstanceOf(UnprocessableEntityException);
        expect(err.getResponse().reason).toBe('cannot_remove_active_circle_payment_method');
      }
    });

    it('should soft delete card if NOT attached to any active circle', async () => {
      prisma.paymentMethod.findFirst.mockResolvedValue({
        id: 'pm_free_1',
        customerId: 'cust_1',
      });

      prisma.membership.findFirst.mockResolvedValue(null);
      prisma.paymentMethod.update.mockResolvedValue({ id: 'pm_free_1' });

      const result = await service.deletePaymentMethod('cust_1', 'pm_free_1');
      expect(result.status).toBe('deleted');
      expect(prisma.paymentMethod.update).toHaveBeenCalledWith({
        where: { id: 'pm_free_1' },
        data: {
          removedAt: expect.any(Date),
          isDefault: false,
        },
      });
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { AdminCustomersService } from './admin-customers.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../../notifications/notifications.service';
import { NotFoundException } from '@nestjs/common';
import { CustomerStatus, KycStatus } from '@prisma/client';

describe('AdminCustomersService', () => {
  let service: AdminCustomersService;
  let prisma: PrismaService;
  let auditService: AuditService;
  let notificationService: NotificationService;

  const mockPrismaService = {
    customer: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockAuditService = {
    log: jest.fn().mockResolvedValue(undefined),
  };

  const mockNotificationService = {
    notify: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminCustomersService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AuditService, useValue: mockAuditService },
        { provide: NotificationService, useValue: mockNotificationService },
      ],
    }).compile();

    service = module.get<AdminCustomersService>(AdminCustomersService);
    prisma = module.get<PrismaService>(PrismaService);
    auditService = module.get<AuditService>(AuditService);
    notificationService = module.get<NotificationService>(NotificationService);

    jest.clearAllMocks();
  });

  describe('listCustomers', () => {
    it('should return paginated list of customers', async () => {
      const mockCustomers = [
        {
          id: 'cust-1',
          legalName: 'Ahmed Ali',
          email: 'ahmed@example.com',
          mobileNumber: '+201001234567',
          status: CustomerStatus.ACTIVE,
          createdAt: new Date(),
          identityProfile: { kycStatus: KycStatus.APPROVED },
        },
      ];

      mockPrismaService.customer.findMany.mockResolvedValue(mockCustomers);
      mockPrismaService.customer.count.mockResolvedValue(1);

      const result = await service.listCustomers({ page: 1, limit: 10, search: 'Ahmed' });

      expect(result).toEqual({
        data: mockCustomers,
        meta: {
          total: 1,
          page: 1,
          limit: 10,
          totalPages: 1,
        },
      });
      expect(mockPrismaService.customer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 10,
          where: expect.objectContaining({
            deletedAt: null,
            OR: [
              { legalName: { contains: 'Ahmed', mode: 'insensitive' } },
              { email: { contains: 'Ahmed', mode: 'insensitive' } },
              { mobileNumber: { contains: 'Ahmed' } },
            ],
          }),
        }),
      );
    });
  });

  describe('getCustomerById', () => {
    it('should throw NotFoundException if customer is not found', async () => {
      mockPrismaService.customer.findUnique.mockResolvedValue(null);

      await expect(service.getCustomerById('non-existent-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return enriched customer profile with trustScore, paymentsSummary, and installments', async () => {
      const mockCustomer = {
        id: 'cust-1',
        legalName: 'Ahmed Sameh',
        email: 'ahmed@example.com',
        mobileNumber: '+201001234567',
        status: CustomerStatus.ACTIVE,
        createdAt: new Date(),
        identityProfile: {
          kycStatus: KycStatus.APPROVED,
          nationalIdentifierToken: '29801234567890',
        },
        documents: [],
        eligibilityDecisions: [
          {
            trustScore: 91,
            decidedAt: new Date(),
          },
        ],
        memberships: [
          {
            id: 'mem-1',
            circleId: 'circle-1',
            payoutPosition: 2,
            circle: {
              id: 'circle-1',
              amount: 1000,
              durationMonths: 12,
              status: 'IN_PROGRESS',
              startDate: new Date(),
            },
            installments: [
              {
                id: 'inst-1',
                cycleNumber: 1,
                dueDate: new Date(),
                amount: 1000,
                status: 'PAID',
                paidDate: new Date(),
                transactions: [
                  { channelType: 'E_WALLET', status: 'SETTLED' },
                ],
              },
              {
                id: 'inst-2',
                cycleNumber: 2,
                dueDate: new Date(),
                amount: 1000,
                status: 'OVERDUE',
                paidDate: null,
                transactions: [],
              },
            ],
          },
        ],
      };

      mockPrismaService.customer.findUnique.mockResolvedValue(mockCustomer);

      const result = await service.getCustomerById('cust-1');

      expect(result.trustScore).toEqual({
        score: 91,
        paymentCommitment: 50, // 1 paid out of 2 total = 50%
        identityVerification: 100, // APPROVED = 100%
      });

      expect(result.paymentsSummary).toEqual({
        total: 2,
        paid: 1,
        overdue: 1,
        pending: 0,
      });

      expect(result.installments).toHaveLength(2);
      expect(result.installments[0]).toEqual(
        expect.objectContaining({
          id: 'inst-1',
          status: 'PAID',
          paymentChannel: 'E_WALLET',
        }),
      );
      expect(result.installments[1]).toEqual(
        expect.objectContaining({
          id: 'inst-2',
          status: 'OVERDUE',
          paymentChannel: null,
        }),
      );
    });
  });

  describe('updateCustomerStatus', () => {
    it('should update customer status, send notification, and log audit event', async () => {
      const mockCustomer = {
        id: 'cust-1',
        status: CustomerStatus.ACTIVE,
        legalName: 'Ahmed Sameh',
      };
      const mockUpdated = {
        id: 'cust-1',
        status: CustomerStatus.SUSPENDED,
        legalName: 'Ahmed Sameh',
        email: 'ahmed@example.com',
        mobileNumber: '+201001234567',
      };

      mockPrismaService.customer.findUnique.mockResolvedValue(mockCustomer);
      mockPrismaService.customer.update.mockResolvedValue(mockUpdated);

      const dto = { status: CustomerStatus.SUSPENDED, reason: 'Fraudulent activity detected' };
      const result = await service.updateCustomerStatus('cust-1', dto, 'admin-1', '127.0.0.1');

      expect(result).toEqual(mockUpdated);
      expect(mockNotificationService.notify).toHaveBeenCalledWith(
        'cust-1',
        'ACCOUNT_STATUS_CHANGED',
        expect.objectContaining({
          status: CustomerStatus.SUSPENDED,
          reason: 'Fraudulent activity detected',
        }),
      );
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actorAdminId: 'admin-1',
          action: 'customer.status_changed',
          entityType: 'Customer',
          entityId: 'cust-1',
          reason: 'Fraudulent activity detected',
        }),
      );
    });
  });
});

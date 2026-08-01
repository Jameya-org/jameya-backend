import { Test, TestingModule } from '@nestjs/testing';
import { CirclesService } from './circles.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../admin/audit/audit.service';
import { CycleFrequency, CircleStatus, FeePolicyStatus } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';

describe('CirclesService', () => {
  let service: CirclesService;
  let prisma: any;
  let auditService: any;

  const mockFeePolicy = {
    id: 'fp-10',
    durationMonths: 10,
    status: FeePolicyStatus.ACTIVE,
    positionFees: { '1': 10.0 },
  };

  const mockCircle = {
    id: 'circle-1',
    amount: 10000,
    contributionAmount: 1000,
    durationMonths: 10,
    memberCapacity: 10,
    cycleFrequency: CycleFrequency.MONTHLY,
    startDate: new Date('2026-09-01'),
    endDate: new Date('2027-07-01'),
    status: CircleStatus.DRAFT,
    feePolicyId: 'fp-10',
    feePolicySnapshot: { '1': 10.0 },
    feePolicy: mockFeePolicy,
    memberships: [
      {
        id: 'mem-1',
        customerId: 'cust-1',
        payoutPosition: 1,
        status: 'ACTIVE',
        customer: {
          id: 'cust-1',
          legalName: 'Mohamed Ahmed',
          mobileNumber: '0123456789',
          email: 'mohamed@example.com',
        },
        installments: [
          {
            id: 'inst-1',
            cycleNumber: 1,
            dueDate: new Date('2026-09-01'),
            amount: 1000,
            status: 'PAID',
          },
          {
            id: 'inst-2',
            cycleNumber: 2,
            dueDate: new Date('2026-10-01'),
            amount: 1000,
            status: 'PENDING',
          },
        ],
      },
    ],
  };

  beforeEach(async () => {
    prisma = {
      feePolicy: {
        findFirst: jest.fn().mockResolvedValue(mockFeePolicy),
      },
      circle: {
        create: jest.fn().mockResolvedValue(mockCircle),
        findUnique: jest.fn().mockResolvedValue(mockCircle),
        update: jest.fn().mockResolvedValue(mockCircle),
      },
    };

    auditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CirclesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get<CirclesService>(CirclesService);
  });

  describe('createCircle', () => {
    it('should create a circle with implicit memberCapacity and cycleFrequency when omitted', async () => {
      const dto = {
        amount: 10000,
        contributionAmount: 1000,
        durationMonths: 10,
        startDate: '2026-09-01T00:00:00.000Z',
      };

      const result = await service.createCircle(dto as any, 'admin-1');

      expect(prisma.feePolicy.findFirst).toHaveBeenCalledWith({
        where: { durationMonths: 10, status: FeePolicyStatus.ACTIVE },
        orderBy: { effectiveFrom: 'desc' },
      });

      expect(prisma.circle.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          amount: 10000,
          contributionAmount: 1000,
          durationMonths: 10,
          memberCapacity: 10,
          cycleFrequency: CycleFrequency.MONTHLY,
          status: CircleStatus.DRAFT,
        }),
        include: { feePolicy: true },
      });

      expect(result.id).toEqual(mockCircle.id);
      expect(result.overview).toBeDefined();
    });

    it('should throw BadRequestException if amount does not match contributionAmount * derived memberCapacity', async () => {
      const dto = {
        amount: 5000, // Expected 1000 * 10 = 10000
        contributionAmount: 1000,
        durationMonths: 10,
        startDate: '2026-09-01T00:00:00.000Z',
      };

      await expect(service.createCircle(dto as any)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getCircleById', () => {
    it('should return circle details with overview aggregates, formatted members, and payments summary', async () => {
      const result = await service.getCircleById('circle-1');

      expect(result.id).toBe('circle-1');
      expect(result.circleCode).toBeDefined();
      expect(result.overview).toEqual({
        totalValue: 10000,
        collectedAmount: 1000,
        remainingAmount: 9000,
        completionPercentage: 10,
        currentMonthGauge: {
          currentCycleNumber: 2,
          targetAmount: 10000,
          collectedAmount: 0,
          paidCount: 0,
          totalMembersCount: 10,
        },
      });

      expect(result.formattedMembers).toHaveLength(1);
      expect(result.formattedMembers[0]).toMatchObject({
        legalName: 'Mohamed Ahmed',
        mobileNumber: '0123456789',
        payoutPosition: 1,
        currentCycleStatus: 'PENDING',
        paidInstallmentsCount: 1,
      });

      expect(result.paymentsSummary).toBeDefined();
      expect(result.paymentsSummary.totalRounds).toBe(10);
      expect(result.paymentsSummary.cycles).toHaveLength(10);
    });
  });
});

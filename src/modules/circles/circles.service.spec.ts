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

      expect(result).toEqual(mockCircle);
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
});

import { UnprocessableEntityException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CustomerCirclesService } from './customer-circles.service';
import { MembershipsService } from './memberships.service';
import { FeeCalculatorService } from './fee-calculator.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CircleStatus, EligibilityStatus, DocumentType, Prisma } from '@prisma/client';

describe('CustomerCirclesService - Join Intent Pre-check', () => {
  let service: CustomerCirclesService;
  let prismaMock: any;
  let membershipsServiceMock: any;
  let feeCalculatorServiceMock: any;

  const mockCustomerId = 'cust-1111-2222-3333';
  const mockCircleId = 'circle-aaaa-bbbb-cccc';

  beforeEach(async () => {
    prismaMock = {
      customer: {
        findUnique: jest.fn(),
      },
      circle: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      membership: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
    };

    membershipsServiceMock = {
      getActiveObligationTotal: jest.fn(),
    };

    feeCalculatorServiceMock = {
      calculateNetPayout: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomerCirclesService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: MembershipsService, useValue: membershipsServiceMock },
        { provide: FeeCalculatorService, useValue: feeCalculatorServiceMock },
      ],
    }).compile();

    service = module.get<CustomerCirclesService>(CustomerCirclesService);
  });

  describe('checkJoinIntent', () => {
    it('should throw 422 eligibility_incomplete if customer has no approved decision or incomplete docs', async () => {
      // Setup customer with missing proof of income and no eligibility decision
      prismaMock.customer.findUnique.mockResolvedValue({
        id: mockCustomerId,
        identityProfile: { kycStatus: 'APPROVED' },
        documents: [{ docType: DocumentType.NATIONAL_ID }],
        eligibilityDecisions: [],
      });

      try {
        await service.checkJoinIntent(mockCircleId, mockCustomerId);
        fail('Should have thrown UnprocessableEntityException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(UnprocessableEntityException);
        const response = err.getResponse();
        expect(response.reason).toBe('eligibility_incomplete');
        expect(response.missingSteps).toContain('proof_of_income');
        expect(response.missingSteps).toContain('eligibility_decision');
      }
    });

    it('should throw 422 circle_full if circle capacity is reached or not UPCOMING', async () => {
      // Eligible customer
      prismaMock.customer.findUnique.mockResolvedValue({
        id: mockCustomerId,
        identityProfile: { kycStatus: 'APPROVED' },
        documents: [
          { docType: DocumentType.NATIONAL_ID },
          { docType: DocumentType.PROOF_OF_INCOME },
        ],
        eligibilityDecisions: [
          {
            status: EligibilityStatus.ELIGIBLE,
            expiresAt: new Date(Date.now() + 864000000),
            participationLimit: new Prisma.Decimal(20000),
          },
        ],
      });

      // Full circle (currentMembersCount = 10, memberCapacity = 10)
      prismaMock.circle.findUnique.mockResolvedValue({
        id: mockCircleId,
        status: CircleStatus.UPCOMING,
        currentMembersCount: 10,
        memberCapacity: 10,
        contributionAmount: new Prisma.Decimal(1000),
      });

      try {
        await service.checkJoinIntent(mockCircleId, mockCustomerId);
        fail('Should have thrown UnprocessableEntityException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(UnprocessableEntityException);
        const response = err.getResponse();
        expect(response.reason).toBe('circle_full');
      }
    });

    it('should throw 422 already_member if customer is already a member of this circle', async () => {
      prismaMock.customer.findUnique.mockResolvedValue({
        id: mockCustomerId,
        identityProfile: { kycStatus: 'APPROVED' },
        documents: [
          { docType: DocumentType.NATIONAL_ID },
          { docType: DocumentType.PROOF_OF_INCOME },
        ],
        eligibilityDecisions: [
          {
            status: EligibilityStatus.ELIGIBLE,
            expiresAt: new Date(Date.now() + 864000000),
            participationLimit: new Prisma.Decimal(20000),
          },
        ],
      });

      prismaMock.circle.findUnique.mockResolvedValue({
        id: mockCircleId,
        status: CircleStatus.UPCOMING,
        currentMembersCount: 3,
        memberCapacity: 10,
        contributionAmount: new Prisma.Decimal(1000),
      });

      // Existing membership row
      prismaMock.membership.findFirst.mockResolvedValue({
        id: 'mem-123',
        circleId: mockCircleId,
        customerId: mockCustomerId,
      });

      try {
        await service.checkJoinIntent(mockCircleId, mockCustomerId);
        fail('Should have thrown UnprocessableEntityException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(UnprocessableEntityException);
        const response = err.getResponse();
        expect(response.reason).toBe('already_member');
      }
    });

    it('should throw 422 exceeds_participation_limit when joining pushes obligation over limit', async () => {
      prismaMock.customer.findUnique.mockResolvedValue({
        id: mockCustomerId,
        identityProfile: { kycStatus: 'APPROVED' },
        documents: [
          { docType: DocumentType.NATIONAL_ID },
          { docType: DocumentType.PROOF_OF_INCOME },
        ],
        eligibilityDecisions: [
          {
            status: EligibilityStatus.ELIGIBLE,
            expiresAt: new Date(Date.now() + 864000000),
            participationLimit: new Prisma.Decimal(20000),
          },
        ],
      });

      prismaMock.circle.findUnique.mockResolvedValue({
        id: mockCircleId,
        status: CircleStatus.UPCOMING,
        currentMembersCount: 3,
        memberCapacity: 10,
        contributionAmount: new Prisma.Decimal(8000),
      });

      prismaMock.membership.findFirst.mockResolvedValue(null);

      // Current active obligation is 15,000. New circle is 8,000. Total = 23,000 > 20,000 limit.
      membershipsServiceMock.getActiveObligationTotal.mockResolvedValue(
        new Prisma.Decimal(15000),
      );

      try {
        await service.checkJoinIntent(mockCircleId, mockCustomerId);
        fail('Should have thrown UnprocessableEntityException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(UnprocessableEntityException);
        const response = err.getResponse();
        expect(response.reason).toBe('exceeds_participation_limit');
        expect(response.currentObligation).toBe('15000.00');
        expect(response.limit).toBe('20000.00');
        expect(response.circleAmount).toBe('8000.00');
      }
    });

    it('should PASS when obligation + circle contribution EQUALS participationLimit boundary', async () => {
      prismaMock.customer.findUnique.mockResolvedValue({
        id: mockCustomerId,
        identityProfile: { kycStatus: 'APPROVED' },
        documents: [
          { docType: DocumentType.NATIONAL_ID },
          { docType: DocumentType.PROOF_OF_INCOME },
        ],
        eligibilityDecisions: [
          {
            status: EligibilityStatus.ELIGIBLE,
            expiresAt: new Date(Date.now() + 864000000),
            participationLimit: new Prisma.Decimal(20000),
          },
        ],
      });

      prismaMock.circle.findUnique.mockResolvedValue({
        id: mockCircleId,
        status: CircleStatus.UPCOMING,
        currentMembersCount: 3,
        memberCapacity: 10,
        contributionAmount: new Prisma.Decimal(5000),
      });

      prismaMock.membership.findFirst.mockResolvedValue(null);

      // Current obligation: 15,000. New circle: 5,000. Total = 20,000 == 20,000 limit.
      membershipsServiceMock.getActiveObligationTotal.mockResolvedValue(
        new Prisma.Decimal(15000),
      );

      const result = await service.checkJoinIntent(mockCircleId, mockCustomerId);
      expect(result).toEqual({
        status: 'ok',
        canProceed: true,
      });
    });

    it('should PASS when all conditions are met and obligation is well under limit', async () => {
      prismaMock.customer.findUnique.mockResolvedValue({
        id: mockCustomerId,
        identityProfile: { kycStatus: 'APPROVED' },
        documents: [
          { docType: DocumentType.NATIONAL_ID },
          { docType: DocumentType.PROOF_OF_INCOME },
        ],
        eligibilityDecisions: [
          {
            status: EligibilityStatus.ELIGIBLE,
            expiresAt: new Date(Date.now() + 864000000),
            participationLimit: new Prisma.Decimal(20000),
          },
        ],
      });

      prismaMock.circle.findUnique.mockResolvedValue({
        id: mockCircleId,
        status: CircleStatus.UPCOMING,
        currentMembersCount: 2,
        memberCapacity: 10,
        contributionAmount: new Prisma.Decimal(2000),
      });

      prismaMock.membership.findFirst.mockResolvedValue(null);

      membershipsServiceMock.getActiveObligationTotal.mockResolvedValue(
        new Prisma.Decimal(5000),
      );

      const result = await service.checkJoinIntent(mockCircleId, mockCustomerId);
      expect(result).toEqual({
        status: 'ok',
        canProceed: true,
      });
    });
  });
});

import {
  UnprocessableEntityException,
  ConflictException,
  GoneException,
  BadRequestException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CustomerCirclesService } from './customer-circles.service';
import { MembershipsService } from './memberships.service';
import { FeeCalculatorService } from './fee-calculator.service';
import { ContractsService } from '../contracts/contracts.service';
import { AuthService } from '../auth/auth.service';
import { PaymentMethodsService } from '../payments/payment-methods.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CircleStatus,
  EligibilityStatus,
  DocumentType,
  MembershipStatus,
  Prisma,
} from '@prisma/client';

describe('CustomerCirclesService - Full Join & Contract Signing Flow', () => {
  let service: CustomerCirclesService;
  let prismaMock: any;
  let txMock: any;
  let membershipsServiceMock: any;
  let feeCalculatorServiceMock: any;
  let contractsServiceMock: any;
  let authServiceMock: any;

  const mockCustomerId = 'cust-100';
  const mockCircleId = 'circle-200';
  const mockMembershipId = 'mem-300';

  beforeEach(async () => {
    txMock = {
      circle: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      membership: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      installment: {
        create: jest.fn(),
      },
      auditEvent: {
        create: jest.fn(),
      },
    };

    prismaMock = {
      customer: {
        findUnique: jest.fn(),
      },
      circle: {
        findUnique: jest.fn(),
      },
      membership: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
      paymentMethod: {
        findFirst: jest.fn().mockResolvedValue({ id: 'pm-123', verificationStatus: 'VERIFIED' }),
      },
      $transaction: jest.fn(async (cb) => cb(txMock)),
    };

    membershipsServiceMock = {
      hasOverdueInstallments: jest.fn(),
      getActiveObligationTotal: jest.fn(),
    };

    feeCalculatorServiceMock = {
      calculateNetPayout: jest.fn(),
    };

    contractsServiceMock = {
      generateDraft: jest.fn(),
      finalize: jest.fn(),
    };

    authServiceMock = {
      requestOtp: jest.fn(),
      verifyOtp: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomerCirclesService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: MembershipsService, useValue: membershipsServiceMock },
        { provide: FeeCalculatorService, useValue: feeCalculatorServiceMock },
        { provide: ContractsService, useValue: contractsServiceMock },
        { provide: AuthService, useValue: authServiceMock },
        { provide: PaymentMethodsService, useValue: { verifyAndAddPaymentMethod: jest.fn() } },
      ],
    }).compile();

    service = module.get<CustomerCirclesService>(CustomerCirclesService);
  });

  describe('startJoin (Endpoint 1)', () => {
    it('should throw 422 has_overdue_installment if user has late unpaid installments in another circle', async () => {
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

      // Mock overdue check returns true
      membershipsServiceMock.hasOverdueInstallments.mockResolvedValue(true);

      try {
        await service.startJoin(mockCircleId, mockCustomerId, {
          payoutPosition: 1,
          paymentMethodId: 'pm-123',
        });
        fail('Should have thrown UnprocessableEntityException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(UnprocessableEntityException);
        const res = err.getResponse();
        expect(res.reason).toBe('has_overdue_installment');
      }
    });

    it('should catch unique constraint violation (P2002) and throw 409 position_taken on concurrent reservation', async () => {
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

      membershipsServiceMock.hasOverdueInstallments.mockResolvedValue(false);
      membershipsServiceMock.getActiveObligationTotal.mockResolvedValue(
        new Prisma.Decimal(0),
      );

      txMock.circle.findUnique.mockResolvedValue({
        id: mockCircleId,
        status: CircleStatus.UPCOMING,
        currentMembersCount: 0,
        memberCapacity: 10,
        durationMonths: 6,
        amount: new Prisma.Decimal(6000),
        contributionAmount: new Prisma.Decimal(1000),
      });

      txMock.membership.findFirst.mockResolvedValue(null);
      txMock.membership.findUnique.mockResolvedValue(null);

      // Simulate Prisma P2002 race condition on create
      const p2002Error: any = new Error('Unique constraint failed');
      p2002Error.code = 'P2002';
      txMock.membership.create.mockRejectedValue(p2002Error);

      try {
        await service.startJoin(mockCircleId, mockCustomerId, {
          payoutPosition: 1,
          paymentMethodId: 'pm-123',
        });
        fail('Should have thrown ConflictException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(ConflictException);
        expect(err.getResponse()).toEqual({
          statusCode: 409,
          message: 'position_taken',
        });
      }
    });

    it('should successfully reserve position and return draft contract reference', async () => {
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
            overrideAdminId: null,
          },
        ],
      });

      membershipsServiceMock.hasOverdueInstallments.mockResolvedValue(false);
      membershipsServiceMock.getActiveObligationTotal.mockResolvedValue(
        new Prisma.Decimal(0),
      );

      txMock.circle.findUnique.mockResolvedValue({
        id: mockCircleId,
        status: CircleStatus.UPCOMING,
        currentMembersCount: 0,
        memberCapacity: 6,
        durationMonths: 6,
        amount: new Prisma.Decimal(6000),
        contributionAmount: new Prisma.Decimal(1000),
        feePolicySnapshot: {},
      });

      txMock.membership.findFirst.mockResolvedValue(null);
      txMock.membership.findUnique.mockResolvedValue(null);

      const reservedUntil = new Date(Date.now() + 15 * 60 * 1000);
      txMock.membership.create.mockResolvedValue({
        id: mockMembershipId,
        circleId: mockCircleId,
        customerId: mockCustomerId,
        payoutPosition: 2,
        status: MembershipStatus.PENDING_SIGNATURE,
        reservedUntil,
        usedEligibilityOverride: false,
      });

      contractsServiceMock.generateDraft.mockResolvedValue('contracts/drafts/ref.pdf');
      feeCalculatorServiceMock.calculateNetPayout.mockReturnValue({
        gross: new Prisma.Decimal(6000),
        feeAmount: new Prisma.Decimal(300),
        net: new Prisma.Decimal(5700),
        feePercentage: new Prisma.Decimal(5),
      });

      const result = await service.startJoin(mockCircleId, mockCustomerId, {
        payoutPosition: 2,
        paymentMethodId: 'pm-123',
      });

      expect(result.membershipId).toBe(mockMembershipId);
      expect(result.contractDraftId).toBe('contracts/drafts/ref.pdf');
      expect(result.payoutPosition).toBe(2);
      expect(result.calculatedPayout.net).toBe('5700.00');
    });
  });

  describe('acceptContract (Endpoint 3)', () => {
    it('should throw 400 if any consent boolean is false', async () => {
      try {
        await service.acceptContract(mockMembershipId, mockCustomerId, {
          agreedToTerms: true,
          agreedToInstallmentSchedule: false,
          agreedToLateFees: true,
        });
        fail('Should have thrown BadRequestException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(BadRequestException);
      }
    });

    it('should throw 410 reservation_expired if reservedUntil has passed', async () => {
      prismaMock.membership.findUnique.mockResolvedValue({
        id: mockMembershipId,
        customerId: mockCustomerId,
        status: MembershipStatus.PENDING_SIGNATURE,
        reservedUntil: new Date(Date.now() - 10000), // 10s in past
        customer: { mobileNumber: '+201000000000' },
      });

      try {
        await service.acceptContract(mockMembershipId, mockCustomerId, {
          agreedToTerms: true,
          agreedToInstallmentSchedule: true,
          agreedToLateFees: true,
        });
        fail('Should have thrown GoneException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(GoneException);
        expect(err.getResponse()).toEqual({
          statusCode: 410,
          message: 'reservation_expired',
        });
      }
    });

    it('should request OTP on valid consent and unexpired reservation', async () => {
      prismaMock.membership.findUnique.mockResolvedValue({
        id: mockMembershipId,
        customerId: mockCustomerId,
        status: MembershipStatus.PENDING_SIGNATURE,
        reservedUntil: new Date(Date.now() + 600000),
        customer: { mobileNumber: '+201000000000' },
      });

      authServiceMock.requestOtp.mockResolvedValue({ message: 'sent' });

      const res = await service.acceptContract(mockMembershipId, mockCustomerId, {
        agreedToTerms: true,
        agreedToInstallmentSchedule: true,
        agreedToLateFees: true,
      });

      expect(authServiceMock.requestOtp).toHaveBeenCalledWith(
        '+201000000000',
        'contract_signature',
      );
      expect(res.statusCode).toBe(200);
    });
  });

  describe('verifyContractOtpAndFinalize (Endpoint 4)', () => {
    it('should verify OTP, finalize contract, update status to ACTIVE, and generate upfront installments', async () => {
      const activeReservedUntil = new Date(Date.now() + 600000);
      const circleStartDate = new Date('2026-08-01');

      prismaMock.membership.findUnique.mockResolvedValue({
        id: mockMembershipId,
        customerId: mockCustomerId,
        circleId: mockCircleId,
        status: MembershipStatus.PENDING_SIGNATURE,
        reservedUntil: activeReservedUntil,
        customer: { mobileNumber: '+201000000000' },
        circle: {
          id: mockCircleId,
          durationMonths: 3,
          contributionAmount: new Prisma.Decimal(1000),
          startDate: circleStartDate,
        },
      });

      authServiceMock.verifyOtp.mockResolvedValue({ verified: true, verifiedAt: new Date() });

      contractsServiceMock.finalize.mockResolvedValue({
        id: 'contract-999',
        docHash: 'sha256docHashValue',
        renderedFileRef: 'contracts/final/doc.pdf',
        signedAt: new Date(),
      });

      txMock.membership.update.mockResolvedValue({
        id: mockMembershipId,
        status: MembershipStatus.ACTIVE,
        reservedUntil: null,
      });

      txMock.installment.create.mockImplementation(({ data }: any) =>
        Promise.resolve({
          id: `inst-${data.cycleNumber}`,
          ...data,
        }),
      );

      const result = await service.verifyContractOtpAndFinalize(
        mockMembershipId,
        mockCustomerId,
        { code: '123456' },
      );

      expect(authServiceMock.verifyOtp).toHaveBeenCalledWith(
        '+201000000000',
        '123456',
        'contract_signature',
      );
      expect(contractsServiceMock.finalize).toHaveBeenCalled();
      expect(txMock.membership.update).toHaveBeenCalledWith({
        where: { id: mockMembershipId },
        data: {
          status: MembershipStatus.ACTIVE,
          reservedUntil: null,
        },
      });
      expect(txMock.installment.create).toHaveBeenCalledTimes(3);
      expect(txMock.circle.update).toHaveBeenCalledWith({
        where: { id: mockCircleId },
        data: { currentMembersCount: { increment: 1 } },
      });
      expect(result.status).toBe('active');
      expect(result.installments.length).toBe(3);
    });
  });
});

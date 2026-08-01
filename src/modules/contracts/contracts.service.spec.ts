import { Test, TestingModule } from '@nestjs/testing';
import { ContractsService } from './contracts.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('ContractsService', () => {
  let service: ContractsService;
  let prismaMock: any;

  const mockMembershipId = 'mem-1111-2222-3333';

  beforeEach(async () => {
    prismaMock = {
      membership: {
        findUnique: jest.fn(),
      },
      contract: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContractsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<ContractsService>(ContractsService);
  });

  describe('generateDraft', () => {
    it('should generate a draft PDF reference for a valid membership', async () => {
      prismaMock.membership.findUnique.mockResolvedValue({
        id: mockMembershipId,
        circleId: 'circle-1',
        customerId: 'cust-1',
        payoutPosition: 1,
        circle: {
          contributionAmount: '1000',
          durationMonths: 6,
          feePolicySnapshot: { version: '1.0' },
        },
        customer: {
          legalName: 'Test Customer',
        },
      });

      const draftRef = await service.generateDraft(mockMembershipId);
      expect(draftRef).toContain(`contracts/drafts/${mockMembershipId}_draft_`);
    });
  });

  describe('finalize Idempotency', () => {
    it('should return existing contract if finalize is called a second time for the same membership', async () => {
      const existingContract = {
        id: 'contract-999',
        membershipId: mockMembershipId,
        templateVersion: '1.0',
        renderedFileRef: 'contracts/final/already_exists.pdf',
        docHash: 'abc123hash',
        acceptanceEvidence: {},
        signatureOtpResult: '{}',
        signedAt: new Date(),
      };

      // First query returns existing contract
      prismaMock.contract.findUnique.mockResolvedValue(existingContract);

      const result = await service.finalize(mockMembershipId, { verified: true });
      expect(result).toBe(existingContract);
      expect(prismaMock.contract.create).not.toHaveBeenCalled();
    });

    it('should create contract row on first call to finalize', async () => {
      prismaMock.contract.findUnique.mockResolvedValue(null);
      prismaMock.membership.findUnique.mockResolvedValue({
        id: mockMembershipId,
        circleId: 'circle-1',
        customerId: 'cust-1',
        payoutPosition: 2,
        circle: {
          contributionAmount: '2000',
          durationMonths: 10,
          feePolicySnapshot: { version: '1.0' },
        },
        customer: {
          legalName: 'Test Customer',
          mobileNumber: '+201000000000',
          consentVersions: { version: '1.0' },
        },
      });

      const createdContract = {
        id: 'contract-new-123',
        membershipId: mockMembershipId,
        templateVersion: '1.0',
        renderedFileRef: 'contracts/final/new.pdf',
        docHash: 'hash123',
        acceptanceEvidence: {},
        signatureOtpResult: '{"verified":true}',
        signedAt: new Date(),
      };

      prismaMock.contract.create.mockResolvedValue(createdContract);

      const result = await service.finalize(mockMembershipId, { verified: true });
      expect(result).toBe(createdContract);
      expect(prismaMock.contract.create).toHaveBeenCalledTimes(1);
    });
  });
});

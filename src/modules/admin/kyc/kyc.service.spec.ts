import { Test, TestingModule } from '@nestjs/testing';
import { KycService } from './kyc.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { CustomersRepository } from '../../customers/customers.repository';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../../notifications/notifications.service';
import { DocumentStatus, DocumentType, NotificationType } from '@prisma/client';

describe('KycService', () => {
  let service: KycService;
  let prismaMock: any;
  let customersRepoMock: any;
  let auditServiceMock: any;
  let notificationServiceMock: any;

  beforeEach(async () => {
    prismaMock = {
      document: {
        findUnique: jest.fn(),
        count: jest.fn(),
      },
      eligibilityDecision: {
        create: jest.fn(),
      },
    };

    customersRepoMock = {
      updateDocumentReview: jest.fn(),
      updateKycStatus: jest.fn(),
      findById: jest.fn(),
    };

    auditServiceMock = {
      log: jest.fn(),
    };

    notificationServiceMock = {
      notify: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KycService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: CustomersRepository, useValue: customersRepoMock },
        { provide: AuditService, useValue: auditServiceMock },
        { provide: NotificationService, useValue: notificationServiceMock },
      ],
    }).compile();

    service = module.get<KycService>(KycService);
  });

  it('should trigger exactly one DOCUMENT_REJECTED notification with correct docType and reason when document is rejected', async () => {
    const mockDocument = {
      id: 'doc-123',
      customerId: 'cust-456',
      docType: DocumentType.NATIONAL_ID,
      status: DocumentStatus.PENDING,
    };

    prismaMock.document.findUnique.mockResolvedValue(mockDocument);
    customersRepoMock.updateDocumentReview.mockResolvedValue({
      ...mockDocument,
      status: DocumentStatus.REJECTED,
      reviewResult: 'Image is blurry and illegible.',
    });

    await service.reviewDocument('doc-123', 'admin-789', {
      status: DocumentStatus.REJECTED,
      reason: 'Image is blurry and illegible.',
    });

    expect(customersRepoMock.updateKycStatus).toHaveBeenCalledWith('cust-456', 'REJECTED');

    expect(notificationServiceMock.notify).toHaveBeenCalledTimes(1);
    expect(notificationServiceMock.notify).toHaveBeenCalledWith(
      'cust-456',
      NotificationType.DOCUMENT_REJECTED,
      {
        docType: DocumentType.NATIONAL_ID,
        reason: 'Image is blurry and illegible.',
        documentId: 'doc-123',
        relatedEntityType: 'Document',
        relatedEntityId: 'doc-123',
      },
    );
  });

  it('should trigger DOCUMENT_APPROVED notification when document is approved', async () => {
    const mockDocument = {
      id: 'doc-123',
      customerId: 'cust-456',
      docType: DocumentType.NATIONAL_ID,
      status: DocumentStatus.PENDING,
    };

    prismaMock.document.findUnique.mockResolvedValue(mockDocument);
    customersRepoMock.updateDocumentReview.mockResolvedValue({
      ...mockDocument,
      status: DocumentStatus.APPROVED,
    });
    prismaMock.document.count.mockResolvedValue(0);

    await service.reviewDocument('doc-123', 'admin-789', {
      status: DocumentStatus.APPROVED,
      reviewResult: 'Valid ID.',
    });

    expect(notificationServiceMock.notify).toHaveBeenCalledTimes(1);
    expect(notificationServiceMock.notify).toHaveBeenCalledWith(
      'cust-456',
      NotificationType.DOCUMENT_APPROVED,
      {
        docType: DocumentType.NATIONAL_ID,
        documentId: 'doc-123',
        relatedEntityType: 'Document',
        relatedEntityId: 'doc-123',
      },
    );
  });
});

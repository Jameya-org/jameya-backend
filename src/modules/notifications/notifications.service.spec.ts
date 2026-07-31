import { Test, TestingModule } from '@nestjs/testing';
import { NotificationService } from './notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationType } from '@prisma/client';

describe('NotificationService', () => {
  let service: NotificationService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      inAppNotification: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
  });

  it('should create a notification with correct row shape', async () => {
    const mockCreated = {
      id: 'notif-1',
      customerId: 'cust-1',
      type: NotificationType.DOCUMENT_APPROVED,
      title: 'Document Approved',
      body: 'Your NATIONAL ID was approved.',
      relatedEntityType: 'Document',
      relatedEntityId: 'doc-1',
      isRead: false,
      createdAt: new Date(),
    };

    prismaMock.inAppNotification.create.mockResolvedValue(mockCreated);

    const result = await service.notify(
      'cust-1',
      NotificationType.DOCUMENT_APPROVED,
      {
        docType: 'NATIONAL_ID',
        documentId: 'doc-1',
        relatedEntityType: 'Document',
        relatedEntityId: 'doc-1',
      },
    );

    expect(prismaMock.inAppNotification.create).toHaveBeenCalledWith({
      data: {
        customerId: 'cust-1',
        type: NotificationType.DOCUMENT_APPROVED,
        title: 'Document Approved',
        body: 'Your NATIONAL ID was approved.',
        relatedEntityType: 'Document',
        relatedEntityId: 'doc-1',
        isRead: false,
      },
    });
    expect(result).toEqual(mockCreated);
  });

  it('should handle errors gracefully without throwing in fire-and-forget notify()', async () => {
    prismaMock.inAppNotification.create.mockRejectedValue(new Error('DB Connection Error'));

    const result = await service.notify(
      'cust-1',
      NotificationType.DOCUMENT_REJECTED,
      { reason: 'Blurry' },
    );

    expect(result).toBeNull();
  });

  it('should return accurate unread count from getUnreadCount', async () => {
    prismaMock.inAppNotification.count.mockResolvedValue(5);

    const res = await service.getUnreadCount('cust-1');

    expect(prismaMock.inAppNotification.count).toHaveBeenCalledWith({
      where: { customerId: 'cust-1', isRead: false },
    });
    expect(res).toEqual({ unreadCount: 5 });
  });

  it('should mark single notification as read', async () => {
    prismaMock.inAppNotification.findFirst.mockResolvedValue({ id: 'notif-1', customerId: 'cust-1' });
    prismaMock.inAppNotification.update.mockResolvedValue({ id: 'notif-1', isRead: true });

    const res = await service.markAsRead('cust-1', 'notif-1');

    expect(prismaMock.inAppNotification.update).toHaveBeenCalledWith({
      where: { id: 'notif-1' },
      data: { isRead: true },
    });
    expect(res.isRead).toBe(true);
  });

  it('should mark all notifications as read', async () => {
    prismaMock.inAppNotification.updateMany.mockResolvedValue({ count: 3 });

    const res = await service.markAllAsRead('cust-1');

    expect(prismaMock.inAppNotification.updateMany).toHaveBeenCalledWith({
      where: { customerId: 'cust-1', isRead: false },
      data: { isRead: true },
    });
    expect(res.updatedCount).toBe(3);
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { ReservationExpiryJob } from './reservation-expiry.job';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../modules/notifications/notifications.service';
import { MembershipStatus, NotificationType } from '@prisma/client';

describe('ReservationExpiryJob', () => {
  let job: ReservationExpiryJob;
  let prismaMock: any;
  let txMock: any;
  let notificationServiceMock: any;

  beforeEach(async () => {
    txMock = {
      membership: {
        update: jest.fn(),
      },
      auditEvent: {
        create: jest.fn(),
      },
    };

    prismaMock = {
      membership: {
        findMany: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(txMock)),
    };

    notificationServiceMock = {
      notify: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReservationExpiryJob,
        { provide: PrismaService, useValue: prismaMock },
        { provide: NotificationService, useValue: notificationServiceMock },
      ],
    }).compile();

    job = module.get<ReservationExpiryJob>(ReservationExpiryJob);
  });

  it('should find expired PENDING_SIGNATURE memberships and mark them CANCELLED with audit & notification', async () => {
    const expiredMembership = {
      id: 'mem-expired-1',
      customerId: 'cust-1',
      circleId: 'circle-1',
      payoutPosition: 3,
      status: MembershipStatus.PENDING_SIGNATURE,
      reservedUntil: new Date(Date.now() - 60000), // 1 minute ago
    };

    prismaMock.membership.findMany.mockResolvedValue([expiredMembership]);

    await job.handleExpiredReservations();

    expect(txMock.membership.update).toHaveBeenCalledWith({
      where: { id: 'mem-expired-1' },
      data: {
        status: MembershipStatus.CANCELLED,
        reservedUntil: null,
      },
    });

    expect(txMock.auditEvent.create).toHaveBeenCalledWith({
      data: {
        entityType: 'membership',
        entityId: 'mem-expired-1',
        action: 'reservation_expired',
        reason: 'auto-expired, position released',
      },
    });

    expect(notificationServiceMock.notify).toHaveBeenCalledWith(
      'cust-1',
      NotificationType.RESERVATION_EXPIRED,
      {
        position: 3,
        circleId: 'circle-1',
        relatedEntityType: 'Membership',
        relatedEntityId: 'mem-expired-1',
      },
    );
  });

  it('should do nothing if no expired reservations exist', async () => {
    prismaMock.membership.findMany.mockResolvedValue([]);

    await job.handleExpiredReservations();

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

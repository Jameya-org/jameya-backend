import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationType, InAppNotification } from '@prisma/client';
import { GetNotificationsQueryDto } from './dto/get-notifications-query.dto';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Primary entry point for firing in-app notifications.
   * Execution is fire-and-forget from caller perspective — errors are logged, never thrown.
   */
  async notify(
    customerId: string,
    type: NotificationType,
    payload: Record<string, any> = {},
  ): Promise<InAppNotification | null> {
    try {
      const { title, body } = this.renderTemplate(type, payload);
      const relatedEntityType = payload.relatedEntityType ?? null;
      const relatedEntityId = payload.relatedEntityId ?? null;

      const notification = await this.prisma.inAppNotification.create({
        data: {
          customerId,
          type,
          title,
          body,
          relatedEntityType,
          relatedEntityId,
          isRead: false,
        },
      });

      this.logger.log(
        `Sent ${type} notification [id: ${notification.id}] to customer ${customerId}`,
      );

      return notification;
    } catch (err: any) {
      this.logger.error(
        `Failed to deliver ${type} notification to customer ${customerId}: ${err?.message || err}`,
        err?.stack,
      );
      return null;
    }
  }

  /**
   * Customer Endpoints Support
   */
  async getNotifications(customerId: string, query: GetNotificationsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = {
      customerId,
      ...(query.unread ? { isRead: false } : {}),
    };

    const [notifications, total] = await Promise.all([
      this.prisma.inAppNotification.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.inAppNotification.count({ where }),
    ]);

    return {
      data: notifications,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async markAsRead(customerId: string, notificationId: string) {
    const notification = await this.prisma.inAppNotification.findFirst({
      where: { id: notificationId, customerId },
    });

    if (!notification) {
      throw new NotFoundException(`Notification with ID ${notificationId} not found`);
    }

    return this.prisma.inAppNotification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });
  }

  async markAllAsRead(customerId: string) {
    const result = await this.prisma.inAppNotification.updateMany({
      where: { customerId, isRead: false },
      data: { isRead: true },
    });

    return {
      message: 'All notifications marked as read',
      updatedCount: result.count,
    };
  }

  async getUnreadCount(customerId: string) {
    const count = await this.prisma.inAppNotification.count({
      where: { customerId, isRead: false },
    });

    return { unreadCount: count };
  }

  /**
   * Helper template renderer
   */
  private renderTemplate(
    type: NotificationType,
    payload: Record<string, any>,
  ): { title: string; body: string } {
    const docTypeStr = payload.docType ? String(payload.docType).replace(/_/g, ' ') : 'Document';

    switch (type) {
      case NotificationType.DOCUMENT_APPROVED:
        return {
          title: 'Document Approved',
          body: `Your ${docTypeStr} was approved.`,
        };

      case NotificationType.DOCUMENT_REJECTED:
        return {
          title: 'Document Rejected',
          body: `Your ${docTypeStr} was rejected: ${
            payload.reason || 'Requirements not met'
          }. Please upload a new ${docTypeStr} to continue.`,
        };

      case NotificationType.ELIGIBILITY_DECIDED:
        return {
          title: 'Eligibility Decided',
          body: `Your eligibility evaluation is complete. Status: ${payload.status || 'Updated'}.${
            payload.participationLimit != null ? ` Limit: ${payload.participationLimit} EGP.` : ''
          }`,
        };

      case NotificationType.JOIN_CONFIRMED:
        return {
          title: 'Circle Membership Confirmed',
          body: `You have successfully joined circle ${payload.circleName || payload.circleId || ''}!`,
        };

      case NotificationType.CONTRACT_AVAILABLE:
        return {
          title: 'Contract Available',
          body: `Your signed membership contract is now available for review.`,
        };

      case NotificationType.INSTALLMENT_DUE_SOON:
        return {
          title: 'Installment Due Soon',
          body: `Your installment of ${payload.amount || ''} EGP is due on ${
            payload.dueDate ? new Date(payload.dueDate).toISOString().split('T')[0] : 'soon'
          }.`,
        };

      case NotificationType.INSTALLMENT_PAID:
        return {
          title: 'Installment Paid Successfully',
          body: `Your payment of ${payload.amount || ''} EGP was received successfully.`,
        };

      case NotificationType.INSTALLMENT_FAILED:
        return {
          title: 'Installment Payment Failed',
          body: `Payment attempt for your installment failed. ${payload.reason || 'We will retry automatically.'}`,
        };

      case NotificationType.INSTALLMENT_OVERDUE:
        return {
          title: 'Installment Overdue',
          body: `Your installment of ${payload.amount || ''} EGP is overdue. Please settle it as soon as possible.`,
        };

      case NotificationType.RESERVATION_EXPIRED:
        return {
          title: 'Reservation Expired',
          body: `Your position reservation for payout position #${payload.position || ''} has expired.`,
        };

      case NotificationType.ACCOUNT_STATUS_CHANGED:
        return {
          title: 'Account Status Changed',
          body: `Your account status has been updated to ${payload.status || ''}.${
            payload.reason ? ` Reason: ${payload.reason}` : ''
          }`,
        };

      default:
        return {
          title: 'Notification',
          body: payload.message || 'You have a new update.',
        };
    }
  }
}

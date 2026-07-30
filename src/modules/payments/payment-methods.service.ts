import {
  Injectable,
  Inject,
  NotFoundException,
  UnprocessableEntityException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  IPaymentGateway,
  PAYMENT_GATEWAY,
} from './providers/payment-gateway.interface';
import { PaymentMethodType, MembershipStatus } from '@prisma/client';

export class VerifyCardDto {
  cardToken: string;
}

@Injectable()
export class PaymentMethodsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: any,
  ) {}

  async getCustomerPaymentMethods(customerId: string) {
    const methods = await this.prisma.paymentMethod.findMany({
      where: {
        customerId,
        removedAt: null,
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        type: true,
        maskedDisplay: true,
        isDefault: true,
        verificationStatus: true,
        createdAt: true,
      },
    });

    return methods;
  }

  async verifyAndAddPaymentMethod(customerId: string, cardToken: string) {
    const verification = await this.gateway.verifyCardToken(cardToken);

    if (!verification.success || !verification.providerToken) {
      throw new UnprocessableEntityException({
        reason: 'card_verification_failed',
        message:
          verification.failureReason ||
          'Card verification failed. Please check card details and retry.',
      });
    }

    // Unset existing defaults if this is customer's first card
    const existingCount = await this.prisma.paymentMethod.count({
      where: { customerId, removedAt: null },
    });

    const isDefault = existingCount === 0;

    const paymentMethod = await this.prisma.paymentMethod.create({
      data: {
        customerId,
        providerToken: verification.providerToken,
        type: PaymentMethodType.DEBIT_CARD,
        maskedDisplay: verification.maskedDisplay || 'Visa ending in 4242',
        isDefault,
        verificationStatus: 'VERIFIED',
      },
    });

    return {
      status: 'verified',
      paymentMethodId: paymentMethod.id,
      maskedDisplay: paymentMethod.maskedDisplay,
      isDefault: paymentMethod.isDefault,
    };
  }

  async setDefaultPaymentMethod(customerId: string, paymentMethodId: string) {
    const pm = await this.prisma.paymentMethod.findFirst({
      where: { id: paymentMethodId, customerId, removedAt: null },
    });

    if (!pm) {
      throw new NotFoundException(`Payment method not found`);
    }

    await this.prisma.$transaction(async (tx) => {
      // Clear defaults for this customer
      await tx.paymentMethod.updateMany({
        where: { customerId, removedAt: null },
        data: { isDefault: false },
      });

      // Set new default
      await tx.paymentMethod.update({
        where: { id: paymentMethodId },
        data: { isDefault: true },
      });
    });

    return { status: 'ok', defaultPaymentMethodId: paymentMethodId };
  }

  async deletePaymentMethod(customerId: string, paymentMethodId: string) {
    const pm = await this.prisma.paymentMethod.findFirst({
      where: { id: paymentMethodId, customerId, removedAt: null },
    });

    if (!pm) {
      throw new NotFoundException(`Payment method not found`);
    }

    // Active Circle Removal Guard:
    // Check if paymentMethodId is attached as defaultPaymentMethodId to any ACTIVE or PENDING_SIGNATURE membership
    const attachedMembership = await this.prisma.membership.findFirst({
      where: {
        defaultPaymentMethodId: paymentMethodId,
        status: { in: [MembershipStatus.ACTIVE, MembershipStatus.PENDING_SIGNATURE] },
      },
    });

    if (attachedMembership) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        reason: 'cannot_remove_active_circle_payment_method',
        message:
          'This payment method is linked to an active circle obligation. Please link another payment method to your circle before removing this one.',
      });
    }

    // Soft delete
    await this.prisma.paymentMethod.update({
      where: { id: paymentMethodId },
      data: {
        removedAt: new Date(),
        isDefault: false,
      },
    });

    return { status: 'deleted', paymentMethodId };
  }
}

import { Membership, Customer, Installment, InstallmentStatus } from '@prisma/client';

export class PublicMemberViewDto {
  displayName: string;
  payoutPosition: number;
  currentCyclePaymentStatus: 'paid' | 'pending';
  joinedAt: Date;
  isYou: boolean;
}

export function formatDisplayName(legalName?: string | null): string {
  if (!legalName || !legalName.trim()) {
    return 'Member';
  }
  const parts = legalName.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0];
  }
  const firstName = parts[0];
  const lastInitial = parts[parts.length - 1][0].toUpperCase();
  return `${firstName} ${lastInitial}.`;
}

export function mapToPublicMemberView(
  membership: Membership & {
    customer?: Partial<Customer> | null;
    installments?: Installment[];
  },
  requestingCustomerId?: string,
): PublicMemberViewDto {
  const isYou = Boolean(
    requestingCustomerId && membership.customerId === requestingCustomerId,
  );

  // Determine current cycle payment status
  let currentCyclePaymentStatus: 'paid' | 'pending' = 'pending';
  if (membership.installments && membership.installments.length > 0) {
    // Sort installments by cycleNumber descending to get latest cycle
    const sorted = [...membership.installments].sort(
      (a, b) => b.cycleNumber - a.cycleNumber,
    );
    const latestInstallment = sorted[0];
    if (latestInstallment.status === InstallmentStatus.PAID) {
      currentCyclePaymentStatus = 'paid';
    }
  }

  return {
    displayName: formatDisplayName(membership.customer?.legalName),
    payoutPosition: membership.payoutPosition,
    currentCyclePaymentStatus,
    joinedAt: membership.joinedAt,
    isYou,
  };
}

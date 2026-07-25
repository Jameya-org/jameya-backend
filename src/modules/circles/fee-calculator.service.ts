import { Injectable, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export interface FeeCalculationResult {
  gross: Prisma.Decimal;
  feeAmount: Prisma.Decimal;
  net: Prisma.Decimal;
  feePercentage: Prisma.Decimal;
}

export interface CircleFeeSnapshotSource {
  amount: Prisma.Decimal | number | string;
  feePolicySnapshot: any;
  durationMonths?: number;
}

@Injectable()
export class FeeCalculatorService {
  /**
   * Calculates net payout for a member given their payoutPosition (1-indexed).
   * Reads circle.feePolicySnapshot[payoutPosition] as a percentage.
   * Returns gross, feeAmount, net, and feePercentage as Prisma.Decimal.
   * 
   * Formula:
   *  gross = circle.amount
   *  feeAmount = gross * (feePercentage / 100)
   *  net = gross - feeAmount
   * 
   * Note:
   *  - Positive percentage = fee charged (net < gross)
   *  - Zero percentage = no fee (net == gross)
   *  - Negative percentage = cashback bonus (net > gross)
   */
  calculateNetPayout(
    circle: CircleFeeSnapshotSource,
    payoutPosition: number,
  ): FeeCalculationResult {
    if (!circle || !circle.feePolicySnapshot) {
      throw new BadRequestException('Circle fee policy snapshot is missing');
    }

    const snapshot = circle.feePolicySnapshot as Record<string, number | string>;
    const posKey = payoutPosition.toString();

    if (!(posKey in snapshot)) {
      throw new BadRequestException(
        `Payout position ${payoutPosition} not found in circle fee policy snapshot`,
      );
    }

    const feePercentageRaw = snapshot[posKey];
    const feePercentage = new Prisma.Decimal(feePercentageRaw);
    const gross = new Prisma.Decimal(circle.amount);

    // feeAmount = gross * (feePercentage / 100)
    const hundred = new Prisma.Decimal(100);
    const feeAmount = gross.mul(feePercentage).div(hundred);

    // net = gross - feeAmount
    const net = gross.sub(feeAmount);

    return {
      gross,
      feeAmount,
      net,
      feePercentage,
    };
  }
}

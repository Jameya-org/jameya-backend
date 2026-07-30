import { Injectable } from '@nestjs/common';
import {
  IPaymentGateway,
  CardVerificationResult,
  ChargeResult,
  ReconciliationResult,
} from './payment-gateway.interface';

@Injectable()
export class MockCardGatewayProvider implements IPaymentGateway {
  /**
   * Classify provider failure code into RETRYABLE vs NON_RETRYABLE
   */
  classifyFailure(errorCode: string): {
    category: 'RETRYABLE' | 'NON_RETRYABLE';
    safeReason: string;
  } {
    const codeUpper = (errorCode || '').toUpperCase();

    if (
      codeUpper.includes('INSUFFICIENT_FUNDS') ||
      codeUpper.includes('TIMEOUT') ||
      codeUpper.includes('GATEWAY_ERROR') ||
      codeUpper.includes('TEMPORARY') ||
      codeUpper.includes('SYSTEM_BUSY')
    ) {
      return {
        category: 'RETRYABLE',
        safeReason: 'Temporary processing delay or insufficient funds.',
      };
    }

    if (
      codeUpper.includes('INVALID_CARD') ||
      codeUpper.includes('EXPIRED_CARD') ||
      codeUpper.includes('BLOCKED') ||
      codeUpper.includes('CLOSED_ACCOUNT') ||
      codeUpper.includes('FRAUD') ||
      codeUpper.includes('RESTRICTED')
    ) {
      return {
        category: 'NON_RETRYABLE',
        safeReason: 'Payment method declined or restricted.',
      };
    }

    // Default fallback to RETRYABLE unless explicitly flagged as permanent failure
    return {
      category: 'RETRYABLE',
      safeReason: 'Transaction could not be completed. Will retry automatically.',
    };
  }

  async verifyCardToken(cardToken: string): Promise<CardVerificationResult> {
    if (!cardToken || cardToken.includes('invalid') || cardToken.includes('fail')) {
      return {
        success: false,
        failureReason: 'Invalid or restricted card token.',
      };
    }

    // Simulated test card tokenization & 1 EGP test auth check
    const last4 = cardToken.slice(-4) || '4242';
    return {
      success: true,
      providerToken: `tok_${Date.now()}_${cardToken}`,
      maskedDisplay: `Visa ending in ${last4}`,
    };
  }

  async chargeToken(
    providerToken: string,
    amount: number,
    idempotencyKey: string,
  ): Promise<ChargeResult> {
    // Check for test token triggers
    if (providerToken.includes('timeout')) {
      return {
        status: 'PENDING_VERIFICATION',
        providerReference: `ref_pending_${idempotencyKey}`,
        failureReason: 'Provider timeout, awaiting reconciliation.',
        failureCategory: 'RETRYABLE',
      };
    }

    if (providerToken.includes('non_retryable') || providerToken.includes('blocked')) {
      const classification = this.classifyFailure('BLOCKED');
      return {
        status: 'FAILED',
        providerReference: `ref_fail_${idempotencyKey}`,
        failureReason: classification.safeReason,
        failureCategory: classification.category,
      };
    }

    if (providerToken.includes('insufficient_funds')) {
      const classification = this.classifyFailure('INSUFFICIENT_FUNDS');
      return {
        status: 'FAILED',
        providerReference: `ref_fail_${idempotencyKey}`,
        failureReason: classification.safeReason,
        failureCategory: classification.category,
      };
    }

    // Successful payment charge
    return {
      status: 'SETTLED',
      providerReference: `ref_settled_${idempotencyKey}`,
    };
  }

  async reconcileTransaction(providerReference: string): Promise<ReconciliationResult> {
    if (providerReference.includes('fail')) {
      const classification = this.classifyFailure('INSUFFICIENT_FUNDS');
      return {
        status: 'FAILED',
        providerReference,
        failureReason: classification.safeReason,
        failureCategory: classification.category,
      };
    }

    return {
      status: 'SETTLED',
      providerReference,
    };
  }
}

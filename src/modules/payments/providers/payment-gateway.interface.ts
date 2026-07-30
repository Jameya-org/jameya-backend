export interface CardVerificationResult {
  success: boolean;
  providerToken?: string;
  maskedDisplay?: string;
  failureReason?: string;
}

export interface ChargeResult {
  status: 'SETTLED' | 'FAILED' | 'PENDING_VERIFICATION';
  providerReference?: string;
  failureReason?: string;
  failureCategory?: 'RETRYABLE' | 'NON_RETRYABLE';
}

export interface ReconciliationResult {
  status: 'SETTLED' | 'FAILED';
  providerReference?: string;
  failureReason?: string;
  failureCategory?: 'RETRYABLE' | 'NON_RETRYABLE';
}

export interface IPaymentGateway {
  verifyCardToken(cardToken: string): Promise<CardVerificationResult>;
  chargeToken(
    providerToken: string,
    amount: number,
    idempotencyKey: string,
  ): Promise<ChargeResult>;
  reconcileTransaction(providerReference: string): Promise<ReconciliationResult>;
}

export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

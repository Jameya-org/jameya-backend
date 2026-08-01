import { MockCardGatewayProvider } from './providers/mock-card-gateway.provider';

describe('Gateway Retry Policy & Error Classification (FR-12)', () => {
  let gateway: MockCardGatewayProvider;

  beforeEach(() => {
    gateway = new MockCardGatewayProvider();
  });

  describe('classifyFailure', () => {
    it('should classify insufficient funds as RETRYABLE', () => {
      const result = gateway.classifyFailure('INSUFFICIENT_FUNDS');
      expect(result.category).toBe('RETRYABLE');
      expect(result.safeReason).toContain('insufficient funds');
    });

    it('should classify gateway timeout as RETRYABLE', () => {
      const result = gateway.classifyFailure('TIMEOUT_ERROR');
      expect(result.category).toBe('RETRYABLE');
    });

    it('should classify invalid card or blocked card as NON_RETRYABLE', () => {
      const resultBlocked = gateway.classifyFailure('BLOCKED_CARD');
      expect(resultBlocked.category).toBe('NON_RETRYABLE');

      const resultInvalid = gateway.classifyFailure('INVALID_CARD_NUMBER');
      expect(resultInvalid.category).toBe('NON_RETRYABLE');

      const resultFraud = gateway.classifyFailure('FRAUD_FLAG');
      expect(resultFraud.category).toBe('NON_RETRYABLE');
    });
  });

  describe('chargeToken', () => {
    it('should settle charge when valid token is provided', async () => {
      const res = await gateway.chargeToken('valid_token_123', 500, 'idempotency_1');
      expect(res.status).toBe('SETTLED');
      expect(res.providerReference).toBeDefined();
    });

    it('should flag NON_RETRYABLE failure for blocked token', async () => {
      const res = await gateway.chargeToken('tok_blocked_card', 500, 'idempotency_2');
      expect(res.status).toBe('FAILED');
      expect(res.failureCategory).toBe('NON_RETRYABLE');
    });

    it('should flag RETRYABLE failure for insufficient funds token', async () => {
      const res = await gateway.chargeToken('tok_insufficient_funds', 500, 'idempotency_3');
      expect(res.status).toBe('FAILED');
      expect(res.failureCategory).toBe('RETRYABLE');
    });

    it('should flag PENDING_VERIFICATION for timeout token', async () => {
      const res = await gateway.chargeToken('tok_timeout', 500, 'idempotency_4');
      expect(res.status).toBe('PENDING_VERIFICATION');
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsWebhookController } from './payments-webhook.controller';
import { PrismaService } from '../../prisma/prisma.service';
import { LedgerService } from './ledger.service';
import { TransactionStatus } from '@prisma/client';

describe('PaymentsWebhookController (Idempotency)', () => {
  let controller: PaymentsWebhookController;
  let prismaService: any;
  let ledgerService: any;

  beforeEach(async () => {
    prismaService = {
      transaction: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    ledgerService = {
      postInstallmentCollection: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentsWebhookController],
      providers: [
        { provide: PrismaService, useValue: prismaService },
        { provide: LedgerService, useValue: ledgerService },
      ],
    }).compile();

    controller = module.get<PaymentsWebhookController>(PaymentsWebhookController);
  });

  it('should ignore webhook payload if idempotencyKey is missing', async () => {
    const res = await controller.handleGatewayWebhook({
      idempotencyKey: '',
      status: 'SUCCESS',
    });
    expect(res.status).toBe('ignored');
    expect(res.reason).toBe('missing_idempotency_key');
  });

  it('should return already_settled without calling ledger posting for duplicate settled callback', async () => {
    prismaService.transaction.findUnique.mockResolvedValue({
      id: 'tx_123',
      status: TransactionStatus.SETTLED,
      idempotencyKey: 'idemp_key_1',
    });

    const res = await controller.handleGatewayWebhook({
      idempotencyKey: 'idemp_key_1',
      status: 'SUCCESS',
    });

    expect(res.status).toBe('already_settled');
    expect(ledgerService.postInstallmentCollection).not.toHaveBeenCalled();
  });

  it('should post ledger entries for first-time successful webhook', async () => {
    prismaService.transaction.findUnique.mockResolvedValue({
      id: 'tx_456',
      status: TransactionStatus.PENDING,
      idempotencyKey: 'idemp_key_2',
    });

    ledgerService.postInstallmentCollection.mockResolvedValue({
      alreadySettled: false,
      receiptReference: 'RCPT-123',
    });

    const res = await controller.handleGatewayWebhook({
      idempotencyKey: 'idemp_key_2',
      status: 'SUCCESS',
    });

    expect(res.status).toBe('settled');
    expect(ledgerService.postInstallmentCollection).toHaveBeenCalledWith('tx_456');
  });
});

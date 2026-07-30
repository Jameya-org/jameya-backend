import { Controller, Post, Body, Headers, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { LedgerService } from './ledger.service';
import { TransactionStatus } from '@prisma/client';

@ApiTags('Webhooks - Payments')
@Controller('payments/webhook')
export class PaymentsWebhookController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: LedgerService,
  ) {}

  @Post('gateway')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Handle Card Gateway Callback Webhook (Idempotent)' })
  async handleGatewayWebhook(
    @Body() payload: { idempotencyKey: string; status: string; providerReference?: string },
    @Headers('x-gateway-signature') signature?: string,
  ) {
    // Signature verification check placeholder (in prod, verify HMAC-SHA256 signature header)
    const idempotencyKey = payload.idempotencyKey;
    if (!idempotencyKey) {
      return { status: 'ignored', reason: 'missing_idempotency_key' };
    }

    const transaction = await this.prisma.transaction.findUnique({
      where: { idempotencyKey },
    });

    if (!transaction) {
      return { status: 'ignored', reason: 'transaction_not_found' };
    }

    // Deduplication check: duplicate callback for already-settled transaction is a no-op
    if (transaction.status === TransactionStatus.SETTLED) {
      return { status: 'already_settled', transactionId: transaction.id };
    }

    if (payload.status === 'SUCCESS' || payload.status === 'SETTLED') {
      const result = await this.ledgerService.postInstallmentCollection(
        transaction.id,
      );
      return { status: 'settled', result };
    }

    // Failed webhook payload handling
    await this.prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        status: TransactionStatus.FAILED,
        failureReason: 'Gateway webhook reported transaction failure.',
      },
    });

    return { status: 'failed_recorded', transactionId: transaction.id };
  }
}

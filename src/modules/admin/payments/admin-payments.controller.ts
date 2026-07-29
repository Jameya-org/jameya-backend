import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminJwtGuard } from '../auth/guards/admin-jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { AdminPaymentsService } from './admin-payments.service';
import {
  FlagPaymentProofDto,
  HoldTransactionDto,
  ReviewPaymentProofDto,
} from './dto/payment-actions.dto';

@ApiTags('Admin – Payments')
@ApiBearerAuth('access-token')
@UseGuards(AdminJwtGuard, RolesGuard)
@Controller('admin')
export class AdminPaymentsController {
  constructor(private readonly paymentsService: AdminPaymentsService) {}

  @Get('payment-proofs')
  @RequirePermissions('paymentProofs:review')
  @ApiOperation({ summary: 'List all pending manual payment proof submissions' })
  listPendingProofs() {
    return this.paymentsService.listPendingProofs();
  }

  @Patch('payment-proofs/:id/review')
  @RequirePermissions('paymentProofs:review')
  @ApiOperation({ summary: 'Approve or reject a payment proof — reason required on REJECTED' })
  reviewProof(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewPaymentProofDto,
    @Req() req: any,
  ) {
    return this.paymentsService.reviewProof(id, req.user.id, dto, req.ip);
  }

  @Patch('payment-proofs/:id/flag')
  @RequirePermissions('paymentProofs:flag')
  @ApiOperation({ summary: 'Flag a payment proof for investigation — reason required' })
  flagProof(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FlagPaymentProofDto,
    @Req() req: any,
  ) {
    return this.paymentsService.flagProof(id, req.user.id, dto, req.ip);
  }

  @Patch('transactions/:id/hold')
  @RequirePermissions('transactions:hold')
  @ApiOperation({ summary: 'Place a transaction on hold for investigation — reason required' })
  holdTransaction(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: HoldTransactionDto,
    @Req() req: any,
  ) {
    return this.paymentsService.holdTransaction(id, req.user.id, dto, req.ip);
  }
}

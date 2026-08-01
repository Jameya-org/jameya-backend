import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PaymentMethodsService } from './payment-methods.service';

@ApiTags('Customer - Payment Methods')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('customer/payment-methods')
export class CustomerPaymentMethodsController {
  constructor(private readonly paymentMethodsService: PaymentMethodsService) {}

  @Get()
  @ApiOperation({ summary: 'Get saved payment methods on customer profile' })
  async getPaymentMethods(@Req() req: any) {
    return this.paymentMethodsService.getCustomerPaymentMethods(req.user.id);
  }

  @Post('verify')
  @ApiOperation({ summary: 'Verify and save a new Visa/Card token to customer profile' })
  async verifyAndAddCard(@Req() req: any, @Body() body: { cardToken: string }) {
    return this.paymentMethodsService.verifyAndAddPaymentMethod(
      req.user.id,
      body.cardToken,
    );
  }

  @Patch(':id/set-default')
  @ApiOperation({ summary: 'Set default payment method' })
  async setDefault(@Req() req: any, @Param('id') id: string) {
    return this.paymentMethodsService.setDefaultPaymentMethod(req.user.id, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove a payment method from customer profile' })
  async deletePaymentMethod(@Req() req: any, @Param('id') id: string) {
    return this.paymentMethodsService.deletePaymentMethod(req.user.id, id);
  }
}

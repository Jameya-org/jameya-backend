import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { InstallmentsService } from './installments.service';
import { SubmitManualProofDto } from './dto/submit-manual-proof.dto';

@ApiTags('Customer - Installments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('customer/installments')
export class CustomerInstallmentsController {
  constructor(private readonly installmentsService: InstallmentsService) {}

  @Get()
  @ApiOperation({ summary: 'Get current balance, next due, and full schedule by circle (FR-11)' })
  async getSchedule(@Req() req: any) {
    return this.installmentsService.getCustomerSchedule(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get single installment details, attempt history, and receipt if paid (FR-11)' })
  async getDetails(@Req() req: any, @Param('id') id: string) {
    return this.installmentsService.getInstallmentDetails(req.user.id, id);
  }

  @Post(':id/submit-proof')
  @ApiOperation({ summary: 'Submit manual payment proof (Vodafone Cash / InstaPay) - Feature Flagged' })
  async submitProof(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: SubmitManualProofDto,
  ) {
    return this.installmentsService.submitManualProof(req.user.id, id, dto);
  }
}

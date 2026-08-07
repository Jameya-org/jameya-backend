import { Controller, Get, Patch, Post, Body, Param, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { KycService } from './kyc.service';
import { ReviewDocumentDto } from './dto/review-document.dto';
import { CreateEligibilityDto } from './dto/create-eligibility.dto';
import { AdminJwtGuard } from 'src/modules/admin/auth/guards/admin-jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';

@ApiTags('Admin / KYC & Eligibility')
@ApiBearerAuth('access-token')
@UseGuards(AdminJwtGuard, RolesGuard)
@Controller('admin/kyc')
export class KycController {
  constructor(private readonly kycService: KycService) {}

  @Get('pending-documents')
  @RequirePermissions('kyc:read')
  @ApiOperation({ summary: 'List all submitted documents awaiting admin review' })
  async getPendingDocuments() {
    return this.kycService.getPendingDocuments();
  }

  @Patch('documents/:id/review')
  @RequirePermissions('kyc:write')
  @ApiOperation({ summary: 'Approve or reject a submitted customer document' })
  async reviewDocument(
    @Param('id') id: string,
    @Req() req: any,
    @Body() dto: ReviewDocumentDto,
  ) {
    return this.kycService.reviewDocument(id, req.user.id, dto);
  }

  @Post('eligibility')
  @RequirePermissions('kyc:write')
  @ApiOperation({ summary: 'Assign trust score and participation budget/limit to customer' })
  async createEligibilityDecision(
    @Req() req: any,
    @Body() dto: CreateEligibilityDto,
  ) {
    return this.kycService.createEligibilityDecision(req.user.id, dto);
  }
}

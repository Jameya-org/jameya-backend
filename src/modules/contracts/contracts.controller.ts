import { Controller, Get, Param, ParseUUIDPipe, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import type { Response } from 'express';
import { ContractsService } from './contracts.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

interface AuthenticatedRequest extends Request {
  user: { id: string; email: string; mobileNumber: string };
}

@ApiTags('Customer – Signed Contracts (FR-10)')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('customer/contracts')
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  @Get()
  @ApiOperation({ summary: 'List all signed contracts for the authenticated customer (FR-10)' })
  @ApiResponse({ status: 200, description: 'List of signed contracts with cryptographic hashes' })
  async getMyContracts(@Req() req: AuthenticatedRequest) {
    return this.contractsService.getCustomerContracts(req.user.id);
  }

  @Get(':membershipId')
  @ApiOperation({ summary: 'Get signed contract details by membership ID (FR-10)' })
  @ApiResponse({ status: 200, description: 'Contract details, PDF reference, and signature evidence' })
  @ApiResponse({ status: 404, description: 'Contract not found' })
  async getContractByMembershipId(
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.contractsService.getContractByMembershipId(req.user.id, membershipId);
  }

  @Get(':membershipId/download')
  @ApiOperation({
    summary: 'Download contract as PDF (draft or signed) (FR-10)',
    description:
      'Streams the membership contract as a PDF. Returns a draft watermark if not yet signed, or the final signed version with full evidence.',
  })
  @ApiResponse({ status: 200, description: 'PDF file stream' })
  @ApiResponse({ status: 404, description: 'Membership not found' })
  async downloadContract(
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    const pdfBuffer = await this.contractsService.renderContractForDownload(
      req.user.id,
      membershipId,
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="jameya-contract-${membershipId}.pdf"`,
    );
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader('Cache-Control', 'no-store');
    res.end(Buffer.from(pdfBuffer));
  }
}

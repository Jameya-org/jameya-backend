import { Controller, Get, Param, ParseUUIDPipe, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
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
}

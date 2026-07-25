import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { FeePoliciesService } from './fee-policies.service';
import { AdminJwtGuard } from '../../admin/auth/guards/admin-jwt.guard';

@ApiTags('Fee Policies')
@ApiBearerAuth('access-token')
@UseGuards(AdminJwtGuard)
@Controller('circles/fee-policies')
export class FeePoliciesController {
  constructor(private readonly feePoliciesService: FeePoliciesService) {}

  @Get()
  @ApiOperation({ summary: 'List all active fee policies (used to populate admin dropdowns)' })
  @ApiResponse({ status: 200, description: 'List of active fee policies' })
  findAll() {
    return this.feePoliciesService.findAllActive();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a fee policy by ID' })
  @ApiResponse({ status: 200, description: 'Fee policy details' })
  @ApiResponse({ status: 404, description: 'Fee policy not found' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.feePoliciesService.findOne(id);
  }
}

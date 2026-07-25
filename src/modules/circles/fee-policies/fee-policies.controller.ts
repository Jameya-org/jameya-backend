import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  ParseIntPipe,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { FeePoliciesService } from './fee-policies.service';
import { AdminJwtGuard } from '../../admin/auth/guards/admin-jwt.guard';
import { RolesGuard } from '../../admin/auth/guards/roles.guard';
import { CreateFeePolicyDto } from './dto/create-fee-policy.dto';
import { ActivateFeePolicyDto } from './dto/activate-fee-policy.dto';
import { FeePolicyStatus } from '@prisma/client';

@ApiTags('Admin – Fee Policies')
@ApiBearerAuth('access-token')
@UseGuards(AdminJwtGuard, RolesGuard)
@Controller('admin/fee-policies')
export class FeePoliciesController {
  constructor(private readonly feePoliciesService: FeePoliciesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new draft fee policy (admin only)' })
  @ApiResponse({ status: 201, description: 'Draft fee policy created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid positionFees or duration' })
  createDraft(@Body() dto: CreateFeePolicyDto, @Req() req: any) {
    return this.feePoliciesService.createDraft(dto, req.user?.id);
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activate a draft fee policy (requires audit reason)' })
  @ApiResponse({ status: 200, description: 'Fee policy activated successfully' })
  @ApiResponse({ status: 400, description: 'Policy already active/retired or missing reason' })
  @ApiResponse({ status: 404, description: 'Fee policy not found' })
  activate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActivateFeePolicyDto,
    @Req() req: any,
  ) {
    return this.feePoliciesService.activate(id, dto, req.user?.id);
  }

  @Get('active')
  @ApiOperation({ summary: 'Get the currently active fee policy for a given duration' })
  @ApiQuery({ name: 'duration', required: true, example: 6, description: 'Duration in months (6, 10, 12)' })
  @ApiResponse({ status: 200, description: 'Active fee policy details' })
  @ApiResponse({ status: 404, description: 'No active fee policy for duration' })
  findActiveByDuration(@Query('duration', ParseIntPipe) duration: number) {
    return this.feePoliciesService.findActiveByDuration(duration);
  }

  @Get()
  @ApiOperation({ summary: 'List all fee policies with optional status filter' })
  @ApiQuery({ name: 'status', enum: FeePolicyStatus, required: false })
  @ApiResponse({ status: 200, description: 'List of fee policies' })
  findAll(@Query('status') status?: FeePolicyStatus) {
    return this.feePoliciesService.findAll(status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a fee policy by ID' })
  @ApiResponse({ status: 200, description: 'Fee policy details' })
  @ApiResponse({ status: 404, description: 'Fee policy not found' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.feePoliciesService.findOne(id);
  }
}

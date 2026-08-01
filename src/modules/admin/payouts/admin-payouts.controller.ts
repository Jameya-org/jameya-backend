import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Req,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AdminJwtGuard } from '../auth/guards/admin-jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { AdminPayoutsService } from './admin-payouts.service';

@ApiTags('Admin - Payouts')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard, RolesGuard)
@Controller('admin/payouts')
export class AdminPayoutsController {
  constructor(private readonly payoutsService: AdminPayoutsService) {}

  @Get()
  @ApiOperation({ summary: 'List payouts with status filter, search, summary header, and pagination' })
  getPayouts(
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.payoutsService.getPayouts({ status, search, page, limit });
  }

  @Patch(':id/confirm')
  @RequirePermissions('payouts:confirm')
  @ApiOperation({ summary: 'Single admin action to confirm and disburse payout (idempotent)' })
  confirmPayout(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
  ) {
    const adminId = req.user?.id;
    const requestContext = {
      ipAddress: req.ip,
      deviceInfo: req.headers['user-agent'],
    };
    return this.payoutsService.confirmPayout(id, adminId, requestContext);
  }
}

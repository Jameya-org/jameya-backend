import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  Req,
  ParseUUIDPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AdminJwtGuard } from '../auth/guards/admin-jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { AdminMembershipsService } from './admin-memberships.service';
import { QueryMembershipsDto } from './dto/query-memberships.dto';
import { ReleaseMembershipDto } from './dto/release-membership.dto';
import { MarkDefaultedDto } from './dto/mark-defaulted.dto';

@ApiTags('Admin – Memberships (ADM-07 Exceptions)')
@ApiBearerAuth('access-token')
@UseGuards(AdminJwtGuard, RolesGuard)
@Controller('admin/memberships')
export class AdminMembershipsController {
  constructor(
    private readonly adminMembershipsService: AdminMembershipsService,
  ) {}

  @Get()
  @RequirePermissions('circles:read')
  @ApiOperation({
    summary:
      'List memberships — filter by status=pending_signature or usedEligibilityOverride=true (ADM-07)',
  })
  @ApiResponse({ status: 200, description: 'List of matching memberships' })
  getMemberships(@Query() query: QueryMembershipsDto) {
    return this.adminMembershipsService.getMemberships(query);
  }

  @Post(':id/release')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('circles:configure')
  @ApiOperation({
    summary:
      'Manual admin release of a stuck PENDING_SIGNATURE reservation — requires reason (ADM-07)',
  })
  @ApiResponse({ status: 200, description: 'Reservation released successfully' })
  @ApiResponse({ status: 404, description: 'Membership not found' })
  @ApiResponse({ status: 422, description: 'Membership not in PENDING_SIGNATURE status' })
  releaseMembership(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReleaseMembershipDto,
    @Req() req: any,
  ) {
    return this.adminMembershipsService.releaseMembership(
      id,
      dto,
      req.user?.id,
      req.ip,
    );
  }

  @Post(':id/mark-defaulted')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('circles:configure')
  @ApiOperation({
    summary:
      'Mark a delinquent membership as DEFAULTED — requires reason and writes audit log',
  })
  @ApiResponse({ status: 200, description: 'Membership marked as DEFAULTED' })
  @ApiResponse({ status: 404, description: 'Membership not found' })
  markDefaulted(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MarkDefaultedDto,
    @Req() req: any,
  ) {
    return this.adminMembershipsService.markDefaulted(
      id,
      dto,
      req.user?.id,
      req.ip,
    );
  }
}


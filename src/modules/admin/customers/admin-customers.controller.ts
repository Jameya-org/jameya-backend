import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminJwtGuard } from '../auth/guards/admin-jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { AdminCustomersService } from './admin-customers.service';
import { ListCustomersQueryDto } from './dto/list-customers-query.dto';
import { UpdateCustomerStatusDto } from './dto/update-customer-status.dto';

@ApiTags('Admin – Customers')
@ApiBearerAuth('access-token')
@UseGuards(AdminJwtGuard, RolesGuard)
@Controller('admin/customers')
export class AdminCustomersController {
  constructor(private readonly adminCustomersService: AdminCustomersService) {}

  @Get()
  @RequirePermissions('customers:read')
  @ApiOperation({ summary: 'List customers with pagination and filters' })
  listCustomers(@Query() query: ListCustomersQueryDto) {
    return this.adminCustomersService.listCustomers(query);
  }

  @Get(':id')
  @RequirePermissions('customers:read')
  @ApiOperation({ summary: 'Get full customer profile including KYC, documents, and memberships' })
  getCustomer(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminCustomersService.getCustomerById(id);
  }

  @Patch(':id/status')
  @RequirePermissions('customers:suspend')
  @ApiOperation({ summary: 'Update customer account status — reason required' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerStatusDto,
    @Req() req: any,
  ) {
    return this.adminCustomersService.updateCustomerStatus(id, dto, req.user.id, req.ip);
  }
}

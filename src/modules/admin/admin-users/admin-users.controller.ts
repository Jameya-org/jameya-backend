import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminJwtGuard } from '../auth/guards/admin-jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { AdminUsersService } from './admin-users.service';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { UpdateAdminStatusDto } from './dto/update-admin-status.dto';
import { UpdateAdminRoleDto } from './dto/update-admin-role.dto';

@ApiTags('Admin – User Management')
@ApiBearerAuth('access-token')
@UseGuards(AdminJwtGuard, RolesGuard)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Get()
  @RequirePermissions('admins:read')
  @ApiOperation({ summary: 'List all admin accounts' })
  listAdmins() {
    return this.adminUsersService.listAdmins();
  }

  @Post()
  @RequirePermissions('admins:manage')
  @ApiOperation({ summary: 'Create a new admin account' })
  createAdmin(@Body() dto: CreateAdminUserDto, @Req() req: any) {
    return this.adminUsersService.createAdmin(dto, req.user.id);
  }

  @Patch(':id/status')
  @RequirePermissions('admins:manage')
  @ApiOperation({ summary: 'Update admin account status (suspend / reactivate) — reason required' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAdminStatusDto,
    @Req() req: any,
  ) {
    return this.adminUsersService.updateStatus(id, dto, req.user.id, req.ip);
  }

  @Patch(':id/role')
  @RequirePermissions('admins:manage')
  @ApiOperation({ summary: 'Change the role assigned to an admin — reason required' })
  updateRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAdminRoleDto,
    @Req() req: any,
  ) {
    return this.adminUsersService.updateRole(id, dto, req.user.id, req.ip);
  }
}

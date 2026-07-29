import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminJwtGuard } from '../auth/guards/admin-jwt.guard';
import { AdminProfileService } from './admin-profile.service';
import { ChangePasswordDto } from './dto/change-password.dto';

@ApiTags('Admin – Profile')
@ApiBearerAuth('access-token')
@UseGuards(AdminJwtGuard)
@Controller('admin/profile')
export class AdminProfileController {
  constructor(private readonly profileService: AdminProfileService) {}

  @Get()
  @ApiOperation({ summary: "Get the logged-in admin's own profile" })
  getProfile(@Req() req: any) {
    return this.profileService.getProfile(req.user.id);
  }

  @Patch('password')
  @ApiOperation({ summary: 'Change own password (revokes all existing sessions)' })
  changePassword(@Req() req: any, @Body() dto: ChangePasswordDto) {
    return this.profileService.changePassword(req.user.id, dto, req.ip);
  }
}

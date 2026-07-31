import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  UseGuards,
  Req,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationService } from './notifications.service';
import { GetNotificationsQueryDto } from './dto/get-notifications-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

interface AuthenticatedRequest extends Request {
  user: { id: string; email: string; mobileNumber: string };
}

@ApiTags('Customer / Notifications')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('customer/notifications')
export class NotificationsController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @ApiOperation({ summary: 'Get customer in-app notifications (paginated, filter by ?unread=true)' })
  async getNotifications(
    @Req() req: AuthenticatedRequest,
    @Query() query: GetNotificationsQueryDto,
  ) {
    return this.notificationService.getNotifications(req.user.id, query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count badge counter' })
  async getUnreadCount(@Req() req: AuthenticatedRequest) {
    return this.notificationService.getUnreadCount(req.user.id);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read for current customer' })
  async markAllAsRead(@Req() req: AuthenticatedRequest) {
    return this.notificationService.markAllAsRead(req.user.id);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a specific notification as read by ID' })
  async markAsRead(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notificationService.markAsRead(req.user.id, id);
  }
}

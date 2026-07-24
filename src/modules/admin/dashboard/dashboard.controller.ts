import { Controller, Get } from '@nestjs/common';

@Controller('admin/dashboard')
export class DashboardController {
  @Get()
  getDashboard(): { status: string } {
    return { status: 'ok' };
  }
}

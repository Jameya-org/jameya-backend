import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CustomerCirclesService } from './customer-circles.service';
import { BrowseCirclesQueryDto } from './dto/browse-circles-query.dto';

interface AuthenticatedRequest extends Request {
  user: { id: string; email: string; mobileNumber: string };
}

@ApiTags('Customer – Circles & Home Discovery')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('customer')
export class CustomerCirclesController {
  constructor(
    private readonly customerCirclesService: CustomerCirclesService,
  ) {}

  @Get('circles')
  @ApiOperation({
    summary: 'Browse open upcoming circles (unfiltered by eligibility)',
  })
  @ApiResponse({ status: 200, description: 'Paginated list of upcoming circles' })
  async browseCircles(@Query() query: BrowseCirclesQueryDto) {
    return this.customerCirclesService.browseCircles(query);
  }

  @Get('circles/:id')
  @ApiOperation({ summary: 'Get circle detail with structurally masked member view' })
  @ApiResponse({ status: 200, description: 'Circle detail and masked members list' })
  @ApiResponse({ status: 404, description: 'Circle not found' })
  async getCircleDetail(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.customerCirclesService.getCircleDetail(id, req.user.id);
  }

  @Get('home')
  @ApiOperation({ summary: 'Customer home dashboard and recommended circles' })
  @ApiResponse({ status: 200, description: 'Personalized recommendations and obligations summary' })
  async getHomeRecommendations(@Req() req: AuthenticatedRequest) {
    return this.customerCirclesService.getHomeRecommendations(req.user.id);
  }

  @Post('circles/:id/join-intent')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pre-check eligibility and capacity before joining flow' })
  @ApiResponse({ status: 200, description: 'Customer is allowed to proceed to join flow' })
  @ApiResponse({ status: 422, description: 'Pre-check failed with structured reason' })
  async checkJoinIntent(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.customerCirclesService.checkJoinIntent(id, req.user.id);
  }

  @Get('circles/:id/positions')
  @ApiOperation({
    summary: 'Near-real-time live position availability and fee preview',
  })
  @ApiResponse({ status: 200, description: 'Position slots with fee calculation previews' })
  async getPositionAvailability(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    return this.customerCirclesService.getPositionAvailability(id);
  }
}

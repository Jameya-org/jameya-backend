import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
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
import { StartJoinDto } from './dto/start-join.dto';
import { AcceptContractDto } from './dto/accept-contract.dto';
import { VerifySignatureOtpDto } from './dto/verify-signature-otp.dto';

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

  @Post('circles/:id/join')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'ENDPOINT 1: Start join reservation (15-min TTL, draft contract generated)' })
  @ApiResponse({ status: 201, description: 'Position reserved successfully, draft contract reference returned' })
  @ApiResponse({ status: 409, description: 'Position taken' })
  @ApiResponse({ status: 422, description: 'Eligibility, capacity, or overdue installment check failed' })
  async startJoin(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StartJoinDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.customerCirclesService.startJoin(id, req.user.id, dto);
  }

  @Post('join/:membershipId/contract/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'ENDPOINT 3: Accept contract terms & request signature OTP' })
  @ApiResponse({ status: 200, description: 'Explicit consent accepted and signature OTP sent' })
  @ApiResponse({ status: 410, description: 'Reservation expired' })
  async acceptContract(
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Body() dto: AcceptContractDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.customerCirclesService.acceptContract(membershipId, req.user.id, dto);
  }

  @Post('join/:membershipId/contract/verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'ENDPOINT 4: Verify signature OTP & finalize membership' })
  @ApiResponse({ status: 200, description: 'OTP verified, contract finalized, membership activated, installments generated' })
  @ApiResponse({ status: 400, description: 'Invalid or expired OTP' })
  @ApiResponse({ status: 410, description: 'Reservation expired' })
  async verifyContractOtp(
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Body() dto: VerifySignatureOtpDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const requestContext = {
      ipAddress: (req.headers['x-forwarded-for'] as string) || (req as any).ip || '127.0.0.1',
      deviceInfo: (req.headers['user-agent'] as string) || 'unknown',
    };
    return this.customerCirclesService.verifyContractOtpAndFinalize(
      membershipId,
      req.user.id,
      dto,
      requestContext,
    );
  }
}

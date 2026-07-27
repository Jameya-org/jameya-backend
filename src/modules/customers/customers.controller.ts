import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CustomersService } from './customers.service';
import { CreateIdentityProfileDto } from './dto/create-identity-profile.dto';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

/** Shape of `req.user` populated by JwtAuthGuard / JwtStrategy */
interface AuthenticatedRequest extends Request {
  user: { id: string; mobileNumber: string };
}

@ApiTags('Customer / Profile & Verification')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post('profile')
  @ApiOperation({ summary: 'Submit or update legal identity profile details' })
  async completeProfile(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateIdentityProfileDto,
  ) {
    return this.customersService.createOrUpdateProfile(req.user.id, dto);
  }

  @Post('documents')
  @ApiOperation({ summary: 'Upload verification document (National ID, Income Proof, etc.)' })
  async uploadDocument(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UploadDocumentDto,
  ) {
    return this.customersService.uploadDocument(req.user.id, dto);
  }

  @Get('kyc-status')
  @ApiOperation({ summary: 'Get aggregated customer KYC status, documents, and eligibility' })
  async getKycStatus(@Req() req: AuthenticatedRequest) {
    return this.customersService.getMyKycStatus(req.user.id);
  }
}
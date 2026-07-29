import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  Query,
  Req,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { CirclesService } from '../../circles/circles.service';
import { CreateCircleDto } from '../../circles/dto/create-circle.dto';
import { CircleStatus } from '@prisma/client';
import { AdminJwtGuard } from '../auth/guards/admin-jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';

class CancelCircleDto {
  @IsString()
  @IsNotEmpty({ message: 'reason is required when cancelling a circle' })
  reason: string;
}

class ActivateCircleDto {
  @IsString()
  @IsOptional()
  reason?: string;
}

@ApiTags('Admin – Circles')
@ApiBearerAuth('access-token')
@UseGuards(AdminJwtGuard, RolesGuard)
@Controller('admin/circles')
export class AdminCirclesController {
  constructor(private readonly circlesService: CirclesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('circles:create')
  @ApiOperation({ summary: 'Create a new circle draft (auto-looks up active fee policy)' })
  @ApiResponse({ status: 201, description: 'Circle created in DRAFT status' })
  @ApiResponse({ status: 400, description: 'Invalid business logic (amount/capacity mismatch)' })
  @ApiResponse({ status: 422, description: 'No active fee policy found for duration' })
  createCircle(@Body() dto: CreateCircleDto, @Req() req: any) {
    return this.circlesService.createCircle(dto, req.user?.id);
  }

  @Get()
  @RequirePermissions('circles:read')
  @ApiOperation({ summary: 'List all circles with optional status filter' })
  @ApiQuery({ name: 'status', enum: CircleStatus, required: false })
  getAllCircles(@Query('status') status?: CircleStatus) {
    return this.circlesService.getAllCircles(status);
  }

  @Get(':id')
  @RequirePermissions('circles:read')
  @ApiOperation({ summary: 'Get a single circle by ID (includes memberships)' })
  @ApiResponse({ status: 404, description: 'Circle not found' })
  getCircleById(@Param('id', ParseUUIDPipe) id: string) {
    return this.circlesService.getCircleById(id);
  }

  @Patch(':id')
  @RequirePermissions('circles:configure')
  @ApiOperation({ summary: 'Edit circle properties — only core property changes past DRAFT require a reason (BR-05)' })
  @ApiResponse({ status: 409, description: 'Core property change past DRAFT without reason' })
  updateCircleProperties(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<CreateCircleDto> & { reason?: string },
    @Req() req?: any,
  ) {
    return this.circlesService.updateCircleProperties(id, dto, req?.user?.id, dto.reason);
  }

  @Patch(':id/activate')
  @RequirePermissions('circles:activate')
  @ApiOperation({ summary: 'Activate a DRAFT circle — moves it to UPCOMING and locks fee policy' })
  @ApiBody({ type: ActivateCircleDto, required: false })
  @ApiResponse({ status: 409, description: 'Invalid state transition' })
  activateCircle(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ActivateCircleDto,
    @Req() req: any,
  ) {
    return this.circlesService.updateCircleStatus(
      id,
      CircleStatus.UPCOMING,
      req.user?.id,
      body?.reason,
    );
  }

  @Patch(':id/cancel')
  @RequirePermissions('circles:cancel')
  @ApiOperation({ summary: 'Cancel a circle at any stage — reason required (SRS 8.1)' })
  @ApiResponse({ status: 409, description: 'Invalid state transition' })
  cancelCircle(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CancelCircleDto,
    @Req() req: any,
  ) {
    return this.circlesService.updateCircleStatus(
      id,
      CircleStatus.CANCELLED,
      req.user?.id,
      body.reason,
    );
  }
}

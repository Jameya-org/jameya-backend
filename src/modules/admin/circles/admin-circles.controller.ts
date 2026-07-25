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
} from '@nestjs/swagger';
import { CirclesService } from '../../circles/circles.service';
import { CreateCircleDto } from '../../circles/dto/create-circle.dto';
import { CircleStatus } from '@prisma/client';

import { AdminJwtGuard } from '../auth/guards/admin-jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

@ApiTags('Admin – Circles')
@ApiBearerAuth('access-token')
@UseGuards(AdminJwtGuard, RolesGuard)
@Controller('admin/circles')
export class AdminCirclesController {
  constructor(private readonly circlesService: CirclesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new circle (admin only, auto-looks up active fee policy)' })
  @ApiResponse({ status: 201, description: 'Circle created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid business logic (e.g. amount mismatch, capacity mismatch)' })
  @ApiResponse({ status: 422, description: 'No active fee policy found for duration' })
  createCircle(@Body() dto: CreateCircleDto, @Req() req: any) {
    return this.circlesService.createCircle(dto, req.user?.id);
  }

  @Get()
  @ApiOperation({ summary: 'List all circles with optional status filter' })
  @ApiQuery({ name: 'status', enum: CircleStatus, required: false })
  @ApiResponse({ status: 200, description: 'List of circles' })
  getAllCircles(@Query('status') status?: CircleStatus) {
    return this.circlesService.getAllCircles(status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single circle by ID (includes memberships)' })
  @ApiResponse({ status: 200, description: 'Circle details' })
  @ApiResponse({ status: 404, description: 'Circle not found' })
  getCircleById(@Param('id', ParseUUIDPipe) id: string) {
    return this.circlesService.getCircleById(id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update circle status with state machine transition rules' })
  @ApiQuery({ name: 'status', enum: CircleStatus, required: true })
  @ApiResponse({ status: 200, description: 'Status updated' })
  @ApiResponse({ status: 409, description: 'Invalid state machine transition' })
  @ApiResponse({ status: 404, description: 'Circle not found' })
  updateCircleStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('status') status: CircleStatus,
    @Body('reason') reason?: string,
    @Req() req?: any,
  ) {
    return this.circlesService.updateCircleStatus(
      id,
      status,
      req?.user?.id,
      reason,
    );
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update circle properties (requires reason if status is past DRAFT - BR-05)' })
  @ApiResponse({ status: 200, description: 'Circle updated' })
  @ApiResponse({ status: 409, description: 'Attempted core property change past DRAFT without reason' })
  updateCircleProperties(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<CreateCircleDto>,
    @Body('reason') reason?: string,
    @Req() req?: any,
  ) {
    return this.circlesService.updateCircleProperties(
      id,
      dto,
      req?.user?.id,
      reason,
    );
  }
}

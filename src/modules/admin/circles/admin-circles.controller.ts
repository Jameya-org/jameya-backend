import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  Query,
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

@ApiTags('Admin – Circles')
@ApiBearerAuth('access-token')
@UseGuards(AdminJwtGuard)
@Controller('admin/circles')
export class AdminCirclesController {
  constructor(private readonly circlesService: CirclesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new circle (admin only)' })
  @ApiResponse({ status: 201, description: 'Circle created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid business logic (e.g. amount mismatch)' })
  @ApiResponse({ status: 404, description: 'Fee policy not found' })
  createCircle(@Body() dto: CreateCircleDto) {
    return this.circlesService.createCircle(dto);
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
  @ApiOperation({ summary: 'Update circle status (DRAFT → UPCOMING → IN_PROGRESS etc.)' })
  @ApiQuery({ name: 'status', enum: CircleStatus, required: true })
  @ApiResponse({ status: 200, description: 'Status updated' })
  @ApiResponse({ status: 404, description: 'Circle not found' })
  updateCircleStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('status') status: CircleStatus,
  ) {
    return this.circlesService.updateCircleStatus(id, status);
  }
}

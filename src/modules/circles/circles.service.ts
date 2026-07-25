import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateCircleDto } from './dto/create-circle.dto';
import { CircleStatus, Prisma } from '@prisma/client';

@Injectable()
export class CirclesService {
  constructor(private readonly prisma: PrismaService) {}

  async createCircle(dto: CreateCircleDto) {
    // 1. Verify Fee Policy exists
    const feePolicy = await this.prisma.feePolicy.findUnique({
      where: { id: dto.feePolicyId },
    });

    if (!feePolicy) {
      throw new NotFoundException(`Fee policy with ID ${dto.feePolicyId} not found`);
    }

    // 2. Business Logic: total must equal contribution × capacity
    const expectedTotal = dto.contributionAmount * dto.memberCapacity;
    if (Number(dto.amount) !== expectedTotal) {
      throw new BadRequestException(
        `Total amount (${dto.amount}) must equal contribution (${dto.contributionAmount}) × capacity (${dto.memberCapacity}) = ${expectedTotal}`,
      );
    }

    const start = new Date(dto.startDate);
    const end = new Date(start);
    end.setMonth(end.getMonth() + dto.durationMonths);

    // 3. Create Circle Record with Fee Policy Snapshot
    return this.prisma.circle.create({
      data: {
        amount: dto.amount,
        contributionAmount: dto.contributionAmount,
        durationMonths: dto.durationMonths,
        memberCapacity: dto.memberCapacity,
        cycleFrequency: dto.cycleFrequency ?? 'MONTHLY',
        startDate: start,
        endDate: end,
        status: CircleStatus.DRAFT,
        feePolicyId: dto.feePolicyId,
        // Snapshot the fee policy at creation time — future policy edits won't affect running circles
        feePolicySnapshot: feePolicy.positionFees as Prisma.InputJsonValue,
      },
      include: {
        feePolicy: true,
      },
    });
  }

  async getAllCircles(status?: CircleStatus) {
    return this.prisma.circle.findMany({
      where: status ? { status } : {},
      include: {
        feePolicy: true,
        _count: {
          select: { memberships: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getCircleById(id: string) {
    const circle = await this.prisma.circle.findUnique({
      where: { id },
      include: {
        feePolicy: true,
        memberships: {
          include: {
            customer: {
              select: {
                id: true,
                legalName: true,
                mobileNumber: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!circle) {
      throw new NotFoundException(`Circle with ID ${id} not found`);
    }

    return circle;
  }

  async updateCircleStatus(id: string, status: CircleStatus) {
    const circle = await this.prisma.circle.findUnique({ where: { id } });
    if (!circle) {
      throw new NotFoundException(`Circle with ID ${id} not found`);
    }

    return this.prisma.circle.update({
      where: { id },
      data: { status },
    });
  }
}
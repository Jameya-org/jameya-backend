import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ListCustomersQueryDto } from './dto/list-customers-query.dto';
import { UpdateCustomerStatusDto } from './dto/update-customer-status.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class AdminCustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async listCustomers(query: ListCustomersQueryDto) {
    const { page = 1, limit = 20, status, kycStatus, search } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.CustomerWhereInput = {
      deletedAt: null,
      ...(status && { status }),
      ...(kycStatus && {
        identityProfile: { kycStatus },
      }),
      ...(search && {
        OR: [
          { legalName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { mobileNumber: { contains: search } },
        ],
      }),
    };

    const [customers, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          legalName: true,
          email: true,
          mobileNumber: true,
          status: true,
          createdAt: true,
          identityProfile: {
            select: { kycStatus: true },
          },
        },
      }),
      this.prisma.customer.count({ where }),
    ]);

    return {
      data: customers,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getCustomerById(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        identityProfile: true,
        documents: {
          orderBy: { submittedAt: 'desc' },
        },
        eligibilityDecisions: {
          orderBy: { decidedAt: 'desc' },
          take: 5,
        },
        memberships: {
          include: {
            circle: {
              select: {
                id: true,
                amount: true,
                durationMonths: true,
                status: true,
                startDate: true,
              },
            },
          },
          orderBy: { joinedAt: 'desc' },
        },
      },
    });

    if (!customer) throw new NotFoundException('Customer not found');

    // Never expose internal fields to admin view
    const { ...safe } = customer;
    return safe;
  }

  async updateCustomerStatus(
    customerId: string,
    dto: UpdateCustomerStatusDto,
    actorAdminId: string,
    ipAddress?: string,
  ) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, status: true, legalName: true },
    });

    if (!customer) throw new NotFoundException('Customer not found');

    const updated = await this.prisma.customer.update({
      where: { id: customerId },
      data: { status: dto.status },
      select: { id: true, status: true, legalName: true, email: true, mobileNumber: true },
    });

    await this.auditService.log({
      actorAdminId,
      action: 'customer.status_changed',
      entityType: 'Customer',
      entityId: customerId,
      oldValue: { status: customer.status },
      newValue: { status: updated.status },
      reason: dto.reason,
      ipAddress,
    });

    return updated;
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { AdminStatus } from '@prisma/client';

@Injectable()
export class FeePoliciesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns all active fee policies — used by frontend to populate dropdowns
   */
  async findAllActive() {
    return this.prisma.feePolicy.findMany({
      where: { status: AdminStatus.ACTIVE },
      orderBy: { effectiveFrom: 'desc' },
    });
  }

  /**
   * Returns a single fee policy by ID
   */
  async findOne(id: string) {
    const policy = await this.prisma.feePolicy.findUnique({ where: { id } });
    if (!policy) {
      throw new NotFoundException(`Fee policy with ID ${id} not found`);
    }
    return policy;
  }
}

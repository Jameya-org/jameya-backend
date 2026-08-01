import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AdminJwtGuard } from '../auth/guards/admin-jwt.guard';
import { PrismaService } from '../../../prisma/prisma.service';
import { TransactionStatus, Prisma } from '@prisma/client';

@ApiTags('Admin - Transactions')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard)
@Controller('admin/transactions')
export class AdminTransactionsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Get transactions for payment review with status tabs, search, and pagination' })
  async getTransactions(
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') pageStr?: string,
    @Query('limit') limitStr?: string,
  ) {
    const page = pageStr ? Math.max(1, parseInt(pageStr, 10)) : 1;
    const limit = limitStr ? Math.max(1, parseInt(limitStr, 10)) : 10;
    const skip = (page - 1) * limit;

    const whereClause: Prisma.TransactionWhereInput = {};

    if (status && status.trim() !== '' && status.toLowerCase() !== 'all') {
      const lower = status.trim().toLowerCase();
      if (lower === 'completed' || lower === 'settled') {
        whereClause.status = TransactionStatus.SETTLED;
      } else if (lower === 'failed') {
        whereClause.status = {
          in: [TransactionStatus.FAILED, TransactionStatus.REJECTED],
        };
      } else {
        const enumKey = status.trim().toUpperCase() as TransactionStatus;
        if (Object.values(TransactionStatus).includes(enumKey)) {
          whereClause.status = enumKey;
        }
      }
    }

    if (search && search.trim() !== '') {
      const query = search.trim();
      whereClause.installment = {
        membership: {
          customer: {
            OR: [
              { legalName: { contains: query, mode: 'insensitive' } },
              { mobileNumber: { contains: query, mode: 'insensitive' } },
            ],
          },
        },
      };
    }

    const [total, transactions] = await Promise.all([
      this.prisma.transaction.count({ where: whereClause }),
      this.prisma.transaction.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          installment: {
            include: {
              membership: {
                include: {
                  customer: {
                    select: {
                      id: true,
                      legalName: true,
                      mobileNumber: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
    ]);

    const data = transactions.map((t) => {
      const customer = t.installment?.membership?.customer;
      return {
        id: t.id,
        amount: new Prisma.Decimal(t.amount).toFixed(2),
        customerName: customer?.legalName || 'N/A',
        mobileNumber: customer?.mobileNumber || 'N/A',
        payoutPosition: t.installment?.membership?.payoutPosition ?? null,
        timestamp: t.settledAt || t.createdAt,
        createdAt: t.createdAt,
        settledAt: t.settledAt,
        status: t.status,
        type: t.type,
        channelType: t.channelType,
      };
    });

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages,
      },
    };
  }
}

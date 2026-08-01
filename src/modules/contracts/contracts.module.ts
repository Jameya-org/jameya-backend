import { Module } from '@nestjs/common';
import { ContractsService } from './contracts.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [ContractsService],
  exports: [ContractsService],
})
export class ContractsModule {}

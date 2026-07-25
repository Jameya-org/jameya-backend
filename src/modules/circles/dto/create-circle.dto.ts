import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNumber,
  IsInt,
  Min,
  IsIn,
  IsDateString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
} from 'class-validator';
import { CycleFrequency } from '@prisma/client';

export class CreateCircleDto {
  @ApiProperty({ example: 10000, description: 'Total circle payout amount' })
  @IsNumber()
  @Min(100)
  amount: number;

  @ApiProperty({ example: 1000, description: 'Monthly/cycle contribution per member' })
  @IsNumber()
  @Min(10)
  contributionAmount: number;

  @ApiProperty({ example: 10, description: 'Duration in months (must be 6, 10, or 12)' })
  @IsInt()
  @IsIn([6, 10, 12], { message: 'durationMonths must be 6, 10, or 12' })
  durationMonths: number;

  @ApiProperty({ example: 10, description: 'Max member capacity (must equal durationMonths)' })
  @IsInt()
  @Min(2)
  memberCapacity: number;

  @ApiPropertyOptional({ enum: CycleFrequency, default: CycleFrequency.MONTHLY })
  @IsEnum(CycleFrequency)
  @IsOptional()
  cycleFrequency?: CycleFrequency;

  @ApiProperty({ example: '2026-09-01T00:00:00.000Z', description: 'Circle start date (ISO 8601)' })
  @IsDateString()
  @IsNotEmpty()
  startDate: string;
}

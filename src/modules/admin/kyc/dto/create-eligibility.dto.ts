import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsNumber, IsInt, IsEnum, IsNotEmpty, IsOptional, Min, Max, IsDateString, IsString } from 'class-validator';
import { EligibilityStatus } from '@prisma/client';

export class CreateEligibilityDto {
  @ApiProperty({ description: 'Target Customer UUID' })
  @IsUUID()
  @IsNotEmpty()
  customerId: string;

  @ApiProperty({ example: 500, description: 'Trust score assigned by admin (100 - 1000). Defaults to 500 (neutral baseline) if not provided.', required: false })
  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(1000)
  trustScore?: number;

  @ApiProperty({ example: 10000.00, description: 'Monthly budget / participation limit' })
  @IsNumber()
  @Min(0)
  participationLimit: number;

  @ApiProperty({ enum: EligibilityStatus, default: EligibilityStatus.ELIGIBLE })
  @IsEnum(EligibilityStatus)
  status: EligibilityStatus;

  @ApiProperty({ example: 'MANUAL_INCOME_VERIFIED_V1' })
  @IsString()
  @IsNotEmpty()
  policyVersion: string;

  @ApiProperty({ example: '2027-12-31T23:59:59.000Z', description: 'Expiration date' })
  @IsDateString()
  expiresAt: string;
}
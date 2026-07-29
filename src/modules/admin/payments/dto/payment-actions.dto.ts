import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, ValidateIf } from 'class-validator';
import { ReviewStatus } from '@prisma/client';

export class ReviewPaymentProofDto {
  @ApiProperty({ enum: ReviewStatus, example: ReviewStatus.APPROVED })
  @IsEnum(ReviewStatus)
  reviewStatus: ReviewStatus;

  @ApiPropertyOptional({ example: 'Amount on screenshot does not match the claimed amount.' })
  @ValidateIf((o) => o.reviewStatus === ReviewStatus.REJECTED)
  @IsString()
  @IsNotEmpty({ message: 'reason is required when rejecting a payment proof' })
  reason?: string;
}

export class FlagPaymentProofDto {
  @ApiProperty({ example: 'Sender name does not match any registered customer. Escalating for investigation.' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class HoldTransactionDto {
  @ApiProperty({ example: 'Multiple failed proof submissions from same sender number detected.' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}

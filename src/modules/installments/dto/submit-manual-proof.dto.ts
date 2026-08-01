import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString, IsEnum, Min } from 'class-validator';
import { PaymentChannelType } from '@prisma/client';

export class SubmitManualProofDto {
  @ApiProperty({ description: 'Payment channel used', enum: PaymentChannelType, example: 'VODAFONE_CASH' })
  @IsEnum(PaymentChannelType)
  paymentChannel: PaymentChannelType;

  @ApiProperty({ description: 'Encrypted object reference for proof screenshot', example: 'uploads/proof_123.jpg' })
  @IsString()
  @IsNotEmpty()
  proofScreenshotRef: string;

  @ApiProperty({ description: 'Claimed amount paid', example: 500 })
  @IsNumber()
  @Min(1)
  claimedAmount: number;

  @ApiProperty({ description: 'Sender mobile number or transaction reference', example: '01012345678' })
  @IsString()
  @IsNotEmpty()
  senderMobileOrRef: string;
}

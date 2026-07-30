import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsInt, Min, IsUUID, IsOptional, IsString } from 'class-validator';

export class StartJoinDto {
  @ApiProperty({ description: 'Payout position number (1-based)', example: 1 })
  @IsInt()
  @Min(1)
  payoutPosition: number;

  @ApiPropertyOptional({ description: 'Saved payment method ID', example: 'd3b07384-d113-46e4-a587-542f4c6e9389' })
  @IsOptional()
  @IsUUID()
  paymentMethodId?: string;

  @ApiPropertyOptional({ description: 'Inline card token for new card setup', example: 'tok_visa_1234' })
  @IsOptional()
  @IsString()
  cardToken?: string;
}

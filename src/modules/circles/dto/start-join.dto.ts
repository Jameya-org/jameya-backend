import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min, IsUUID, IsNotEmpty } from 'class-validator';

export class StartJoinDto {
  @ApiProperty({ description: 'Payout position number (1-based)', example: 1 })
  @IsInt()
  @Min(1)
  payoutPosition: number;

  @ApiProperty({ description: 'Saved payment method ID', example: 'd3b07384-d113-46e4-a587-542f4c6e9389' })
  @IsUUID()
  @IsNotEmpty()
  paymentMethodId: string;
}

import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class ActivateFeePolicyDto {
  @ApiProperty({
    example: 'Updating fee schedule for Q3 2026',
    description: 'Mandatory reason for activating this fee policy',
  })
  @IsString()
  @IsNotEmpty({ message: 'Reason is required when activating a fee policy' })
  reason: string;
}

import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsIn,
  IsObject,
  IsString,
  IsNotEmpty,
} from 'class-validator';

export class CreateFeePolicyDto {
  @ApiProperty({ example: 6, description: 'Duration in months (6, 10, or 12)' })
  @IsInt()
  @IsIn([6, 10, 12], { message: 'durationMonths must be 6, 10, or 12' })
  durationMonths: number;

  @ApiProperty({
    example: { '1': 8.0, '2': 7.0, '3': 4.0, '4': 0.0, '5': -15.0, '6': -24.0 },
    description:
      'Map of position (1-indexed string) to fee percentage (positive for fee, negative for cashback)',
  })
  @IsObject()
  @IsNotEmpty()
  positionFees: Record<string, number>;

  @ApiProperty({ example: 'v1.0', description: 'Policy version tag' })
  @IsString()
  @IsNotEmpty()
  version: string;
}

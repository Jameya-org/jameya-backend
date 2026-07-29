import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { CustomerStatus } from '@prisma/client';

export class UpdateCustomerStatusDto {
  @ApiProperty({ enum: CustomerStatus, example: CustomerStatus.SUSPENDED })
  @IsEnum(CustomerStatus)
  status: CustomerStatus;

  @ApiProperty({ example: 'Suspicious activity detected across multiple circles.' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}

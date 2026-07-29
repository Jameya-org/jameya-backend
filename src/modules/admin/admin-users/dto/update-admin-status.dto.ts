import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { AdminStatus } from '@prisma/client';

export class UpdateAdminStatusDto {
  @ApiProperty({ enum: AdminStatus })
  @IsEnum(AdminStatus)
  status: AdminStatus;

  @ApiProperty({ example: 'Repeated policy violations detected during audit.' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}

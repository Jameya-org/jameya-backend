import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class UpdateAdminRoleDto {
  @ApiProperty({ description: 'UUID of the new Role to assign' })
  @IsUUID()
  roleId: string;

  @ApiProperty({ example: 'Promoted to Operations Officer after training completion.' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}

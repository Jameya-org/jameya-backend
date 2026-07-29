import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateAdminUserDto {
  @ApiProperty({ example: 'agent@jameya.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'SecurePass123!', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiPropertyOptional({ description: 'UUID of the Role to assign (defaults to SUPER_ADMIN if omitted)' })
  @IsUUID()
  @IsOptional()
  roleId?: string;
}

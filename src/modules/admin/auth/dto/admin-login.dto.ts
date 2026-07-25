import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class AdminLoginDto {
  @ApiProperty({ example: 'admin@jameya.local', description: 'Admin email address' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'ChangeMe123!', description: 'Admin password' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password: string;
}

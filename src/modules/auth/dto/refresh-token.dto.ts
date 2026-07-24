import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({ description: 'The long-lived refresh token provided during login' })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
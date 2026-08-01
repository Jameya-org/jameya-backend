import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class VerifySignatureOtpDto {
  @ApiProperty({ description: '6-digit signature verification OTP code', example: '123456' })
  @IsString()
  @IsNotEmpty({ message: 'OTP code is required' })
  code: string;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsPhoneNumber } from 'class-validator';

export class RequestOtpDto {
  @ApiProperty({
    description: 'Email address for OTP delivery',
    example: 'user@example.com',
    required: false,
  })
  @IsOptional()
  @IsEmail()
  email?: string;
}
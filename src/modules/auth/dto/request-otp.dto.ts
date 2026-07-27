import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsEnum } from 'class-validator';
import { OtpPurpose } from './otp-purpose.enum';

export class RequestOtpDto {
  @ApiProperty({
    description: 'Email address for OTP delivery',
    example: 'user@example.com',
    required: false,
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    description: 'Purpose of OTP request. If omitted, the server auto-resolves based on whether the user already exists.',
    enum: OtpPurpose,
    example: OtpPurpose.LOGIN,
  })
  @IsOptional()
  @IsEnum(OtpPurpose)
  purpose?: OtpPurpose;
}
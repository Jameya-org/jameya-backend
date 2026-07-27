import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Length, IsNotEmpty, IsEnum } from 'class-validator';
import { OtpPurpose } from './otp-purpose.enum';

export class VerifyOtpDto {
  @ApiProperty({
    description: 'Email address used when requesting OTP',
    example: 'user@example.com',
    required: false,
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ example: '123456', description: '6-digit OTP code' })
  @IsString()
  @Length(6, 6)
  @IsNotEmpty()
  otp: string;

  @ApiPropertyOptional({
    description: 'Purpose of OTP verification. Should match the purpose returned by the request-otp endpoint.',
    enum: OtpPurpose,
    example: OtpPurpose.LOGIN,
  })
  @IsOptional()
  @IsEnum(OtpPurpose)
  purpose?: OtpPurpose;
}
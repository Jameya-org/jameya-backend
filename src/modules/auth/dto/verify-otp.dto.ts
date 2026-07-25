import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Length, IsNotEmpty, IsIn } from 'class-validator';

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
    description: 'Purpose of OTP verification',
    enum: ['registration', 'login'],
    example: 'login',
  })
  @IsOptional()
  @IsString()
  @IsIn(['registration', 'login'])
  purpose?: string;
}
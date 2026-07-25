import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, IsIn } from 'class-validator';

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
    description: 'Purpose of OTP request',
    enum: ['registration', 'login'],
    example: 'login',
  })
  @IsOptional()
  @IsString()
  @IsIn(['registration', 'login'])
  purpose?: string;
}
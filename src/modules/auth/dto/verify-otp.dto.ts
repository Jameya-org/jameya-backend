import { ApiProperty } from '@nestjs/swagger';
import { IsPhoneNumber, IsString, Length, IsNotEmpty } from 'class-validator';

export class VerifyOtpDto {
  @ApiProperty({ example: '+201012345678' })
  @IsPhoneNumber()
  @IsNotEmpty()
  mobileNumber: string;

  @ApiProperty({ example: '123456', description: '6-digit OTP code' })
  @IsString()
  @Length(6, 6)
  otp: string;
}
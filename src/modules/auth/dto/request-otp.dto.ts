import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsPhoneNumber } from 'class-validator';

export class RequestOtpDto {
  @ApiProperty({
    description: 'Mobile number in international E.164 format',
    example: '+201012345678',
  })
  @IsNotEmpty()
  @IsPhoneNumber()
  mobileNumber: string;
}
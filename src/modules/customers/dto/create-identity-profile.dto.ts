import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { 
  IsString, 
  IsNotEmpty, 
  IsDateString, 
  IsObject, 
  ValidateNested,
  IsOptional,
  IsMobilePhone,
} from 'class-validator';
import { Type } from 'class-transformer';

class AddressDto {
  @ApiProperty({ example: 'Gharbia' })
  @IsString()
  @IsNotEmpty()
  governorate: string;

  @ApiProperty({ example: 'El-Mahalla El-Kubra' })
  @IsString()
  @IsNotEmpty()
  city: string;

  @ApiProperty({ example: '123 Main Street, Apt 4' })
  @IsString()
  @IsNotEmpty()
  streetAddress: string;
}

export class CreateIdentityProfileDto {
  @ApiProperty({ example: 'Mohamed Ahmed Ali' })
  @IsString()
  @IsNotEmpty()
  legalName: string;

  @ApiProperty({ example: '1998-05-15', description: 'Date of birth (YYYY-MM-DD)' })
  @IsDateString()
  dateOfBirth: string;

  @ApiProperty({ example: '29805151601234', description: 'National ID card number (14 digits)' })
  @IsString()
  @IsNotEmpty()
  nationalIdNumber: string;

  @ApiProperty({ type: AddressDto })
  @IsObject()
  @ValidateNested()
  @Type(() => AddressDto)
  address: AddressDto;

  @ApiPropertyOptional({ example: '+201012345678', description: 'Customer mobile phone number' })
  @IsOptional()
  @IsMobilePhone()
  mobileNumber?: string;
}
import { ApiProperty } from '@nestjs/swagger';
import { 
  IsString, 
  IsNotEmpty, 
  IsDateString, 
  IsObject, 
  ValidateNested 
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

  @ApiProperty({ example: '29805151601234', description: 'National ID number or token' })
  @IsString()
  @IsNotEmpty()
  nationalIdentifierToken: string;

  @ApiProperty({ type: AddressDto })
  @IsObject()
  @ValidateNested()
  @Type(() => AddressDto)
  address: AddressDto;
}
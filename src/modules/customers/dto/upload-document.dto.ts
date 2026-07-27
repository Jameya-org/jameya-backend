import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, IsNotEmpty, IsOptional, IsDateString } from 'class-validator';
import { DocumentType } from '@prisma/client';

export class UploadDocumentDto {
  @ApiProperty({ enum: DocumentType, example: DocumentType.NATIONAL_ID })
  @IsEnum(DocumentType)
  docType: DocumentType;

  @ApiProperty({ 
    example: 'https://storage.provider.com/encrypted-docs/nat-id-front.jpg', 
    description: 'Reference key/URL of the uploaded file' 
  })
  @IsString()
  @IsNotEmpty()
  encryptedObjectRef: string;

  @ApiProperty({ example: '2024-01-01', required: false })
  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @ApiProperty({ example: '2031-01-01', required: false })
  @IsOptional()
  @IsDateString()
  expiryDate?: string;
}
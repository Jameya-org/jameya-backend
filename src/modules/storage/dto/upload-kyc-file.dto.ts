import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { DocumentType } from '@prisma/client';

export class UploadKycFileDto {
  @ApiProperty({
    enum: DocumentType,
    example: DocumentType.NATIONAL_ID,
    description: 'The type of document being uploaded. Determines allowed file formats.',
  })
  @IsEnum(DocumentType)
  docType: DocumentType;

  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'The file to upload (JPEG/PNG/WEBP/HEIC for ID docs, PDF or image for income/utility).',
  })
  file: Express.Multer.File;
}

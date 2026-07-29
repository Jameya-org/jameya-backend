import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, ValidateIf } from 'class-validator';
import { DocumentStatus } from '@prisma/client';

export class ReviewDocumentDto {
  @ApiProperty({ enum: DocumentStatus, example: DocumentStatus.APPROVED })
  @IsEnum(DocumentStatus)
  status: DocumentStatus;

  @ApiProperty({ example: 'Verified National ID image and details match profile.', required: false })
  @IsString()
  @IsOptional()
  reviewResult?: string;

  @ApiPropertyOptional({ example: 'Document is blurry and the ID number is not legible.' })
  @ValidateIf((o) => o.status === DocumentStatus.REJECTED)
  @IsString()
  @IsNotEmpty({ message: 'reason is required when rejecting a document' })
  reason?: string;
}
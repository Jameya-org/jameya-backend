import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, IsOptional } from 'class-validator';
import { DocumentStatus } from '@prisma/client';

export class ReviewDocumentDto {
  @ApiProperty({ enum: DocumentStatus, example: DocumentStatus.APPROVED })
  @IsEnum(DocumentStatus)
  status: DocumentStatus;

  @ApiProperty({ example: 'Verified National ID image and details match profile.', required: false })
  @IsString()
  @IsOptional()
  reviewResult?: string;
}
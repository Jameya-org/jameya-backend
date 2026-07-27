import {
  Controller,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Req,
  Body,
  BadRequestException,
  ParseEnumPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StorageService } from './storage.service';
import { DocumentType } from '@prisma/client';
import { UploadKycFileDto } from './dto/upload-kyc-file.dto';

/** Shape of `req.user` populated by JwtAuthGuard */
interface AuthenticatedRequest extends Request {
  user: { id: string; mobileNumber: string };
}

@ApiTags('Storage / File Upload')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  /**
   * Step 1 of document submission:
   * Upload the raw file → receive back a `secureUrl` to pass to POST /customers/documents.
   */
  @Post('upload')
  @ApiOperation({
    summary: 'Upload a KYC document file to Cloudinary',
    description:
      'Returns a `secureUrl` to use as `encryptedObjectRef` in POST /customers/documents. ' +
      'ID-type documents (NATIONAL_ID, PASSPORT, CAR_LICENSE, SYNDICATE_ID) reject PDFs. ' +
      'Max file size: 10 MB.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadKycFileDto })
  @UseInterceptors(
    FileInterceptor('file', {
      // Store in memory; we stream directly to Cloudinary — no disk I/O
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async uploadFile(
    @Req() req: AuthenticatedRequest,
    @UploadedFile() file: Express.Multer.File,
    @Body('docType', new ParseEnumPipe(DocumentType)) docType: DocumentType,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded. Provide a file field in multipart/form-data.');
    }

    const { secureUrl, publicId } = await this.storageService.uploadKycDocument(
      file,
      docType,
      req.user.id,
    );

    return {
      secureUrl,
      publicId,
      docType,
      message: 'File uploaded successfully. Use secureUrl as encryptedObjectRef in POST /customers/documents.',
    };
  }
}

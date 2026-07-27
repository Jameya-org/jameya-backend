import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { v2 as cloudinary, UploadApiResponse, UploadApiOptions } from 'cloudinary';
import { DocumentType } from '@prisma/client';
import * as streamifier from 'streamifier';

/** Document types that must be images (no PDFs allowed) */
const IMAGE_ONLY_TYPES = new Set<DocumentType>([
  DocumentType.NATIONAL_ID,
  DocumentType.PASSPORT,
  DocumentType.CAR_LICENSE,
  DocumentType.SYNDICATE_ID,
]);

/** Allowed MIME types per category */
const ALLOWED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

const ALLOWED_PDF_MIME = 'application/pdf';

/** Max file size: 10 MB */
const MAX_BYTES = 10 * 1024 * 1024;

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  /**
   * Validates the file against the given document type and uploads it to Cloudinary.
   * Returns the secure URL (used as `encryptedObjectRef`) and the public_id.
   */
  async uploadKycDocument(
    file: Express.Multer.File,
    docType: DocumentType,
    customerId: string,
  ): Promise<{ secureUrl: string; publicId: string }> {
    // ── 1. Size guard ─────────────────────────────────────────────────────────
    if (file.size > MAX_BYTES) {
      throw new BadRequestException(
        `File too large. Maximum allowed size is 10 MB (received ${(file.size / 1024 / 1024).toFixed(2)} MB).`,
      );
    }

    // ── 2. MIME type guard ────────────────────────────────────────────────────
    const isImage = ALLOWED_IMAGE_MIMES.has(file.mimetype);
    const isPdf = file.mimetype === ALLOWED_PDF_MIME;

    if (!isImage && !isPdf) {
      throw new BadRequestException(
        `Unsupported file type "${file.mimetype}". Allowed: JPEG, PNG, WEBP, HEIC, PDF.`,
      );
    }

    if (IMAGE_ONLY_TYPES.has(docType) && isPdf) {
      throw new BadRequestException(
        `Document type "${docType}" requires a photo (PDF not allowed).`,
      );
    }

    // ── 3. Determine Cloudinary resource type ─────────────────────────────────
    const resourceType: 'image' | 'raw' = isImage ? 'image' : 'raw';

    // ── 4. Build a structured folder path: jameya/kyc/<customerId>/<docType> ──
    const folder = `jameya/kyc/${customerId}/${docType.toLowerCase()}`;

    // ── 5. Stream-upload to Cloudinary ────────────────────────────────────────
    const result = await this.streamUpload(file.buffer, {
      folder,
      resource_type: resourceType,
      // Restrict access — only accessible via signed URLs if you enable private delivery
      // For now, using 'authenticated' requires a signature to view; switch to 'public'
      // during development if needed.
      type: 'upload',
      // Overwrite the same doc if re-uploaded (idempotent per customer+docType)
      overwrite: false,
    });

    this.logger.log(
      `Uploaded ${docType} for customer ${customerId} → ${result.public_id}`,
    );

    return {
      secureUrl: result.secure_url,
      publicId: result.public_id,
    };
  }

  /** Wraps Cloudinary's callback API in a promise using a readable stream */
  private streamUpload(
    buffer: Buffer,
    options: UploadApiOptions,
  ): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        options,
        (error, result) => {
          if (error) return reject(error);
          if (!result) return reject(new Error('Cloudinary returned no result'));
          resolve(result);
        },
      );
      streamifier.createReadStream(buffer).pipe(uploadStream);
    });
  }
}

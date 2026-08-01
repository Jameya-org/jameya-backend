import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as crypto from 'crypto';
import { Prisma, Contract } from '@prisma/client';

export interface AcceptanceEvidence {
  customerId: string;
  phoneNumberUsed: string;
  timestamp: string;
  contractVersion: string;
  docHash: string;
  consentVersion: string;
  ipAddress: string;
  deviceInfo: string;
  otpVerificationResult: any;
}

@Injectable()
export class ContractsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper: Render PDF contract buffer using pdf-lib
   */
  private async renderPdfBuffer(
    membership: any,
    isDraft: boolean,
    evidence?: AcceptanceEvidence,
  ): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4
    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const { width, height } = page.getSize();
    let y = height - 50;

    // Header
    const title = isDraft
      ? 'JAMEYA CIRCLE MEMBERSHIP CONTRACT (DRAFT)'
      : 'JAMEYA CIRCLE MEMBERSHIP CONTRACT (FINAL SIGNED)';
    page.drawText(title, {
      x: 50,
      y,
      size: 16,
      font,
      color: isDraft ? rgb(0.7, 0.3, 0) : rgb(0, 0.5, 0),
    });
    y -= 30;

    // Contract Metadata
    page.drawText(`Membership ID: ${membership.id}`, { x: 50, y, size: 10, font: fontRegular });
    y -= 15;
    page.drawText(`Circle ID: ${membership.circleId}`, { x: 50, y, size: 10, font: fontRegular });
    y -= 15;
    page.drawText(
      `Customer Name / ID: ${membership.customer?.legalName || membership.customerId}`,
      { x: 50, y, size: 10, font: fontRegular },
    );
    y -= 15;
    page.drawText(`Payout Position: #${membership.payoutPosition}`, {
      x: 50,
      y,
      size: 10,
      font: fontRegular,
    });
    y -= 15;
    page.drawText(
      `Circle Monthly Contribution: EGP ${membership.circle?.contributionAmount}`,
      { x: 50, y, size: 10, font: fontRegular },
    );
    y -= 15;
    page.drawText(`Duration: ${membership.circle?.durationMonths} Months`, {
      x: 50,
      y,
      size: 10,
      font: fontRegular,
    });
    y -= 30;

    // Terms & Policy Snapshot Summary
    page.drawText('Terms & Conditions:', { x: 50, y, size: 12, font });
    y -= 18;
    const policySnapshot = membership.circle?.feePolicySnapshot as any;
    page.drawText(
      `- Fee Policy Version: ${policySnapshot?.version || '1.0'}`,
      { x: 60, y, size: 10, font: fontRegular },
    );
    y -= 15;
    page.drawText(
      '- Obligation: The customer agrees to pay monthly contributions on time.',
      { x: 60, y, size: 10, font: fontRegular },
    );
    y -= 15;
    page.drawText(
      '- Late Fees & Default: Overdue payments are subject to administrative penalty policies.',
      { x: 60, y, size: 10, font: fontRegular },
    );
    y -= 30;

    // Signature Evidence (if final)
    if (!isDraft && evidence) {
      page.drawText('Digital Signature Evidence (OTP Verified):', {
        x: 50,
        y,
        size: 12,
        font,
        color: rgb(0, 0.4, 0.8),
      });
      y -= 18;
      page.drawText(`- Signed By: ${evidence.phoneNumberUsed}`, {
        x: 60,
        y,
        size: 10,
        font: fontRegular,
      });
      y -= 15;
      page.drawText(`- Timestamp: ${evidence.timestamp}`, {
        x: 60,
        y,
        size: 10,
        font: fontRegular,
      });
      y -= 15;
      page.drawText(`- Document SHA-256 Hash: ${evidence.docHash}`, {
        x: 60,
        y,
        size: 8,
        font: fontRegular,
      });
      y -= 15;
      page.drawText(`- IP / Device: ${evidence.ipAddress} | ${evidence.deviceInfo}`, {
        x: 60,
        y,
        size: 8,
        font: fontRegular,
      });
    }

    return await pdfDoc.save();
  }

  /**
   * 1. Renders a draft contract document before signature.
   * Returns a file reference string (encryptedObjectRef pattern).
   */
  async generateDraft(membershipId: string): Promise<string> {
    const membership = await this.prisma.membership.findUnique({
      where: { id: membershipId },
      include: {
        circle: true,
        customer: true,
      },
    });

    if (!membership) {
      throw new NotFoundException(`Membership with ID ${membershipId} not found`);
    }

    const pdfBuffer = await this.renderPdfBuffer(membership, true);

    // Encrypted object storage reference pattern
    const fileRef = `contracts/drafts/${membership.id}_draft_${Date.now()}.pdf`;
    return fileRef;
  }

  /**
   * 2. Renders final immutable contract document and records Contract DB row.
   * MUST BE IDEMPOTENT: If Contract row already exists for membershipId, return it immediately.
   */
  async finalize(
    membershipId: string,
    otpVerificationResult: any,
    tx?: Prisma.TransactionClient,
    requestContext?: { ipAddress?: string; deviceInfo?: string },
  ): Promise<Contract> {
    const client = tx || this.prisma;

    // Idempotency check: if contract already exists, return it
    const existingContract = await client.contract.findUnique({
      where: { membershipId },
    });

    if (existingContract) {
      return existingContract;
    }

    const membership = await client.membership.findUnique({
      where: { id: membershipId },
      include: {
        circle: true,
        customer: true,
      },
    });

    if (!membership) {
      throw new NotFoundException(`Membership with ID ${membershipId} not found`);
    }

    // Temporary placeholder for docHash calculation before final render
    const initialEvidence: AcceptanceEvidence = {
      customerId: membership.customerId,
      phoneNumberUsed: membership.customer.mobileNumber || membership.customer.email || 'unknown',
      timestamp: new Date().toISOString(),
      contractVersion: (membership.circle.feePolicySnapshot as any)?.version || '1.0',
      docHash: '',
      consentVersion: (membership.customer.consentVersions as any)?.version || '1.0',
      ipAddress: requestContext?.ipAddress || '127.0.0.1',
      deviceInfo: requestContext?.deviceInfo || 'unknown',
      otpVerificationResult,
    };

    // Render initial final PDF
    let pdfBuffer = await this.renderPdfBuffer(membership, false, initialEvidence);
    const docHash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');

    // Update docHash in evidence and re-render for accurate hash embed
    initialEvidence.docHash = docHash;
    pdfBuffer = await this.renderPdfBuffer(membership, false, initialEvidence);
    const finalDocHash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
    initialEvidence.docHash = finalDocHash;

    const fileRef = `contracts/final/${membership.id}_final_${Date.now()}.pdf`;

    return await client.contract.create({
      data: {
        membershipId,
        templateVersion: initialEvidence.contractVersion,
        renderedFileRef: fileRef,
        docHash: finalDocHash,
        acceptanceEvidence: initialEvidence as any,
        signatureOtpResult: JSON.stringify(otpVerificationResult),
      },
    });
  }
}

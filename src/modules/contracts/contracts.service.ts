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
  /** Helper: draw a horizontal rule line */
  private drawRule(page: any, y: number, font: any): number {
    page.drawLine({
      start: { x: 50, y: y - 4 },
      end: { x: 545, y: y - 4 },
      thickness: 0.5,
      color: rgb(0.7, 0.7, 0.7),
    });
    return y - 16;
  }

  /** Helper: draw a section heading and return new y */
  private drawSection(page: any, title: string, y: number, font: any): number {
    page.drawText(title, { x: 50, y, size: 12, font, color: rgb(0.1, 0.1, 0.4) });
    return y - 20;
  }

  /** Helper: draw a key-value row */
  private drawRow(
    page: any,
    label: string,
    value: string,
    y: number,
    font: any,
    fontRegular: any,
    indent = 60,
  ): number {
    page.drawText(`${label}:`, { x: indent, y, size: 10, font });
    page.drawText(value, { x: indent + 160, y, size: 10, font: fontRegular });
    return y - 16;
  }

  private async renderPdfBuffer(
    membership: any,
    isDraft: boolean,
    evidence?: AcceptanceEvidence,
  ): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

    const addPage = () => {
      const p = pdfDoc.addPage([595.28, 841.89]); // A4
      return { page: p, y: p.getSize().height - 50 };
    };

    let { page, y } = addPage();

    const ensureSpace = (needed: number) => {
      if (y < needed + 60) {
        ({ page, y } = addPage());
      }
    };

    // ─── HEADER ────────────────────────────────────────────────────────────────
    const statusLabel = isDraft ? '(DRAFT – PENDING SIGNATURE)' : '(DIGITALLY SIGNED)';
    const headerColor = isDraft ? rgb(0.7, 0.3, 0) : rgb(0.0, 0.45, 0.1);
    page.drawText('JAMEYA SAVINGS CIRCLE', { x: 50, y, size: 18, font, color: rgb(0.1, 0.1, 0.4) });
    y -= 22;
    page.drawText(`MEMBERSHIP CONTRACT ${statusLabel}`, { x: 50, y, size: 12, font, color: headerColor });
    y -= 8;
    y = this.drawRule(page, y, font);
    y -= 6;

    // ─── SECTION 1: PARTIES ───────────────────────────────────────────────────
    ensureSpace(120);
    y = this.drawSection(page, '1. PARTIES', y, font);

    const customer = membership.customer;
    const identityProfile = membership.customer?.identityProfile;
    const addressObj = identityProfile?.address as any;
    const addressStr = addressObj
      ? `${addressObj.street || ''}, ${addressObj.city || ''}, ${addressObj.governorate || ''}`.replace(/^,\s*|,\s*$/g, '')
      : 'N/A';
    const dobStr = identityProfile?.dateOfBirth
      ? new Date(identityProfile.dateOfBirth).toLocaleDateString('en-GB')
      : 'N/A';

    y = this.drawRow(page, 'Member Full Name', customer?.legalName || 'N/A', y, font, fontRegular);
    y = this.drawRow(page, 'Mobile Number', customer?.mobileNumber || 'N/A', y, font, fontRegular);
    y = this.drawRow(page, 'Email', customer?.email || 'N/A', y, font, fontRegular);
    y = this.drawRow(page, 'National ID Token', identityProfile?.nationalIdentifierToken || 'N/A', y, font, fontRegular);
    y = this.drawRow(page, 'Date of Birth', dobStr, y, font, fontRegular);
    y = this.drawRow(page, 'Address', addressStr, y, font, fontRegular);
    y -= 4;
    y = this.drawRow(page, 'Platform', 'Jameya – Savings Circle Platform (جمعية)', y, font, fontRegular);
    y -= 10;

    // ─── SECTION 2: CIRCLE DETAILS ────────────────────────────────────────────
    ensureSpace(140);
    y = this.drawSection(page, '2. CIRCLE DETAILS', y, font);

    const circle = membership.circle;
    const policySnapshot = circle?.feePolicySnapshot as any;
    const startDate = circle?.startDate ? new Date(circle.startDate) : null;
    const endDate = circle?.endDate ? new Date(circle.endDate) : null;
    const fmt = (d: Date | null) => d ? d.toLocaleDateString('en-GB') : 'N/A';

    y = this.drawRow(page, 'Circle ID', circle?.id || 'N/A', y, font, fontRegular);
    y = this.drawRow(page, 'Membership ID', membership.id, y, font, fontRegular);
    y = this.drawRow(page, 'Circle Start Date', fmt(startDate), y, font, fontRegular);
    y = this.drawRow(page, 'Circle End Date', fmt(endDate), y, font, fontRegular);
    y = this.drawRow(page, 'Duration', `${circle?.durationMonths} months`, y, font, fontRegular);
    y = this.drawRow(page, 'Cycle Frequency', circle?.cycleFrequency || 'MONTHLY', y, font, fontRegular);
    y = this.drawRow(page, 'Total Circle Pool', `EGP ${Number(circle?.amount).toFixed(2)}`, y, font, fontRegular);
    y = this.drawRow(page, 'Monthly Contribution', `EGP ${Number(circle?.contributionAmount).toFixed(2)}`, y, font, fontRegular);
    y = this.drawRow(page, 'Member Capacity', String(circle?.memberCapacity), y, font, fontRegular);
    y = this.drawRow(page, 'Fee Policy Version', policySnapshot?.version || '1.0', y, font, fontRegular);
    y -= 10;

    // ─── SECTION 3: PAYOUT DETAILS ────────────────────────────────────────────
    ensureSpace(100);
    y = this.drawSection(page, '3. PAYOUT DETAILS', y, font);

    const payout = membership.payout;
    let payoutDateStr = 'N/A';
    if (startDate && membership.payoutPosition) {
      const pd = new Date(startDate);
      pd.setMonth(pd.getMonth() + (membership.payoutPosition - 1));
      payoutDateStr = fmt(pd);
    }
    const grossAmount = payout ? Number(payout.grossAmount).toFixed(2) : (circle ? Number(circle.amount).toFixed(2) : 'N/A');
    const feeAmount  = payout ? Number(payout.feeAmount).toFixed(2)  : 'N/A';
    const netAmount  = payout ? Number(payout.netAmount).toFixed(2)   : 'N/A';

    y = this.drawRow(page, 'Payout Position', `#${membership.payoutPosition}`, y, font, fontRegular);
    y = this.drawRow(page, 'Scheduled Payout Date', payoutDateStr, y, font, fontRegular);
    y = this.drawRow(page, 'Gross Payout Amount', `EGP ${grossAmount}`, y, font, fontRegular);
    y = this.drawRow(page, 'Platform Fee Deducted', `EGP ${feeAmount}`, y, font, fontRegular);
    y = this.drawRow(page, 'Net Payout to Member', `EGP ${netAmount}`, y, font, fontRegular);
    y -= 10;

    // ─── SECTION 4: INSTALLMENT SCHEDULE ─────────────────────────────────────
    ensureSpace(60);
    y = this.drawSection(page, '4. INSTALLMENT SCHEDULE', y, font);

    // Table header
    page.drawText('Cycle', { x: 60, y, size: 9, font });
    page.drawText('Due Date', { x: 110, y, size: 9, font });
    page.drawText('Amount (EGP)', { x: 220, y, size: 9, font });
    page.drawText('Status', { x: 340, y, size: 9, font });
    y -= 4;
    y = this.drawRule(page, y, font);

    const installments: any[] = membership.installments || [];
    const durationMonths: number = circle?.durationMonths || 0;
    const contribution: number = Number(circle?.contributionAmount || 0);

    for (let i = 0; i < durationMonths; i++) {
      ensureSpace(20);
      const inst = installments[i];
      const cycleNum = inst ? inst.cycleNumber : i + 1;
      let dueDateStr = 'N/A';
      if (inst?.dueDate) {
        dueDateStr = new Date(inst.dueDate).toLocaleDateString('en-GB');
      } else if (startDate) {
        const d = new Date(startDate);
        d.setMonth(d.getMonth() + i);
        dueDateStr = fmt(d);
      }
      const amount = inst ? Number(inst.amount).toFixed(2) : contribution.toFixed(2);
      const status = inst?.status || 'PENDING';

      const rowColor = isDraft ? rgb(0.4, 0.4, 0.4) : rgb(0.1, 0.1, 0.1);
      page.drawText(String(cycleNum), { x: 60, y, size: 9, font: fontRegular, color: rowColor });
      page.drawText(dueDateStr, { x: 110, y, size: 9, font: fontRegular, color: rowColor });
      page.drawText(amount, { x: 220, y, size: 9, font: fontRegular, color: rowColor });
      page.drawText(status, { x: 340, y, size: 9, font: fontRegular, color: rowColor });
      y -= 16;
    }
    y -= 6;

    // ─── SECTION 5: FEE & LATE PAYMENT POLICY ────────────────────────────────
    ensureSpace(100);
    y = this.drawSection(page, '5. FEE & LATE PAYMENT POLICY', y, font);

    const positionFees = policySnapshot?.positionFees as Record<string, any> | undefined;
    if (positionFees && membership.payoutPosition) {
      const feeEntry = positionFees[String(membership.payoutPosition)];
      if (feeEntry) {
        const feeType = feeEntry.type === 'percentage' ? `${feeEntry.value}%` : `EGP ${feeEntry.value} (flat)`;
        y = this.drawRow(page, 'Fee Type', feeType, y, font, fontRegular);
      }
    }
    page.drawText('- Members must pay their monthly contribution on or before the due date.', { x: 60, y, size: 9, font: fontRegular });
    y -= 14;
    page.drawText('- A grace period of 3 calendar days applies after each due date.', { x: 60, y, size: 9, font: fontRegular });
    y -= 14;
    page.drawText('- Payments not received within the grace period are marked OVERDUE.', { x: 60, y, size: 9, font: fontRegular });
    y -= 14;
    page.drawText('- Repeated defaults may result in membership suspension and legal recovery.', { x: 60, y, size: 9, font: fontRegular });
    y -= 14;
    page.drawText('- The platform reserves the right to freeze the payout until all obligations are settled.', { x: 60, y, size: 9, font: fontRegular });
    y -= 20;

    // ─── SECTION 6: GOVERNING LAW ─────────────────────────────────────────────
    ensureSpace(80);
    y = this.drawSection(page, '6. GOVERNING LAW & JURISDICTION', y, font);
    page.drawText('This contract is governed by the laws of the Arab Republic of Egypt.', { x: 60, y, size: 9, font: fontRegular });
    y -= 14;
    page.drawText('Any disputes arising from this agreement shall be subject to the exclusive jurisdiction', { x: 60, y, size: 9, font: fontRegular });
    y -= 14;
    page.drawText('of the competent courts of Cairo, Egypt.', { x: 60, y, size: 9, font: fontRegular });
    y -= 20;

    // ─── SECTION 7: SIGNATURES ────────────────────────────────────────────────
    ensureSpace(120);
    y = this.drawSection(page, '7. SIGNATURES', y, font);

    if (isDraft) {
      page.drawText('[ DRAFT – Awaiting digital signature via OTP verification ]', {
        x: 60, y, size: 10, font: fontItalic, color: rgb(0.7, 0.3, 0),
      });
      y -= 20;
    } else if (evidence) {
      // Member signature block
      page.drawText('Member Digital Signature (OTP Verified):', { x: 60, y, size: 10, font, color: rgb(0, 0.4, 0.8) });
      y -= 16;
      y = this.drawRow(page, 'Signed By', evidence.phoneNumberUsed, y, font, fontRegular);
      y = this.drawRow(page, 'Signed At', evidence.timestamp, y, font, fontRegular);
      y = this.drawRow(page, 'IP Address', evidence.ipAddress, y, font, fontRegular);
      y = this.drawRow(page, 'Device', evidence.deviceInfo, y, font, fontRegular);
      y = this.drawRow(page, 'Consent Version', evidence.consentVersion, y, font, fontRegular);
      y -= 8;
      // Hash
      page.drawText('Document Integrity Hash (SHA-256):', { x: 60, y, size: 9, font });
      y -= 14;
      page.drawText(evidence.docHash, { x: 60, y, size: 7, font: fontRegular, color: rgb(0.3, 0.3, 0.3) });
      y -= 20;
      // Platform counter-signature
      y = this.drawRule(page, y, font);
      page.drawText('Platform Acknowledgement:', { x: 60, y, size: 10, font, color: rgb(0.1, 0.1, 0.4) });
      y -= 16;
      page.drawText('Jameya Platform confirms receipt and validity of the above digital signature.', { x: 60, y, size: 9, font: fontItalic });
      y -= 14;
      page.drawText(`Contract Version: ${evidence.contractVersion}  |  Policy Version: ${evidence.contractVersion}`, { x: 60, y, size: 9, font: fontRegular });
      y -= 20;
    }

    // ─── FOOTER ───────────────────────────────────────────────────────────────
    const pages = pdfDoc.getPages();
    const generatedAt = new Date().toISOString();
    for (let pi = 0; pi < pages.length; pi++) {
      const p = pages[pi];
      const { height: ph } = p.getSize();
      p.drawText(
        `Page ${pi + 1} of ${pages.length}  |  Generated: ${generatedAt}  |  Jameya Savings Circle Platform`,
        { x: 50, y: 30, size: 7, font: fontRegular, color: rgb(0.5, 0.5, 0.5) },
      );
      if (!isDraft) {
        p.drawText('LEGALLY BINDING DOCUMENT', {
          x: 400, y: 30, size: 7, font, color: rgb(0, 0.45, 0.1),
        });
      }
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
        customer: { include: { identityProfile: true } },
        installments: { orderBy: { cycleNumber: 'asc' } },
        payout: true,
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
   * Regenerates the contract PDF on-the-fly for download (stateless, uses stored evidence).
   * Returns the PDF as a Uint8Array buffer.
   */
  async renderContractForDownload(customerId: string, membershipId: string): Promise<Uint8Array> {
    const contract = await this.prisma.contract.findFirst({
      where: { membershipId, membership: { customerId } },
    });

    const membership = await this.prisma.membership.findFirst({
      where: { id: membershipId, customerId },
      include: {
        circle: true,
        customer: { include: { identityProfile: true } },
        installments: { orderBy: { cycleNumber: 'asc' } },
        payout: true,
      },
    });

    if (!membership) {
      throw new NotFoundException('Membership not found');
    }

    const isDraft = !contract;
    const evidence = contract ? (contract.acceptanceEvidence as any as AcceptanceEvidence) : undefined;

    return this.renderPdfBuffer(membership, isDraft, evidence);
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
        customer: { include: { identityProfile: true } },
        installments: { orderBy: { cycleNumber: 'asc' } },
        payout: true,
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

  /**
   * List all signed contracts for a customer (FR-10).
   */
  async getCustomerContracts(customerId: string) {
    const contracts = await this.prisma.contract.findMany({
      where: {
        membership: {
          customerId,
        },
      },
      include: {
        membership: {
          include: {
            circle: {
              select: {
                id: true,
                amount: true,
                contributionAmount: true,
                durationMonths: true,
                startDate: true,
              },
            },
          },
        },
      },
      orderBy: { signedAt: 'desc' },
    });

    return contracts.map((c) => ({
      id: c.id,
      membershipId: c.membershipId,
      circleId: c.membership.circleId,
      circleTitle: `جمعية شهر ${new Date(c.membership.circle.startDate).getMonth() + 1}`,
      templateVersion: c.templateVersion,
      renderedFileRef: c.renderedFileRef,
      docHash: c.docHash,
      signedAt: c.signedAt,
      acceptanceEvidence: c.acceptanceEvidence,
    }));
  }

  /**
   * Retrieve a specific signed contract by membership ID (FR-10).
   */
  async getContractByMembershipId(customerId: string, membershipId: string) {
    const contract = await this.prisma.contract.findFirst({
      where: {
        membershipId,
        membership: { customerId },
      },
      include: {
        membership: {
          include: {
            circle: true,
            customer: {
              select: { legalName: true, mobileNumber: true, email: true },
            },
          },
        },
      },
    });

    if (!contract) {
      throw new NotFoundException('Signed contract not found for this membership');
    }

    return {
      id: contract.id,
      membershipId: contract.membershipId,
      templateVersion: contract.templateVersion,
      renderedFileRef: contract.renderedFileRef,
      docHash: contract.docHash,
      signedAt: contract.signedAt,
      acceptanceEvidence: contract.acceptanceEvidence,
      customerName: contract.membership.customer.legalName,
      circleDetails: {
        circleId: contract.membership.circle.id,
        amount: contract.membership.circle.amount,
        durationMonths: contract.membership.circle.durationMonths,
        payoutPosition: contract.membership.payoutPosition,
      },
    };
  }
}


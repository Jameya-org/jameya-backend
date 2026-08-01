import 'dotenv/config';
import { PrismaClient, CustomerStatus, KycStatus, DocumentType, DocumentStatus, EligibilityStatus, PaymentMethodType, CircleStatus, MembershipStatus, InstallmentStatus, TransactionType, PaymentChannelType, TransactionStatus, ReviewStatus, PayoutStatus, LedgerAccount, FeePolicyStatus, NotificationType } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { randomBytes, scryptSync } from 'node:crypto';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

async function main(): Promise<void> {
  console.log('🌱 Starting comprehensive data seed...');

  // ==========================================
  // 1. ROLES & ADMIN USERS
  // ==========================================
  console.log('🔐 Seeding Roles and Admin Users...');

  const rolesToSeed = [
    {
      name: 'SUPER_ADMIN',
      permissions: ['*'],
    },
    {
      name: 'COMPLIANCE_OFFICER',
      permissions: ['kyc:read', 'kyc:write', 'customers:read', 'audit:read', 'dashboard:read'],
    },
    {
      name: 'FINANCE_MANAGER',
      permissions: ['payments:read', 'payments:write', 'circles:read', 'circles:manage', 'audit:read', 'dashboard:read'],
    },
    {
      name: 'SUPPORT_AGENT',
      permissions: ['customers:read', 'circles:read', 'payments:read', 'kyc:read', 'dashboard:read'],
    },
  ];

  const seededRoles: Record<string, any> = {};
  for (const roleDef of rolesToSeed) {
    const seededRole = await prisma.role.upsert({
      where: { name: roleDef.name },
      update: { permissions: roleDef.permissions },
      create: {
        name: roleDef.name,
        permissions: roleDef.permissions,
      },
    });
    seededRoles[roleDef.name] = seededRole;
  }

  const superAdminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@jameya.local';
  const superAdminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';

  const superAdmin = await prisma.adminUser.upsert({
    where: { email: superAdminEmail },
    update: { passwordHash: hashPassword(superAdminPassword), roleId: seededRoles['SUPER_ADMIN'].id },
    create: {
      email: superAdminEmail,
      passwordHash: hashPassword(superAdminPassword),
      roleId: seededRoles['SUPER_ADMIN'].id,
      mfaEnabled: false,
    },
  });

  const financeAdmin = await prisma.adminUser.upsert({
    where: { email: 'finance@jameya.local' },
    update: { passwordHash: hashPassword('Finance123!'), roleId: seededRoles['FINANCE_MANAGER'].id },
    create: {
      email: 'finance@jameya.local',
      passwordHash: hashPassword('Finance123!'),
      roleId: seededRoles['FINANCE_MANAGER'].id,
      mfaEnabled: false,
    },
  });

  const complianceAdmin = await prisma.adminUser.upsert({
    where: { email: 'compliance@jameya.local' },
    update: { passwordHash: hashPassword('Compliance123!'), roleId: seededRoles['COMPLIANCE_OFFICER'].id },
    create: {
      email: 'compliance@jameya.local',
      passwordHash: hashPassword('Compliance123!'),
      roleId: seededRoles['COMPLIANCE_OFFICER'].id,
      mfaEnabled: false,
    },
  });

  // ==========================================
  // 2. FEE POLICIES
  // ==========================================
  console.log('📜 Seeding Fee Policies...');

  const defaultPolicies = [
    {
      version: 'v1.0-6m',
      durationMonths: 6,
      positionFees: { '1': 8.0, '2': 7.0, '3': 4.0, '4': 0.0, '5': -15.0, '6': -24.0 },
    },
    {
      version: 'v1.0-10m',
      durationMonths: 10,
      positionFees: { '1': 14.0, '2': 12.0, '3': 10.0, '4': 8.0, '5': 6.0, '6': 0.0, '7': 0.0, '8': -5.0, '9': -7.0, '10': -10.0 },
    },
    {
      version: 'v1.0-12m',
      durationMonths: 12,
      positionFees: { '1': 16.0, '2': 14.0, '3': 12.0, '4': 10.0, '5': 8.0, '6': 6.0, '7': 0.0, '8': 0.0, '9': 0.0, '10': -7.0, '11': -10.0, '12': -12.0 },
    },
  ];

  const seededPolicies: Record<number, any> = {};
  for (const policyData of defaultPolicies) {
    await prisma.feePolicy.updateMany({
      where: { durationMonths: policyData.durationMonths, status: FeePolicyStatus.ACTIVE },
      data: { status: FeePolicyStatus.RETIRED },
    });

    const created = await prisma.feePolicy.create({
      data: {
        version: policyData.version,
        durationMonths: policyData.durationMonths,
        positionFees: policyData.positionFees,
        status: FeePolicyStatus.ACTIVE,
        effectiveFrom: new Date(),
      },
    });
    seededPolicies[policyData.durationMonths] = created;
  }

  // ==========================================
  // 3. CUSTOMERS & PROFILES & KYC
  // ==========================================
  console.log('👤 Seeding Customers, Identity Profiles & KYC Documents...');

  // Primary Flutter Test Customer
  const primaryMobile = '+201000000001';
  const customer1 = await prisma.customer.upsert({
    where: { mobileNumber: primaryMobile },
    update: { legalName: 'Ahmed Mahmoud Hassan', status: CustomerStatus.ACTIVE },
    create: {
      mobileNumber: primaryMobile,
      email: 'testuser@jameya.local',
      legalName: 'Ahmed Mahmoud Hassan',
      status: CustomerStatus.ACTIVE,
      locale: 'ar',
    },
  });

  // Secondary Customers for position filling & workflow testing
  const customerDefs = [
    { mobile: '+201000000002', email: 'pending_kyc@jameya.local', name: 'Mona Ali Sayed', kyc: KycStatus.PENDING },
    { mobile: '+201000000003', email: 'rejected_kyc@jameya.local', name: 'Kareem Omar Ibrahim', kyc: KycStatus.REJECTED },
    { mobile: '+201000000004', email: 'member4@jameya.local', name: 'Fatma Zaki', kyc: KycStatus.APPROVED },
    { mobile: '+201000000005', email: 'member5@jameya.local', name: 'Youssef Adel', kyc: KycStatus.APPROVED },
    { mobile: '+201000000006', email: 'member6@jameya.local', name: 'Sara Hossam', kyc: KycStatus.APPROVED },
    { mobile: '+201000000007', email: 'member7@jameya.local', name: 'Tarek Nabil', kyc: KycStatus.APPROVED },
    { mobile: '+201000000008', email: 'member8@jameya.local', name: 'Nour El-Din', kyc: KycStatus.APPROVED },
    { mobile: '+201000000009', email: 'member9@jameya.local', name: 'Hoda Mostafa', kyc: KycStatus.APPROVED },
    { mobile: '+201000000010', email: 'member10@jameya.local', name: 'Omar Khaled', kyc: KycStatus.APPROVED },
  ];

  const otherCustomers: Record<string, any> = {};
  for (const cDef of customerDefs) {
    const c = await prisma.customer.upsert({
      where: { mobileNumber: cDef.mobile },
      update: { legalName: cDef.name, status: CustomerStatus.ACTIVE },
      create: {
        mobileNumber: cDef.mobile,
        email: cDef.email,
        legalName: cDef.name,
        status: CustomerStatus.ACTIVE,
      },
    });
    otherCustomers[cDef.mobile] = c;
  }

  // Identity Profiles
  await prisma.identityProfile.upsert({
    where: { customerId: customer1.id },
    update: { kycStatus: KycStatus.APPROVED },
    create: {
      customerId: customer1.id,
      dateOfBirth: new Date('1990-05-15'),
      nationalIdentifierToken: '29005151234567',
      address: { city: 'Cairo', district: 'Maadi', street: 'Road 9' },
      kycStatus: KycStatus.APPROVED,
    },
  });

  await prisma.identityProfile.upsert({
    where: { customerId: otherCustomers['+201000000002'].id },
    update: { kycStatus: KycStatus.PENDING },
    create: {
      customerId: otherCustomers['+201000000002'].id,
      dateOfBirth: new Date('1994-08-20'),
      nationalIdentifierToken: '29408201234568',
      address: { city: 'Giza', district: 'Dokki' },
      kycStatus: KycStatus.PENDING,
    },
  });

  await prisma.identityProfile.upsert({
    where: { customerId: otherCustomers['+201000000003'].id },
    update: { kycStatus: KycStatus.REJECTED },
    create: {
      customerId: otherCustomers['+201000000003'].id,
      dateOfBirth: new Date('1988-11-10'),
      nationalIdentifierToken: '28811101234569',
      address: { city: 'Alexandria', district: 'Smouha' },
      kycStatus: KycStatus.REJECTED,
    },
  });

  // Approved Documents for Customer 1
  await prisma.document.deleteMany({ where: { customerId: customer1.id } });
  await prisma.document.create({
    data: {
      customerId: customer1.id,
      docType: DocumentType.NATIONAL_ID,
      encryptedObjectRef: 'docs/c1_national_id.jpg',
      status: DocumentStatus.APPROVED,
      reviewerAdminId: complianceAdmin.id,
      reviewedAt: new Date(),
    },
  });
  await prisma.document.create({
    data: {
      customerId: customer1.id,
      docType: DocumentType.PROOF_OF_INCOME,
      encryptedObjectRef: 'docs/c1_hr_letter.pdf',
      status: DocumentStatus.APPROVED,
      reviewerAdminId: complianceAdmin.id,
      reviewedAt: new Date(),
    },
  });

  // Pending Documents for Customer 2
  await prisma.document.deleteMany({ where: { customerId: otherCustomers['+201000000002'].id } });
  await prisma.document.create({
    data: {
      customerId: otherCustomers['+201000000002'].id,
      docType: DocumentType.NATIONAL_ID,
      encryptedObjectRef: 'docs/c2_national_id.jpg',
      status: DocumentStatus.PENDING,
    },
  });
  await prisma.document.create({
    data: {
      customerId: otherCustomers['+201000000002'].id,
      docType: DocumentType.UTILITY_BILL,
      encryptedObjectRef: 'docs/c2_electricity_bill.pdf',
      status: DocumentStatus.PENDING,
    },
  });

  // Rejected Document for Customer 3
  await prisma.document.deleteMany({ where: { customerId: otherCustomers['+201000000003'].id } });
  await prisma.document.create({
    data: {
      customerId: otherCustomers['+201000000003'].id,
      docType: DocumentType.NATIONAL_ID,
      encryptedObjectRef: 'docs/c3_national_id.jpg',
      status: DocumentStatus.REJECTED,
      reviewResult: 'ID document image is blurry and illegible. Please re-upload a clear photo.',
      reviewerAdminId: complianceAdmin.id,
      reviewedAt: new Date(),
    },
  });

  // Eligibility Decisions for Customer 1
  await prisma.eligibilityDecision.deleteMany({ where: { customerId: customer1.id } });
  await prisma.eligibilityDecision.create({
    data: {
      customerId: customer1.id,
      trustScore: 820,
      participationLimit: 150000.0,
      reasonCodes: ['HIGH_CREDIT_SCORE', 'VERIFIED_INCOME'],
      policyVersion: 'v1.0',
      inputsSnapshot: { monthlySalary: 35000, employmentType: 'FULL_TIME' },
      status: EligibilityStatus.ELIGIBLE,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    },
  });

  // Payment Methods for Customer 1
  await prisma.paymentMethod.deleteMany({ where: { customerId: customer1.id } });
  const cardPm = await prisma.paymentMethod.create({
    data: {
      customerId: customer1.id,
      providerToken: 'tok_visa_4242',
      type: PaymentMethodType.CREDIT_CARD,
      maskedDisplay: '•••• •••• •••• 4242',
      isDefault: true,
      verificationStatus: 'VERIFIED',
      expiryMetadata: { expMonth: 12, expYear: 2028 },
    },
  });

  const walletPm = await prisma.paymentMethod.create({
    data: {
      customerId: customer1.id,
      providerToken: 'tok_voda_01000000001',
      type: PaymentMethodType.VODAFONE_CASH,
      maskedDisplay: '010***001',
      isDefault: false,
      verificationStatus: 'VERIFIED',
    },
  });

  // ==========================================
  // 4. CIRCLES & MEMBERSHIPS & TRANSACTIONS
  // ==========================================
  console.log('⭕ Seeding Circles, Memberships, Installments & Transactions...');

  // Clean existing non-policy circles
  await prisma.ledgerEntry.deleteMany({});
  await prisma.paymentProof.deleteMany({});
  await prisma.transaction.deleteMany({});
  await prisma.installment.deleteMany({});
  await prisma.payout.deleteMany({});
  await prisma.contract.deleteMany({});
  await prisma.membership.deleteMany({});
  await prisma.circle.deleteMany({});

  // ------------------------------------------
  // CIRCLE 1: Active 10-Month Circle (2,000 EGP/mo, total 20,000 EGP)
  // ------------------------------------------
  const startDate1 = new Date();
  startDate1.setMonth(startDate1.getMonth() - 2); // Started 2 months ago
  const endDate1 = new Date(startDate1);
  endDate1.setMonth(endDate1.getMonth() + 10);

  const circle1 = await prisma.circle.create({
    data: {
      amount: 20000.0,
      contributionAmount: 2000.0,
      durationMonths: 10,
      cycleFrequency: 'MONTHLY',
      memberCapacity: 10,
      currentMembersCount: 10,
      startDate: startDate1,
      endDate: endDate1,
      status: CircleStatus.IN_PROGRESS,
      feePolicyId: seededPolicies[10].id,
      feePolicySnapshot: seededPolicies[10].positionFees,
    },
  });

  // Customer 1 in Position #3
  const membership1 = await prisma.membership.create({
    data: {
      customerId: customer1.id,
      circleId: circle1.id,
      payoutPosition: 3,
      status: MembershipStatus.ACTIVE,
      defaultPaymentMethodId: cardPm.id,
      joinedAt: startDate1,
    },
  });

  // Contract for Membership 1
  await prisma.contract.create({
    data: {
      membershipId: membership1.id,
      templateVersion: 'v1.0',
      renderedFileRef: 'contracts/c1_m1_contract.pdf',
      docHash: 'a1b2c3d4e5f67890123456789abcdef0',
      acceptanceEvidence: { ip: '196.221.45.12', userAgent: 'Flutter Client/1.0' },
      signatureOtpResult: 'VERIFIED',
      signedAt: startDate1,
    },
  });

  // Installments for Membership 1
  // Cycle 1 (Paid 60 days ago)
  const inst1_1 = await prisma.installment.create({
    data: {
      membershipId: membership1.id,
      cycleNumber: 1,
      dueDate: new Date(startDate1),
      amount: 2000.0,
      status: InstallmentStatus.PAID,
      paidDate: new Date(startDate1),
    },
  });
  const tx1_1 = await prisma.transaction.create({
    data: {
      installmentId: inst1_1.id,
      type: TransactionType.INSTALLMENT_PAYMENT,
      channelType: PaymentChannelType.CARD,
      amount: 2000.0,
      status: TransactionStatus.SETTLED,
      providerReference: 'ch_card_tx_101',
      idempotencyKey: 'idemp_tx_101',
      createdAt: new Date(startDate1),
      settledAt: new Date(startDate1),
    },
  });
  await prisma.ledgerEntry.createMany({
    data: [
      { transactionId: tx1_1.id, account: LedgerAccount.ESCROW_ACCOUNT, debit: 2000.0, credit: 0 },
      { transactionId: tx1_1.id, account: LedgerAccount.CUSTOMER_OBLIGATION, debit: 0, credit: 2000.0 },
    ],
  });

  // Cycle 2 (Paid 30 days ago)
  const dueDate1_2 = new Date(startDate1);
  dueDate1_2.setMonth(dueDate1_2.getMonth() + 1);
  const inst1_2 = await prisma.installment.create({
    data: {
      membershipId: membership1.id,
      cycleNumber: 2,
      dueDate: dueDate1_2,
      amount: 2000.0,
      status: InstallmentStatus.PAID,
      paidDate: dueDate1_2,
    },
  });
  const tx1_2 = await prisma.transaction.create({
    data: {
      installmentId: inst1_2.id,
      type: TransactionType.INSTALLMENT_PAYMENT,
      channelType: PaymentChannelType.VODAFONE_CASH,
      amount: 2000.0,
      status: TransactionStatus.SETTLED,
      providerReference: 'ch_voda_tx_102',
      idempotencyKey: 'idemp_tx_102',
      createdAt: dueDate1_2,
      settledAt: dueDate1_2,
    },
  });
  await prisma.ledgerEntry.createMany({
    data: [
      { transactionId: tx1_2.id, account: LedgerAccount.ESCROW_ACCOUNT, debit: 2000.0, credit: 0 },
      { transactionId: tx1_2.id, account: LedgerAccount.CUSTOMER_OBLIGATION, debit: 0, credit: 2000.0 },
    ],
  });

  // Cycle 3 (Due in 3 days - Upcoming Installment for Flutter Home card)
  const dueDate1_3 = new Date();
  dueDate1_3.setDate(dueDate1_3.getDate() + 3);
  await prisma.installment.create({
    data: {
      membershipId: membership1.id,
      cycleNumber: 3,
      dueDate: dueDate1_3,
      amount: 2000.0,
      status: InstallmentStatus.PENDING,
    },
  });

  // Cycles 4..10
  for (let cycle = 4; cycle <= 10; cycle++) {
    const cycleDueDate = new Date(startDate1);
    cycleDueDate.setMonth(cycleDueDate.getMonth() + cycle - 1);
    await prisma.installment.create({
      data: {
        membershipId: membership1.id,
        cycleNumber: cycle,
        dueDate: cycleDueDate,
        amount: 2000.0,
        status: InstallmentStatus.PENDING,
      },
    });
  }

  // Payout for Position #3 (Gross 20,000, Fee 10% = 2,000, Net = 18,000) scheduled for month 3
  const payout1ScheduledAt = new Date(startDate1);
  payout1ScheduledAt.setMonth(payout1ScheduledAt.getMonth() + 2);
  await prisma.payout.create({
    data: {
      membershipId: membership1.id,
      grossAmount: 20000.0,
      feeAmount: 2000.0,
      netAmount: 18000.0,
      beneficiaryToken: 'token_bank_c1',
      status: PayoutStatus.SCHEDULED,
      scheduledAt: payout1ScheduledAt,
    },
  });

  // Fill remaining positions in Circle 1 with secondary test customers
  const circle1Members = [
    { pos: 1, mob: '+201000000004' },
    { pos: 2, mob: '+201000000002' }, // Customer 2 with pending manual payment proof
    { pos: 4, mob: '+201000000005' },
    { pos: 5, mob: '+201000000006' },
    { pos: 6, mob: '+201000000007' },
    { pos: 7, mob: '+201000000008' },
    { pos: 8, mob: '+201000000009' },
    { pos: 9, mob: '+201000000010' },
    { pos: 10, mob: '+201000000003' },
  ];

  for (const mDef of circle1Members) {
    const m = await prisma.membership.create({
      data: {
        customerId: otherCustomers[mDef.mob].id,
        circleId: circle1.id,
        payoutPosition: mDef.pos,
        status: MembershipStatus.ACTIVE,
        joinedAt: startDate1,
      },
    });

    // If pos 1 (Customer 4): add an OVERDUE installment for Admin Late Installments testing
    if (mDef.pos === 1) {
      const overdueDate = new Date();
      overdueDate.setDate(overdueDate.getDate() - 10);
      await prisma.installment.create({
        data: {
          membershipId: m.id,
          cycleNumber: 2,
          dueDate: overdueDate,
          amount: 2000.0,
          status: InstallmentStatus.OVERDUE,
          retryAttempt: 2,
          nextRetryAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
    }

    // If pos 2 (Customer 2): add a PENDING_VERIFICATION payment proof for Admin Payment Review testing
    if (mDef.pos === 2) {
      const instProof = await prisma.installment.create({
        data: {
          membershipId: m.id,
          cycleNumber: 3,
          dueDate: new Date(),
          amount: 2000.0,
          status: InstallmentStatus.PENDING,
        },
      });
      const txProof = await prisma.transaction.create({
        data: {
          installmentId: instProof.id,
          type: TransactionType.INSTALLMENT_PAYMENT,
          channelType: PaymentChannelType.VODAFONE_CASH,
          amount: 2000.0,
          status: TransactionStatus.PENDING_VERIFICATION,
          idempotencyKey: 'idemp_proof_tx_201',
        },
      });
      await prisma.paymentProof.create({
        data: {
          transactionId: txProof.id,
          paymentChannel: PaymentChannelType.VODAFONE_CASH,
          proofScreenshotRef: 'proofs/vodafone_receipt_sample.jpg',
          claimedAmount: 2000.0,
          senderMobileOrRef: '01098765432',
          reviewStatus: ReviewStatus.PENDING,
          submittedAt: new Date(),
        },
      });
    }
  }

  // ------------------------------------------
  // CIRCLE 2: Active 6-Month Circle (5,000 EGP/mo, total 30,000 EGP)
  // ------------------------------------------
  const startDate2 = new Date();
  startDate2.setMonth(startDate2.getMonth() - 1); // Started 1 month ago
  const endDate2 = new Date(startDate2);
  endDate2.setMonth(endDate2.getMonth() + 6);

  const circle2 = await prisma.circle.create({
    data: {
      amount: 30000.0,
      contributionAmount: 5000.0,
      durationMonths: 6,
      cycleFrequency: 'MONTHLY',
      memberCapacity: 6,
      currentMembersCount: 6,
      startDate: startDate2,
      endDate: endDate2,
      status: CircleStatus.IN_PROGRESS,
      feePolicyId: seededPolicies[6].id,
      feePolicySnapshot: seededPolicies[6].positionFees,
    },
  });

  // Customer 1 in Position #1 (Early payout position)
  const membership2 = await prisma.membership.create({
    data: {
      customerId: customer1.id,
      circleId: circle2.id,
      payoutPosition: 1,
      status: MembershipStatus.ACTIVE,
      defaultPaymentMethodId: cardPm.id,
      joinedAt: startDate2,
    },
  });

  // Contract for Membership 2
  await prisma.contract.create({
    data: {
      membershipId: membership2.id,
      templateVersion: 'v1.0',
      renderedFileRef: 'contracts/c1_m2_contract.pdf',
      docHash: 'b2c3d4e5f67890123456789abcdef01a',
      acceptanceEvidence: { ip: '196.221.45.12', userAgent: 'Flutter Client/1.0' },
      signatureOtpResult: 'VERIFIED',
      signedAt: startDate2,
    },
  });

  // Disbursed Payout for Position #1 (Gross 30,000, Fee 8% = 2,400, Net = 27,600)
  const payout2DisbursedAt = new Date(startDate2);
  payout2DisbursedAt.setDate(payout2DisbursedAt.getDate() + 5);
  const payout2 = await prisma.payout.create({
    data: {
      membershipId: membership2.id,
      grossAmount: 30000.0,
      feeAmount: 2400.0,
      netAmount: 27600.0,
      beneficiaryToken: 'token_bank_c2',
      status: PayoutStatus.DISBURSED,
      providerReference: 'po_disb_ref_201',
      scheduledAt: startDate2,
      disbursedAt: payout2DisbursedAt,
    },
  });
  await prisma.ledgerEntry.createMany({
    data: [
      { payoutId: payout2.id, account: LedgerAccount.PAYOUT_OUTFLOW, debit: 27600.0, credit: 0 },
      { payoutId: payout2.id, account: LedgerAccount.ESCROW_ACCOUNT, debit: 0, credit: 27600.0 },
    ],
  });

  // Cycle 1 Paid installment for Circle 2
  const inst2_1 = await prisma.installment.create({
    data: {
      membershipId: membership2.id,
      cycleNumber: 1,
      dueDate: new Date(startDate2),
      amount: 5000.0,
      status: InstallmentStatus.PAID,
      paidDate: new Date(startDate2),
    },
  });
  const tx2_1 = await prisma.transaction.create({
    data: {
      installmentId: inst2_1.id,
      type: TransactionType.INSTALLMENT_PAYMENT,
      channelType: PaymentChannelType.CARD,
      amount: 5000.0,
      status: TransactionStatus.SETTLED,
      providerReference: 'ch_card_tx_201',
      idempotencyKey: 'idemp_tx_201',
      createdAt: startDate2,
      settledAt: startDate2,
    },
  });
  await prisma.ledgerEntry.createMany({
    data: [
      { transactionId: tx2_1.id, account: LedgerAccount.ESCROW_ACCOUNT, debit: 5000.0, credit: 0 },
      { transactionId: tx2_1.id, account: LedgerAccount.CUSTOMER_OBLIGATION, debit: 0, credit: 5000.0 },
    ],
  });

  // Cycle 2 (Due in 12 days)
  const dueDate2_2 = new Date();
  dueDate2_2.setDate(dueDate2_2.getDate() + 12);
  await prisma.installment.create({
    data: {
      membershipId: membership2.id,
      cycleNumber: 2,
      dueDate: dueDate2_2,
      amount: 5000.0,
      status: InstallmentStatus.PENDING,
    },
  });

  // Cycles 3..6
  for (let cycle = 3; cycle <= 6; cycle++) {
    const cycleDueDate = new Date(startDate2);
    cycleDueDate.setMonth(cycleDueDate.getMonth() + cycle - 1);
    await prisma.installment.create({
      data: {
        membershipId: membership2.id,
        cycleNumber: cycle,
        dueDate: cycleDueDate,
        amount: 5000.0,
        status: InstallmentStatus.PENDING,
      },
    });
  }

  // ------------------------------------------
  // CIRCLE 3: Completed 6-Month Circle (1,000 EGP/mo, total 6,000 EGP)
  // ------------------------------------------
  const startDate3 = new Date();
  startDate3.setMonth(startDate3.getMonth() - 8);
  const endDate3 = new Date(startDate3);
  endDate3.setMonth(endDate3.getMonth() + 6);

  const circle3 = await prisma.circle.create({
    data: {
      amount: 6000.0,
      contributionAmount: 1000.0,
      durationMonths: 6,
      cycleFrequency: 'MONTHLY',
      memberCapacity: 6,
      currentMembersCount: 6,
      startDate: startDate3,
      endDate: endDate3,
      status: CircleStatus.COMPLETED,
      feePolicyId: seededPolicies[6].id,
      feePolicySnapshot: seededPolicies[6].positionFees,
    },
  });

  const membership3 = await prisma.membership.create({
    data: {
      customerId: customer1.id,
      circleId: circle3.id,
      payoutPosition: 6, // Late position (-24% fee discount)
      status: MembershipStatus.COMPLETED,
      joinedAt: startDate3,
    },
  });

  // All 6 installments paid
  for (let c = 1; c <= 6; c++) {
    const dDate = new Date(startDate3);
    dDate.setMonth(dDate.getMonth() + c - 1);
    const inst3 = await prisma.installment.create({
      data: {
        membershipId: membership3.id,
        cycleNumber: c,
        dueDate: dDate,
        amount: 1000.0,
        status: InstallmentStatus.PAID,
        paidDate: dDate,
      },
    });
    await prisma.transaction.create({
      data: {
        installmentId: inst3.id,
        type: TransactionType.INSTALLMENT_PAYMENT,
        channelType: PaymentChannelType.CARD,
        amount: 1000.0,
        status: TransactionStatus.SETTLED,
        idempotencyKey: `idemp_tx_30${c}`,
        createdAt: dDate,
        settledAt: dDate,
      },
    });
  }

  // Disbursed Payout for Position #6 (Gross 6,000, Fee -24% = -1,440 discount, Net = 7,440)
  const payout3DisbursedAt = new Date(endDate3);
  await prisma.payout.create({
    data: {
      membershipId: membership3.id,
      grossAmount: 6000.0,
      feeAmount: -1440.0,
      netAmount: 7440.0,
      beneficiaryToken: 'token_bank_c3',
      status: PayoutStatus.DISBURSED,
      providerReference: 'po_disb_ref_301',
      scheduledAt: endDate3,
      disbursedAt: payout3DisbursedAt,
    },
  });

  // ------------------------------------------
  // CIRCLES 4, 5, 6: Upcoming Marketplace Circles
  // ------------------------------------------
  // Marketplace Circle 1: 12-Month Circle (10,000 EGP/mo, 120,000 EGP total)
  const startMarket1 = new Date();
  startMarket1.setDate(startMarket1.getDate() + 15);
  const endMarket1 = new Date(startMarket1);
  endMarket1.setMonth(endMarket1.getMonth() + 12);

  const marketCircle1 = await prisma.circle.create({
    data: {
      amount: 120000.0,
      contributionAmount: 10000.0,
      durationMonths: 12,
      cycleFrequency: 'MONTHLY',
      memberCapacity: 12,
      currentMembersCount: 5,
      startDate: startMarket1,
      endDate: endMarket1,
      status: CircleStatus.UPCOMING,
      feePolicyId: seededPolicies[12].id,
      feePolicySnapshot: seededPolicies[12].positionFees,
    },
  });

  // Fill 5 positions in Market Circle 1
  const m1Positions = [1, 2, 4, 5, 9];
  const m1Mobiles = ['+201000000004', '+201000000005', '+201000000006', '+201000000007', '+201000000008'];
  for (let i = 0; i < m1Positions.length; i++) {
    await prisma.membership.create({
      data: {
        customerId: otherCustomers[m1Mobiles[i]].id,
        circleId: marketCircle1.id,
        payoutPosition: m1Positions[i],
        status: MembershipStatus.ACTIVE,
      },
    });
  }

  // Marketplace Circle 2: 6-Month Circle (2,000 EGP/mo, 12,000 EGP total) - Completely Empty
  const startMarket2 = new Date();
  startMarket2.setDate(startMarket2.getDate() + 20);
  const endMarket2 = new Date(startMarket2);
  endMarket2.setMonth(endMarket2.getMonth() + 6);

  await prisma.circle.create({
    data: {
      amount: 12000.0,
      contributionAmount: 2000.0,
      durationMonths: 6,
      cycleFrequency: 'MONTHLY',
      memberCapacity: 6,
      currentMembersCount: 0,
      startDate: startMarket2,
      endDate: endMarket2,
      status: CircleStatus.UPCOMING,
      feePolicyId: seededPolicies[6].id,
      feePolicySnapshot: seededPolicies[6].positionFees,
    },
  });

  // Marketplace Circle 3: 10-Month Circle (3,000 EGP/mo, 30,000 EGP total) - Almost Full (9 of 10 filled)
  const startMarket3 = new Date();
  startMarket3.setDate(startMarket3.getDate() + 5);
  const endMarket3 = new Date(startMarket3);
  endMarket3.setMonth(endMarket3.getMonth() + 10);

  const marketCircle3 = await prisma.circle.create({
    data: {
      amount: 30000.0,
      contributionAmount: 3000.0,
      durationMonths: 10,
      cycleFrequency: 'MONTHLY',
      memberCapacity: 10,
      currentMembersCount: 9,
      startDate: startMarket3,
      endDate: endMarket3,
      status: CircleStatus.UPCOMING,
      feePolicyId: seededPolicies[10].id,
      feePolicySnapshot: seededPolicies[10].positionFees,
    },
  });

  // Fill positions 1..9 in Market Circle 3
  const m3Mobiles = [
    '+201000000002', '+201000000003', '+201000000004', '+201000000005',
    '+201000000006', '+201000000007', '+201000000008', '+201000000009', '+201000000010'
  ];
  for (let pos = 1; pos <= 9; pos++) {
    await prisma.membership.create({
      data: {
        customerId: otherCustomers[m3Mobiles[pos - 1]].id,
        circleId: marketCircle3.id,
        payoutPosition: pos,
        status: MembershipStatus.ACTIVE,
      },
    });
  }

  // ==========================================
  // 5. IN-APP NOTIFICATIONS
  // ==========================================
  console.log('🔔 Seeding In-App Notifications...');

  await prisma.inAppNotification.deleteMany({ where: { customerId: customer1.id } });
  await prisma.inAppNotification.createMany({
    data: [
      {
        customerId: customer1.id,
        type: NotificationType.INSTALLMENT_DUE_SOON,
        title: 'Upcoming Installment Due',
        body: 'Your monthly installment of 2,000 EGP for Golden Saver 10-Month Circle is due in 3 days.',
        relatedEntityType: 'installment',
        isRead: false,
        createdAt: new Date(),
      },
      {
        customerId: customer1.id,
        type: NotificationType.INSTALLMENT_PAID,
        title: 'Payment Successful',
        body: 'We received your payment of 5,000 EGP for Quick Savings 6-Month Circle.',
        relatedEntityType: 'transaction',
        isRead: true,
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      },
      {
        customerId: customer1.id,
        type: NotificationType.JOIN_CONFIRMED,
        title: 'Circle Position Reserved',
        body: 'You are confirmed in Golden Saver 10-Month Circle at Payout Position #3.',
        relatedEntityType: 'circle',
        relatedEntityId: circle1.id,
        isRead: true,
        createdAt: startDate1,
      },
      {
        customerId: customer1.id,
        type: NotificationType.CONTRACT_AVAILABLE,
        title: 'Contract Signed',
        body: 'Your digital agreement for Golden Saver 10-Month Circle is active.',
        relatedEntityType: 'contract',
        isRead: true,
        createdAt: startDate1,
      },
      {
        customerId: customer1.id,
        type: NotificationType.DOCUMENT_APPROVED,
        title: 'KYC Verification Approved',
        body: 'Your National ID and Proof of Income documents have been verified successfully.',
        relatedEntityType: 'customer',
        isRead: true,
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      },
    ],
  });

  // ==========================================
  // 6. AUDIT EVENTS
  // ==========================================
  console.log('📋 Seeding Admin Audit Logs...');

  await prisma.auditEvent.deleteMany({});
  await prisma.auditEvent.createMany({
    data: [
      {
        actorAdminId: complianceAdmin.id,
        action: 'KYC_DOCUMENT_APPROVED',
        entityType: 'Document',
        entityId: customer1.id,
        newValue: { status: 'APPROVED', docType: 'NATIONAL_ID' },
        reason: 'Valid and clear national ID',
        ipAddress: '197.35.12.90',
        occurredAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      },
      {
        actorAdminId: superAdmin.id,
        action: 'CIRCLE_STATUS_MUTATED',
        entityType: 'Circle',
        entityId: circle1.id,
        oldValue: { status: 'UPCOMING' },
        newValue: { status: 'IN_PROGRESS' },
        reason: 'Circle fully subscribed and start date reached',
        ipAddress: '197.35.12.90',
        occurredAt: startDate1,
      },
    ],
  });

  console.log(`\n=================== SEED COMPLETE ===================`);
  console.log(`✅ Super Admin Account: ${superAdminEmail} / ${superAdminPassword}`);
  console.log(`✅ Finance Admin Account: finance@jameya.local / Finance123!`);
  console.log(`✅ Compliance Admin Account: compliance@jameya.local / Compliance123!`);
  console.log(`✅ Primary Flutter Test Customer Mobile: ${primaryMobile}`);
  console.log(`✅ Test Customer Email: testuser@jameya.local`);
  console.log(`✅ Seeded 6 Circles (2 Active, 1 Completed, 3 Upcoming Marketplace)`);
  console.log(`✅ Seeded Installments, Transactions, Payouts, Ledger & Notifications`);
  console.log(`====================================================`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

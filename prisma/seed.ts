import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { randomBytes, scryptSync } from 'node:crypto';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const SUPER_ADMIN_ROLE = 'SUPER_ADMIN';

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

async function main(): Promise<void> {
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

  let superAdminRole;
  for (const roleDef of rolesToSeed) {
    const seededRole = await prisma.role.upsert({
      where: { name: roleDef.name },
      update: { permissions: roleDef.permissions },
      create: {
        name: roleDef.name,
        permissions: roleDef.permissions,
      },
    });
    if (roleDef.name === 'SUPER_ADMIN') {
      superAdminRole = seededRole;
    }
  }
  const role = superAdminRole!;

  const adminEmail =
    process.env.SEED_ADMIN_EMAIL ?? 'admin@jameya.local';
  const adminPassword =
    process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';

  await prisma.adminUser.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash: hashPassword(adminPassword),
      roleId: role.id,
      mfaEnabled: false,
    },
  });

  // Seed default ACTIVE fee policies according to exact Jameya 12-Month, 10-Month, and 6-Month Fee Tables
  const defaultPolicies = [
    {
      version: 'v1.0-6m',
      durationMonths: 6,
      positionFees: {
        '1': 8.0,
        '2': 7.0,
        '3': 4.0,
        '4': 0.0,
        '5': -15.0,
        '6': -24.0,
      },
    },
    {
      version: 'v1.0-10m',
      durationMonths: 10,
      positionFees: {
        '1': 14.0,
        '2': 12.0,
        '3': 10.0,
        '4': 8.0,
        '5': 6.0,
        '6': 0.0,
        '7': 0.0,
        '8': -5.0,
        '9': -7.0,
        '10': -10.0,
      },
    },
    {
      version: 'v1.0-12m',
      durationMonths: 12,
      positionFees: {
        '1': 16.0,
        '2': 14.0,
        '3': 12.0,
        '4': 10.0,
        '5': 8.0,
        '6': 6.0,
        '7': 0.0,
        '8': 0.0,
        '9': 0.0,
        '10': -7.0,
        '11': -10.0,
        '12': -12.0,
      },
    },
  ];

  for (const policyData of defaultPolicies) {
    await prisma.feePolicy.updateMany({
      where: { durationMonths: policyData.durationMonths, status: 'ACTIVE' },
      data: { status: 'RETIRED' },
    });

    const created = await prisma.feePolicy.create({
      data: {
        version: policyData.version,
        durationMonths: policyData.durationMonths,
        positionFees: policyData.positionFees,
        status: 'ACTIVE',
        effectiveFrom: new Date(),
      },
    });

    console.log(
      `Seeded ACTIVE fee policy for ${policyData.durationMonths}m: ${created.version} (id: ${created.id})`,
    );

    // Seed a sample UPCOMING circle for each policy if no upcoming circle exists for this duration
    const existingCircle = await prisma.circle.findFirst({
      where: { durationMonths: policyData.durationMonths, status: 'UPCOMING' },
    });

    if (!existingCircle) {
      const monthlyContribution = 1000;
      const totalAmount = monthlyContribution * policyData.durationMonths;
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() + 1);
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + policyData.durationMonths);

      const sampleCircle = await prisma.circle.create({
        data: {
          amount: totalAmount,
          contributionAmount: monthlyContribution,
          durationMonths: policyData.durationMonths,
          cycleFrequency: 'MONTHLY',
          memberCapacity: policyData.durationMonths,
          currentMembersCount: 0,
          startDate,
          endDate,
          status: 'UPCOMING',
          feePolicyId: created.id,
          feePolicySnapshot: policyData.positionFees,
        },
      });
      console.log(
        `Seeded UPCOMING ${policyData.durationMonths}m circle (${totalAmount} EGP total, ${monthlyContribution} EGP/mo) (id: ${sampleCircle.id})`,
      );
    }
  }

  // Seed sample test customer for Flutter team testing
  const testCustomerMobile = '+201000000001';
  const testCustomer = await prisma.customer.upsert({
    where: { mobileNumber: testCustomerMobile },
    update: {},
    create: {
      mobileNumber: testCustomerMobile,
      email: 'testuser@jameya.local',
      legalName: 'Flutter Test Customer',
      status: 'ACTIVE',
    },
  });

  console.log(`\n=================== SEED SUMMARY ===================`);
  console.log(`✅ Seeded Role: ${SUPER_ADMIN_ROLE}`);
  console.log(`✅ Seeded Admin Email: ${adminEmail}`);
  console.log(`✅ Seeded Admin Password: ${adminPassword}`);
  console.log(`✅ Seeded Test Customer Mobile: ${testCustomer.mobileNumber}`);
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

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
  const role = await prisma.role.upsert({
    where: { name: SUPER_ADMIN_ROLE },
    update: { permissions: ['*'] },
    create: {
      name: SUPER_ADMIN_ROLE,
      permissions: ['*'],
    },
  });

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
  }

  console.log(`\nSeeded role: ${SUPER_ADMIN_ROLE}`);
  console.log(`Seeded admin: ${adminEmail}`);
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

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

  // Seed a default fee policy for testing circle creation
  let feePolicy = await prisma.feePolicy.findFirst({
    where: { version: 'v1-dev' },
  });

  if (!feePolicy) {
    feePolicy = await prisma.feePolicy.create({
      data: {
        version: 'v1-dev',
        durationMonths: 10,
        // positionFees: fee percentages per payout position (position 1 = first to receive)
        positionFees: {
          1: 5,   // 5% fee for first payout position
          2: 4,
          3: 3,
          4: 3,
          5: 2,
          6: 2,
          7: 1,
          8: 1,
          9: 1,
          10: 0,  // Last position pays no fee
        },
        status: 'ACTIVE',
      },
    });
  }

  console.log(`Seeded role: ${SUPER_ADMIN_ROLE}`);
  console.log(`Seeded admin: ${adminEmail}`);
  console.log(`Seeded fee policy: ${feePolicy.version} (id: ${feePolicy.id})`);
  console.log(`\n📋 Use this feePolicyId when testing circle creation:\n   ${feePolicy.id}`);
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

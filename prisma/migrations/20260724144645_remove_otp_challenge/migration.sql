/*
  Warnings:

  - You are about to drop the `otp_challenges` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterTable
ALTER TABLE "audit_events" ALTER COLUMN "ip_address" DROP NOT NULL,
ALTER COLUMN "device_info" DROP NOT NULL,
ALTER COLUMN "correlation_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "circles" ALTER COLUMN "cycle_frequency" SET DEFAULT 'MONTHLY',
ALTER COLUMN "status" SET DEFAULT 'UPCOMING';

-- AlterTable
ALTER TABLE "customers" ALTER COLUMN "consent_versions" DROP NOT NULL,
ALTER COLUMN "risk_flags" DROP NOT NULL;

-- AlterTable
ALTER TABLE "fee_policies" ALTER COLUMN "effective_from" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "memberships" ALTER COLUMN "obligation_summary" DROP NOT NULL;

-- AlterTable
ALTER TABLE "refresh_tokens" ALTER COLUMN "device_info" DROP NOT NULL;

-- DropTable
DROP TABLE "otp_challenges";

-- DropEnum
DROP TYPE "OtpPurpose";

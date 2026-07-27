-- CreateEnum IF NOT EXISTS
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FeePolicyStatus') THEN
        CREATE TYPE "FeePolicyStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');
    END IF;
END $$;

-- AlterTable fee_policies
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'fee_policies' AND column_name = 'status' AND udt_name = 'AdminStatus'
    ) THEN
        ALTER TABLE "fee_policies" DROP COLUMN "status";
        ALTER TABLE "fee_policies" ADD COLUMN "status" "FeePolicyStatus" NOT NULL DEFAULT 'DRAFT';
    END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "otp_requests" (
    "id" UUID NOT NULL,
    "target" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "cooldown_until" TIMESTAMP(3),
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "otp_requests_target_purpose_idx" ON "otp_requests"("target", "purpose");

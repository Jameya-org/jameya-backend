-- Make mobile_number nullable — phone is now collected at the profile step, not registration
ALTER TABLE "customers" ALTER COLUMN "mobile_number" DROP NOT NULL;

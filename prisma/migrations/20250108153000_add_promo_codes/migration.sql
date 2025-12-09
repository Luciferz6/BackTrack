-- Add promotional tracking fields on users
ALTER TABLE "users"
  ADD COLUMN "promoOriginalPlanId" TEXT,
  ADD COLUMN "promoExpiresAt" TIMESTAMP(3);

-- Create table to track promo code redemptions
CREATE TABLE "promo_code_redemptions" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "promo_code_redemptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "promo_code_redemptions_code_userId_key"
  ON "promo_code_redemptions"("code", "userId");

CREATE INDEX "promo_code_redemptions_code_idx"
  ON "promo_code_redemptions"("code");

ALTER TABLE "promo_code_redemptions"
  ADD CONSTRAINT "promo_code_redemptions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

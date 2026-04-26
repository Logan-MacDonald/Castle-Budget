-- Add the new per-pool amount columns.
ALTER TABLE "SavingsGoal" ADD COLUMN "cashAmount"     DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "SavingsGoal" ADD COLUMN "investedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- Backfill from the previous single-amount + kind shape.
UPDATE "SavingsGoal" SET "cashAmount"     = "currentAmount" WHERE "kind" = 'CASH';
UPDATE "SavingsGoal" SET "investedAmount" = "currentAmount" WHERE "kind" = 'INVESTMENT';

-- Drop the now-redundant columns and enum.
ALTER TABLE "SavingsGoal" DROP COLUMN "kind";
ALTER TABLE "SavingsGoal" DROP COLUMN "startingBalance";
ALTER TABLE "SavingsGoal" DROP COLUMN "currentAmount";

DROP TYPE "SavingsKind";

-- CreateEnum
CREATE TYPE "SavingsKind" AS ENUM ('CASH', 'INVESTMENT');

-- AlterTable
ALTER TABLE "SavingsGoal" ADD COLUMN     "kind" "SavingsKind" NOT NULL DEFAULT 'CASH';

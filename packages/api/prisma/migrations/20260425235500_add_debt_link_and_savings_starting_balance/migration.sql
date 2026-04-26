-- AlterTable
ALTER TABLE "Bill" ADD COLUMN     "debtId" TEXT;

-- AlterTable
ALTER TABLE "SavingsGoal" ADD COLUMN     "startingBalance" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "Bill_debtId_key" ON "Bill"("debtId");

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "Debt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

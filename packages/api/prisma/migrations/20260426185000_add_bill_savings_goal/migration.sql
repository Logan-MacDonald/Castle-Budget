-- AlterTable
ALTER TABLE "Bill" ADD COLUMN "savingsGoalId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Bill_savingsGoalId_key" ON "Bill"("savingsGoalId");

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_savingsGoalId_fkey" FOREIGN KEY ("savingsGoalId") REFERENCES "SavingsGoal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

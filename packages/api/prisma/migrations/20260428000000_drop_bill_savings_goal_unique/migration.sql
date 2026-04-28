-- A SavingsGoal can have many incoming bills (monthly auto-transfer
-- plus one-off contributions like gifts), so the 1:1 constraint was
-- wrong. Drop the unique index — keep the FK.
DROP INDEX "Bill_savingsGoalId_key";

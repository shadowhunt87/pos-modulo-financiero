-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'REJECT';

-- AlterEnum
ALTER TYPE "JournalEntryStatus" ADD VALUE 'REJECTED';

-- AlterTable
ALTER TABLE "AccountingSettings" ADD COLUMN     "requireEntryApproval" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "JournalEntry" ADD COLUMN     "rejectReason" TEXT,
ADD COLUMN     "rejectedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "passwordChangedAt" TIMESTAMP(3);

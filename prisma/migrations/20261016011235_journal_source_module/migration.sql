-- AlterTable
ALTER TABLE "JournalEntry" ADD COLUMN     "sourceModule" VARCHAR(60);

-- CreateIndex
CREATE INDEX "JournalEntry_companyId_sourceModule_sourceId_idx" ON "JournalEntry"("companyId", "sourceModule", "sourceId");

-- Marcas de revisión y archivos de la auditora (PLAN-v0.2 §5.1, Fase 6)
-- CreateEnum
CREATE TYPE "AuditEntityType" AS ENUM ('JOURNAL_ENTRY', 'INVOICE', 'PAYMENT', 'BANK_RECONCILIATION');

-- CreateEnum
CREATE TYPE "AuditMark" AS ENUM ('VERIFIED', 'VOUCHED', 'RECALCULATED', 'CONFIRMED', 'EXCEPTION');

-- CreateTable
CREATE TABLE "AuditCheckmark" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "workpaperId" TEXT,
    "entityType" "AuditEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "mark" "AuditMark" NOT NULL,
    "note" VARCHAR(2000),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditCheckmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditFile" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "workpaperId" TEXT,
    "findingId" TEXT,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditCheckmark_companyId_idx" ON "AuditCheckmark"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditCheckmark_engagementId_entityType_entityId_key" ON "AuditCheckmark"("engagementId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditFile_companyId_idx" ON "AuditFile"("companyId");

-- CreateIndex
CREATE INDEX "AuditFile_workpaperId_idx" ON "AuditFile"("workpaperId");

-- CreateIndex
CREATE INDEX "AuditFile_findingId_idx" ON "AuditFile"("findingId");

-- AddForeignKey
ALTER TABLE "AuditCheckmark" ADD CONSTRAINT "AuditCheckmark_engagementId_companyId_fkey" FOREIGN KEY ("engagementId", "companyId") REFERENCES "AuditEngagement"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditCheckmark" ADD CONSTRAINT "AuditCheckmark_workpaperId_companyId_fkey" FOREIGN KEY ("workpaperId", "companyId") REFERENCES "AuditWorkpaper"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditFile" ADD CONSTRAINT "AuditFile_engagementId_companyId_fkey" FOREIGN KEY ("engagementId", "companyId") REFERENCES "AuditEngagement"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditFile" ADD CONSTRAINT "AuditFile_workpaperId_companyId_fkey" FOREIGN KEY ("workpaperId", "companyId") REFERENCES "AuditWorkpaper"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditFile" ADD CONSTRAINT "AuditFile_findingId_companyId_fkey" FOREIGN KEY ("findingId", "companyId") REFERENCES "AuditFinding"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

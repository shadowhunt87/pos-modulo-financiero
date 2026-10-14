-- Encargos, papeles de trabajo, procedimientos y hallazgos (PLAN-v0.2 §5.1, Fase 5)
-- CreateEnum
CREATE TYPE "EngagementStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'IN_REVIEW', 'CLOSED');

-- CreateEnum
CREATE TYPE "AuditArea" AS ENUM ('CASH_AND_BANKS', 'RECEIVABLES', 'PAYABLES', 'REVENUE', 'EXPENSES', 'TAXES', 'EQUITY', 'FIXED_ASSETS', 'INVENTORY', 'OTHER');

-- CreateEnum
CREATE TYPE "WorkpaperStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'DONE');

-- CreateEnum
CREATE TYPE "FindingKind" AS ENUM ('FINDING', 'NOTE');

-- CreateEnum
CREATE TYPE "FindingSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "FindingStatus" AS ENUM ('DRAFT', 'COMMUNICATED', 'RESPONDED', 'RESOLVED', 'RISK_ACCEPTED');

-- CreateTable
CREATE TABLE "AuditEngagement" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "objective" TEXT,
    "scope" VARCHAR(5000),
    "auditorFirm" VARCHAR(200),
    "overallConclusion" VARCHAR(10000),
    "status" "EngagementStatus" NOT NULL DEFAULT 'PLANNED',
    "nextFindingNumber" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "closedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "reopenReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditEngagement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditWorkpaper" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "area" "AuditArea" NOT NULL,
    "reference" VARCHAR(20) NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "objective" TEXT,
    "conclusion" VARCHAR(5000),
    "status" "WorkpaperStatus" NOT NULL DEFAULT 'PENDING',
    "preparedById" TEXT,
    "preparedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditWorkpaper_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditProcedure" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workpaperId" TEXT NOT NULL,
    "description" VARCHAR(1000) NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "result" VARCHAR(2000),
    "doneById" TEXT,
    "doneAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditProcedure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditFinding" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "workpaperId" TEXT,
    "number" INTEGER NOT NULL,
    "kind" "FindingKind" NOT NULL DEFAULT 'FINDING',
    "title" VARCHAR(200) NOT NULL,
    "condition" VARCHAR(5000) NOT NULL,
    "criteria" VARCHAR(5000),
    "cause" VARCHAR(5000),
    "effect" VARCHAR(5000),
    "recommendation" VARCHAR(5000),
    "severity" "FindingSeverity",
    "managementResponse" VARCHAR(5000),
    "actionPlan" VARCHAR(5000),
    "responsible" VARCHAR(120),
    "dueDate" DATE,
    "respondedById" TEXT,
    "respondedAt" TIMESTAMP(3),
    "closeNote" VARCHAR(2000),
    "status" "FindingStatus" NOT NULL DEFAULT 'DRAFT',
    "includeInReport" BOOLEAN NOT NULL DEFAULT true,
    "amount" DECIMAL(19,4),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditFinding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditEngagement_companyId_status_idx" ON "AuditEngagement"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AuditEngagement_companyId_periodStart_periodEnd_key" ON "AuditEngagement"("companyId", "periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "AuditEngagement_id_companyId_key" ON "AuditEngagement"("id", "companyId");

-- CreateIndex
CREATE INDEX "AuditWorkpaper_companyId_idx" ON "AuditWorkpaper"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditWorkpaper_engagementId_reference_key" ON "AuditWorkpaper"("engagementId", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "AuditWorkpaper_id_companyId_key" ON "AuditWorkpaper"("id", "companyId");

-- CreateIndex
CREATE INDEX "AuditProcedure_companyId_idx" ON "AuditProcedure"("companyId");

-- CreateIndex
CREATE INDEX "AuditProcedure_workpaperId_idx" ON "AuditProcedure"("workpaperId");

-- CreateIndex
CREATE INDEX "AuditFinding_companyId_status_idx" ON "AuditFinding"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AuditFinding_engagementId_number_key" ON "AuditFinding"("engagementId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "AuditFinding_id_companyId_key" ON "AuditFinding"("id", "companyId");

-- AddForeignKey
ALTER TABLE "AuditEngagement" ADD CONSTRAINT "AuditEngagement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditWorkpaper" ADD CONSTRAINT "AuditWorkpaper_engagementId_companyId_fkey" FOREIGN KEY ("engagementId", "companyId") REFERENCES "AuditEngagement"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditProcedure" ADD CONSTRAINT "AuditProcedure_workpaperId_companyId_fkey" FOREIGN KEY ("workpaperId", "companyId") REFERENCES "AuditWorkpaper"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditFinding" ADD CONSTRAINT "AuditFinding_engagementId_companyId_fkey" FOREIGN KEY ("engagementId", "companyId") REFERENCES "AuditEngagement"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditFinding" ADD CONSTRAINT "AuditFinding_workpaperId_companyId_fkey" FOREIGN KEY ("workpaperId", "companyId") REFERENCES "AuditWorkpaper"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

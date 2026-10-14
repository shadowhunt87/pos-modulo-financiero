-- CreateEnum
CREATE TYPE "ObligationFrequency" AS ENUM ('MONTHLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "ObligationRule" AS ENUM ('DAY_OF_NEXT_MONTH', 'DAYS_AFTER_FY_END', 'FIXED_DATE');

-- CreateTable
CREATE TABLE "FiscalObligation" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "name" VARCHAR(200) NOT NULL,
    "ownerText" TEXT,
    "frequency" "ObligationFrequency" NOT NULL,
    "rule" "ObligationRule" NOT NULL,
    "ruleValue" INTEGER NOT NULL,
    "appliesWhen" JSONB,
    "validFrom" DATE NOT NULL,
    "supersedesId" TEXT,
    "source" VARCHAR(300) NOT NULL,
    "loadId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FiscalObligation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "source" VARCHAR(300) NOT NULL,
    "loadId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiscalFiling" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "obligationCode" VARCHAR(30) NOT NULL,
    "period" VARCHAR(7) NOT NULL,
    "filedAt" TIMESTAMP(3) NOT NULL,
    "filedById" TEXT NOT NULL,
    "reference" VARCHAR(100),
    "snapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FiscalFiling_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BContingency" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "endedById" TEXT,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "BContingency_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FiscalObligation_supersedesId_key" ON "FiscalObligation"("supersedesId");

-- CreateIndex
CREATE UNIQUE INDEX "FiscalObligation_code_validFrom_revision_key" ON "FiscalObligation"("code", "validFrom", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "Holiday_date_key" ON "Holiday"("date");

-- CreateIndex
CREATE UNIQUE INDEX "FiscalFiling_companyId_obligationCode_period_key" ON "FiscalFiling"("companyId", "obligationCode", "period");

-- CreateIndex
CREATE INDEX "BContingency_companyId_endsAt_idx" ON "BContingency"("companyId", "endsAt");

-- AddForeignKey
ALTER TABLE "FiscalObligation" ADD CONSTRAINT "FiscalObligation_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "FiscalObligation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalObligation" ADD CONSTRAINT "FiscalObligation_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "FiscalParameterLoad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Holiday" ADD CONSTRAINT "Holiday_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "FiscalParameterLoad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalFiling" ADD CONSTRAINT "FiscalFiling_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BContingency" ADD CONSTRAINT "BContingency_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- R9: obligaciones y feriados son de SOLO INSERCIÓN, como los parámetros fiscales (misma función del trigger)
CREATE TRIGGER "FiscalObligation_insert_only" BEFORE UPDATE OR DELETE ON "FiscalObligation"
  FOR EACH ROW EXECUTE FUNCTION fiscal_parameters_insert_only();
CREATE TRIGGER "Holiday_insert_only" BEFORE UPDATE OR DELETE ON "Holiday"
  FOR EACH ROW EXECUTE FUNCTION fiscal_parameters_insert_only();

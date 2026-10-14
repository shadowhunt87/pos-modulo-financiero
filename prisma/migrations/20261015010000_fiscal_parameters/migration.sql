-- CreateEnum
CREATE TYPE "FiscalParameterKind" AS ENUM ('RATE', 'AMOUNT', 'DATE', 'DAYS', 'FLAG', 'TABLE', 'NONE');

-- CreateEnum
CREATE TYPE "WithholdingBase" AS ENUM ('ITBIS', 'SUBTOTAL', 'TOTAL');

-- CreateEnum
CREATE TYPE "DgiiClassification" AS ENUM ('GRANDE_NACIONAL', 'GRANDE_LOCAL', 'MEDIANO', 'PEQUENO', 'MICRO', 'NO_CLASIFICADO');

-- CreateEnum
CREATE TYPE "TaxRegime" AS ENUM ('ORDINARIO', 'RST');

-- CreateEnum
CREATE TYPE "LegalForm" AS ENUM ('SRL', 'SA', 'SAS', 'EIRL', 'SNC', 'SCS', 'SCA', 'PERSONA_FISICA', 'OTRA');

-- CreateEnum
CREATE TYPE "AccountingFramework" AS ENUM ('NIIF_PYMES', 'NIIF_COMPLETAS');

-- AlterTable
ALTER TABLE "InvoiceLine" ADD COLUMN     "appliedRate" DECIMAL(9,4),
ADD COLUMN     "fiscalParameterId" TEXT;

-- AlterTable
ALTER TABLE "InvoiceWithholding" ADD COLUMN     "appliedRate" DECIMAL(9,4),
ADD COLUMN     "fiscalParameterId" TEXT;

-- AlterTable
ALTER TABLE "TaxRate" ADD COLUMN     "parameterKey" TEXT;

-- CreateTable
CREATE TABLE "FiscalParameter" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(60) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "kind" "FiscalParameterKind" NOT NULL,
    "value" DECIMAL(19,6),
    "valueDate" DATE,
    "valueJson" JSONB,
    "unit" TEXT,
    "base" "WithholdingBase",
    "validFrom" DATE NOT NULL,
    "supersedesId" TEXT,
    "source" VARCHAR(300) NOT NULL,
    "sourceUrl" TEXT,
    "notes" TEXT,
    "loadId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FiscalParameter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiscalParameterValidation" (
    "id" TEXT NOT NULL,
    "parameterId" TEXT NOT NULL,
    "validatedBy" TEXT NOT NULL,
    "validatedAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "loadId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FiscalParameterValidation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiscalParameterLoad" (
    "id" TEXT NOT NULL,
    "loadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "loadedBy" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "gitCommit" TEXT NOT NULL,
    "summary" JSONB NOT NULL,

    CONSTRAINT "FiscalParameterLoad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyFiscalProfile" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "dgiiClassification" "DgiiClassification",
    "taxRegime" "TaxRegime",
    "legalForm" "LegalForm",
    "accountingFramework" "AccountingFramework",
    "frameworkAdoptionDate" DATE,
    "ecfEmitterSince" DATE,
    "isWithholdingAgent" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyFiscalProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FiscalParameter_supersedesId_key" ON "FiscalParameter"("supersedesId");

-- CreateIndex
CREATE INDEX "FiscalParameter_key_validFrom_idx" ON "FiscalParameter"("key", "validFrom");

-- CreateIndex
CREATE UNIQUE INDEX "FiscalParameter_key_validFrom_revision_key" ON "FiscalParameter"("key", "validFrom", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "FiscalParameterValidation_parameterId_validatedBy_key" ON "FiscalParameterValidation"("parameterId", "validatedBy");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyFiscalProfile_companyId_key" ON "CompanyFiscalProfile"("companyId");

-- AddForeignKey
ALTER TABLE "FiscalParameter" ADD CONSTRAINT "FiscalParameter_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "FiscalParameter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalParameter" ADD CONSTRAINT "FiscalParameter_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "FiscalParameterLoad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalParameterValidation" ADD CONSTRAINT "FiscalParameterValidation_parameterId_fkey" FOREIGN KEY ("parameterId") REFERENCES "FiscalParameter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalParameterValidation" ADD CONSTRAINT "FiscalParameterValidation_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "FiscalParameterLoad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyFiscalProfile" ADD CONSTRAINT "CompanyFiscalProfile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- R9: los parámetros fiscales son de SOLO INSERCIÓN también en la base (defensa adicional al código).
-- Solo una sesión de mantenimiento explícita (SET LOCAL app.fiscal_maintenance = 'on'; la usan las pruebas para limpiar) puede borrar.
CREATE FUNCTION fiscal_parameters_insert_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('app.fiscal_maintenance', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Los parámetros fiscales no se modifican ni se borran: carga una revisión nueva' USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "FiscalParameter_insert_only" BEFORE UPDATE OR DELETE ON "FiscalParameter"
  FOR EACH ROW EXECUTE FUNCTION fiscal_parameters_insert_only();
CREATE TRIGGER "FiscalParameterValidation_insert_only" BEFORE UPDATE OR DELETE ON "FiscalParameterValidation"
  FOR EACH ROW EXECUTE FUNCTION fiscal_parameters_insert_only();
CREATE TRIGGER "FiscalParameterLoad_insert_only" BEFORE UPDATE OR DELETE ON "FiscalParameterLoad"
  FOR EACH ROW EXECUTE FUNCTION fiscal_parameters_insert_only();

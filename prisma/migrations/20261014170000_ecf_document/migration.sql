-- CreateEnum
CREATE TYPE "EcfStatus" AS ENUM ('IMPORTED', 'PENDING_SEND', 'SENDING', 'ACCEPTED', 'ACCEPTED_CONDITIONAL', 'REJECTED', 'CONTINGENCY', 'VOID_UNUSED');

-- CreateEnum
CREATE TYPE "EcfOrigin" AS ENUM ('EMITTED', 'IMPORTED');

-- CreateEnum
CREATE TYPE "EcfVerification" AS ENUM ('UNVERIFIED', 'VERIFIED');

-- CreateEnum
CREATE TYPE "EcfImportStatus" AS ENUM ('PREPARED', 'IMPORTED', 'DISCARDED');

-- CreateTable
CREATE TABLE "EcfDocument" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "ecfType" TEXT NOT NULL,
    "eNcf" TEXT NOT NULL,
    "status" "EcfStatus" NOT NULL,
    "origin" "EcfOrigin" NOT NULL,
    "verification" "EcfVerification" NOT NULL DEFAULT 'UNVERIFIED',
    "issuerRnc" TEXT NOT NULL,
    "securityCode" TEXT,
    "xmlFileUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EcfDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EcfImport" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "preview" JSONB NOT NULL,
    "status" "EcfImportStatus" NOT NULL DEFAULT 'PREPARED',
    "invoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EcfImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EcfDocument_invoiceId_key" ON "EcfDocument"("invoiceId");

-- CreateIndex
CREATE INDEX "EcfDocument_companyId_status_idx" ON "EcfDocument"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EcfDocument_companyId_issuerRnc_eNcf_key" ON "EcfDocument"("companyId", "issuerRnc", "eNcf");

-- CreateIndex
CREATE INDEX "EcfImport_companyId_createdAt_idx" ON "EcfImport"("companyId", "createdAt");

-- AddForeignKey
ALTER TABLE "EcfDocument" ADD CONSTRAINT "EcfDocument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcfDocument" ADD CONSTRAINT "EcfDocument_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcfImport" ADD CONSTRAINT "EcfImport_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


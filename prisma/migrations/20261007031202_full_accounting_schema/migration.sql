/*
  Warnings:

  - You are about to drop the column `matchedJournalEntryId` on the `BankTransaction` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[bankAccountId,externalId]` on the table `BankTransaction` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[reversalOfId]` on the table `JournalEntry` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[companyId,number]` on the table `JournalEntry` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `companyId` to the `Attachment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `createdById` to the `Payment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `direction` to the `Payment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `partnerId` to the `Payment` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "AccountCategory" AS ENUM ('CASH_AND_EQUIVALENTS', 'ACCOUNTS_RECEIVABLE', 'INVENTORY', 'PREPAID_AND_OTHER_CURRENT_ASSETS', 'PROPERTY_PLANT_EQUIPMENT', 'INTANGIBLE_ASSETS', 'OTHER_NON_CURRENT_ASSETS', 'ACCOUNTS_PAYABLE', 'SHORT_TERM_DEBT', 'TAXES_PAYABLE', 'OTHER_CURRENT_LIABILITIES', 'LONG_TERM_DEBT', 'OTHER_NON_CURRENT_LIABILITIES', 'SHARE_CAPITAL', 'RETAINED_EARNINGS', 'CURRENT_YEAR_RESULT', 'OTHER_EQUITY', 'OPERATING_REVENUE', 'OTHER_REVENUE', 'COST_OF_SALES', 'OPERATING_EXPENSE', 'DEPRECIATION_AMORTIZATION', 'FINANCE_COST', 'OTHER_EXPENSE', 'INCOME_TAX');

-- CreateEnum
CREATE TYPE "CashFlowCategory" AS ENUM ('OPERATING', 'INVESTING', 'FINANCING', 'CASH_EQUIVALENT');

-- CreateEnum
CREATE TYPE "SubledgerType" AS ENUM ('RECEIVABLE', 'PAYABLE', 'BANK', 'CASH');

-- CreateEnum
CREATE TYPE "JournalType" AS ENUM ('GENERAL', 'SALES', 'PURCHASES', 'BANK', 'CASH', 'ADJUSTMENT', 'OPENING', 'CLOSING');

-- CreateEnum
CREATE TYPE "JournalEntryType" AS ENUM ('STANDARD', 'OPENING', 'CLOSING', 'ADJUSTMENT', 'REVERSAL', 'FX_REVALUATION');

-- CreateEnum
CREATE TYPE "SourceDocumentType" AS ENUM ('MANUAL', 'INVOICE', 'PAYMENT', 'BANK_TRANSACTION', 'CASH_EXPENSE', 'YEAR_END_CLOSING', 'OTHER');

-- CreateEnum
CREATE TYPE "TaxIdType" AS ENUM ('RNC', 'CEDULA', 'PASSPORT', 'FOREIGN_ID');

-- CreateEnum
CREATE TYPE "TaxType" AS ENUM ('ITBIS', 'ISC', 'PROPINA_LEGAL', 'ISR_WITHHOLDING', 'ITBIS_WITHHOLDING', 'OTHER');

-- CreateEnum
CREATE TYPE "TaxApplies" AS ENUM ('SALES', 'PURCHASES', 'BOTH');

-- CreateEnum
CREATE TYPE "PaymentDirection" AS ENUM ('RECEIVED', 'MADE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('DRAFT', 'POSTED', 'VOIDED');

-- CreateEnum
CREATE TYPE "BankConnectionProvider" AS ENUM ('MANUAL_IMPORT', 'PLAID', 'OPEN_BANKING', 'DIRECT_API', 'SFTP_FILE');

-- CreateEnum
CREATE TYPE "BankConnectionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'ERROR', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "BankAccountType" AS ENUM ('CHECKING', 'SAVINGS', 'CREDIT_CARD', 'LOAN');

-- CreateEnum
CREATE TYPE "BankTransactionSource" AS ENUM ('MANUAL', 'FILE_IMPORT', 'API_SYNC');

-- CreateEnum
CREATE TYPE "BankTransactionStatus" AS ENUM ('PENDING', 'MATCHED', 'RECONCILED', 'IGNORED');

-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('DRAFT', 'COMPLETED');

-- CreateEnum
CREATE TYPE "BudgetStatus" AS ENUM ('DRAFT', 'APPROVED', 'ARCHIVED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'POST';
ALTER TYPE "AuditAction" ADD VALUE 'CLOSE';
ALTER TYPE "AuditAction" ADD VALUE 'RECONCILE';
ALTER TYPE "AuditAction" ADD VALUE 'LOGIN';

-- DropIndex
DROP INDEX "Invoice_partnerId_idx";

-- DropIndex
DROP INDEX "Payment_companyId_idx";

-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "cashFlowCategory" "CashFlowCategory",
ADD COLUMN     "category" "AccountCategory",
ADD COLUMN     "currency" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "isContra" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isPostable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "subledger" "SubledgerType";

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "companyId" TEXT NOT NULL,
ADD COLUMN     "journalEntryId" TEXT,
ADD COLUMN     "paymentId" TEXT,
ADD COLUMN     "reconciliationId" TEXT,
ADD COLUMN     "sizeBytes" INTEGER,
ADD COLUMN     "uploadedById" TEXT;

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "ipAddress" TEXT,
ADD COLUMN     "userAgent" TEXT;

-- AlterTable
ALTER TABLE "BankAccount" ADD COLUMN     "connectionId" TEXT,
ADD COLUMN     "externalAccountId" TEXT,
ADD COLUMN     "glAccountId" TEXT,
ADD COLUMN     "iban" TEXT,
ADD COLUMN     "lastSyncedAt" TIMESTAMP(3),
ADD COLUMN     "openingBalance" DECIMAL(19,4) NOT NULL DEFAULT 0,
ADD COLUMN     "openingBalanceDate" TIMESTAMP(3),
ADD COLUMN     "swift" TEXT,
ADD COLUMN     "type" "BankAccountType" NOT NULL DEFAULT 'CHECKING';

-- AlterTable
ALTER TABLE "BankTransaction" DROP COLUMN "matchedJournalEntryId",
ADD COLUMN     "balanceAfter" DECIMAL(19,4),
ADD COLUMN     "currency" TEXT,
ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "reconciliationId" TEXT,
ADD COLUMN     "reference" TEXT,
ADD COLUMN     "source" "BankTransactionSource" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "status" "BankTransactionStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "valueDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Budget" ADD COLUMN     "notes" TEXT,
ADD COLUMN     "status" "BudgetStatus" NOT NULL DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "CashRegister" ADD COLUMN     "custodianId" TEXT,
ADD COLUMN     "glAccountId" TEXT,
ADD COLUMN     "openingBalance" DECIMAL(19,4) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "country" TEXT NOT NULL DEFAULT 'DO',
ADD COLUMN     "fiscalYearStartMonth" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "legalName" TEXT,
ADD COLUMN     "logoUrl" TEXT;

-- AlterTable
ALTER TABLE "CostCenter" ADD COLUMN     "code" TEXT;

-- AlterTable
ALTER TABLE "ExchangeRate" ADD COLUMN     "source" TEXT;

-- AlterTable
ALTER TABLE "FiscalPeriod" ADD COLUMN     "fiscalYearId" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "amountPaid" DECIMAL(19,4) NOT NULL DEFAULT 0,
ADD COLUMN     "balance" DECIMAL(19,4) NOT NULL DEFAULT 0,
ADD COLUMN     "dgiiExpenseType" TEXT,
ADD COLUMN     "dgiiIncomeType" TEXT,
ADD COLUMN     "discountTotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
ADD COLUMN     "issuedAt" TIMESTAMP(3),
ADD COLUMN     "journalEntryId" TEXT,
ADD COLUMN     "ncfExpiration" TIMESTAMP(3),
ADD COLUMN     "ncfType" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "relatedInvoiceId" TEXT,
ADD COLUMN     "voidReason" TEXT,
ADD COLUMN     "voidReasonCode" TEXT,
ADD COLUMN     "voidedAt" TIMESTAMP(3),
ADD COLUMN     "withholdingTotal" DECIMAL(19,4) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "InvoiceLine" ADD COLUMN     "accountId" TEXT,
ADD COLUMN     "costCenterId" TEXT,
ADD COLUMN     "discount" DECIMAL(19,4) NOT NULL DEFAULT 0,
ADD COLUMN     "taxAmount" DECIMAL(19,4) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "JournalEntry" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'DOP',
ADD COLUMN     "exchangeRate" DECIMAL(19,6) NOT NULL DEFAULT 1,
ADD COLUMN     "fiscalPeriodId" TEXT,
ADD COLUMN     "journalId" TEXT,
ADD COLUMN     "number" TEXT,
ADD COLUMN     "postedAt" TIMESTAMP(3),
ADD COLUMN     "reversalOfId" TEXT,
ADD COLUMN     "sourceId" TEXT,
ADD COLUMN     "sourceType" "SourceDocumentType" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "type" "JournalEntryType" NOT NULL DEFAULT 'STANDARD',
ADD COLUMN     "voidReason" TEXT,
ADD COLUMN     "voidedAt" TIMESTAMP(3),
ADD COLUMN     "voidedById" TEXT;

-- AlterTable
ALTER TABLE "JournalEntryLine" ADD COLUMN     "amountForeign" DECIMAL(19,4),
ADD COLUMN     "currency" TEXT,
ADD COLUMN     "exchangeRate" DECIMAL(19,6),
ADD COLUMN     "partnerId" TEXT;

-- AlterTable
ALTER TABLE "NcfSequence" ADD COLUMN     "warningThreshold" INTEGER NOT NULL DEFAULT 50;

-- AlterTable
ALTER TABLE "Partner" ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT NOT NULL DEFAULT 'DO',
ADD COLUMN     "creditLimit" DECIMAL(19,4),
ADD COLUMN     "defaultNcfType" TEXT,
ADD COLUMN     "isWithholdingAgent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "paymentTermsDays" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "taxIdType" "TaxIdType",
ADD COLUMN     "tradeName" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "createdById" TEXT NOT NULL,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'DOP',
ADD COLUMN     "direction" "PaymentDirection" NOT NULL,
ADD COLUMN     "exchangeRate" DECIMAL(19,6) NOT NULL DEFAULT 1,
ADD COLUMN     "journalEntryId" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "number" TEXT,
ADD COLUMN     "partnerId" TEXT NOT NULL,
ADD COLUMN     "reference" TEXT,
ADD COLUMN     "status" "PaymentStatus" NOT NULL DEFAULT 'POSTED';

-- AlterTable
ALTER TABLE "TaxRate" ADD COLUMN     "appliesTo" "TaxApplies" NOT NULL DEFAULT 'BOTH',
ADD COLUMN     "dgiiCode" TEXT,
ADD COLUMN     "isWithholding" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "purchaseAccountId" TEXT,
ADD COLUMN     "salesAccountId" TEXT,
ADD COLUMN     "type" "TaxType" NOT NULL DEFAULT 'ITBIS';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastLoginAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AccountingSettings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "receivableAccountId" TEXT,
    "payableAccountId" TEXT,
    "salesIncomeAccountId" TEXT,
    "purchaseExpenseAccountId" TEXT,
    "salesDiscountAccountId" TEXT,
    "customerAdvanceAccountId" TEXT,
    "supplierAdvanceAccountId" TEXT,
    "retainedEarningsAccountId" TEXT,
    "currentYearResultAccountId" TEXT,
    "fxGainAccountId" TEXT,
    "fxLossAccountId" TEXT,
    "roundingAccountId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentSequence" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "prefix" TEXT NOT NULL DEFAULT '',
    "nextNumber" INTEGER NOT NULL DEFAULT 1,
    "padding" INTEGER NOT NULL DEFAULT 6,

    CONSTRAINT "DocumentSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiscalYear" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "FiscalPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "closingEntryId" TEXT,
    "closedById" TEXT,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "FiscalYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Journal" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "JournalType" NOT NULL DEFAULT 'GENERAL',
    "nextNumber" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Journal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceWithholding" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "taxRateId" TEXT NOT NULL,
    "base" DECIMAL(19,4) NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,

    CONSTRAINT "InvoiceWithholding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankConnection" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "provider" "BankConnectionProvider" NOT NULL,
    "institutionName" TEXT NOT NULL,
    "status" "BankConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "externalId" TEXT,
    "credentialsEnc" TEXT,
    "consentExpiresAt" TIMESTAMP(3),
    "syncCursor" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankMatch" (
    "id" TEXT NOT NULL,
    "bankTransactionId" TEXT NOT NULL,
    "journalEntryLineId" TEXT NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankReconciliation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "statementDate" TIMESTAMP(3) NOT NULL,
    "statementBalance" DECIMAL(19,4) NOT NULL,
    "bookBalance" DECIMAL(19,4) NOT NULL,
    "difference" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "status" "ReconciliationStatus" NOT NULL DEFAULT 'DRAFT',
    "completedById" TEXT,
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankReconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankRule" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "bankAccountId" TEXT,
    "name" TEXT NOT NULL,
    "matchText" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "BankRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialRatioSnapshot" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "asOfDate" TIMESTAMP(3) NOT NULL,
    "periodType" TEXT NOT NULL DEFAULT 'MONTH',
    "ratios" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialRatioSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountingSettings_companyId_key" ON "AccountingSettings"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentSequence_companyId_docType_key" ON "DocumentSequence"("companyId", "docType");

-- CreateIndex
CREATE UNIQUE INDEX "FiscalYear_closingEntryId_key" ON "FiscalYear"("closingEntryId");

-- CreateIndex
CREATE INDEX "FiscalYear_companyId_idx" ON "FiscalYear"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "FiscalYear_companyId_startDate_endDate_key" ON "FiscalYear"("companyId", "startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "Journal_companyId_code_key" ON "Journal"("companyId", "code");

-- CreateIndex
CREATE INDEX "InvoiceWithholding_invoiceId_idx" ON "InvoiceWithholding"("invoiceId");

-- CreateIndex
CREATE INDEX "BankConnection_companyId_idx" ON "BankConnection"("companyId");

-- CreateIndex
CREATE INDEX "BankMatch_journalEntryLineId_idx" ON "BankMatch"("journalEntryLineId");

-- CreateIndex
CREATE UNIQUE INDEX "BankMatch_bankTransactionId_journalEntryLineId_key" ON "BankMatch"("bankTransactionId", "journalEntryLineId");

-- CreateIndex
CREATE INDEX "BankReconciliation_companyId_idx" ON "BankReconciliation"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "BankReconciliation_bankAccountId_statementDate_key" ON "BankReconciliation"("bankAccountId", "statementDate");

-- CreateIndex
CREATE INDEX "BankRule_companyId_idx" ON "BankRule"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialRatioSnapshot_companyId_asOfDate_periodType_key" ON "FinancialRatioSnapshot"("companyId", "asOfDate", "periodType");

-- CreateIndex
CREATE INDEX "Account_companyId_type_idx" ON "Account"("companyId", "type");

-- CreateIndex
CREATE INDEX "Attachment_companyId_idx" ON "Attachment"("companyId");

-- CreateIndex
CREATE INDEX "Attachment_paymentId_idx" ON "Attachment"("paymentId");

-- CreateIndex
CREATE INDEX "Attachment_journalEntryId_idx" ON "Attachment"("journalEntryId");

-- CreateIndex
CREATE INDEX "AuditLog_companyId_createdAt_idx" ON "AuditLog"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "BankAccount_glAccountId_idx" ON "BankAccount"("glAccountId");

-- CreateIndex
CREATE INDEX "BankTransaction_bankAccountId_date_idx" ON "BankTransaction"("bankAccountId", "date");

-- CreateIndex
CREATE INDEX "BankTransaction_importBatchId_idx" ON "BankTransaction"("importBatchId");

-- CreateIndex
CREATE UNIQUE INDEX "BankTransaction_bankAccountId_externalId_key" ON "BankTransaction"("bankAccountId", "externalId");

-- CreateIndex
CREATE INDEX "FiscalPeriod_fiscalYearId_idx" ON "FiscalPeriod"("fiscalYearId");

-- CreateIndex
CREATE INDEX "Invoice_companyId_type_issueDate_idx" ON "Invoice"("companyId", "type", "issueDate");

-- CreateIndex
CREATE INDEX "Invoice_companyId_ncf_idx" ON "Invoice"("companyId", "ncf");

-- CreateIndex
CREATE INDEX "Invoice_partnerId_status_idx" ON "Invoice"("partnerId", "status");

-- CreateIndex
CREATE INDEX "Invoice_dueDate_idx" ON "Invoice"("dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_reversalOfId_key" ON "JournalEntry"("reversalOfId");

-- CreateIndex
CREATE INDEX "JournalEntry_companyId_status_date_idx" ON "JournalEntry"("companyId", "status", "date");

-- CreateIndex
CREATE INDEX "JournalEntry_companyId_sourceType_sourceId_idx" ON "JournalEntry"("companyId", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "JournalEntry_fiscalPeriodId_idx" ON "JournalEntry"("fiscalPeriodId");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_companyId_number_key" ON "JournalEntry"("companyId", "number");

-- CreateIndex
CREATE INDEX "JournalEntryLine_journalEntryId_idx" ON "JournalEntryLine"("journalEntryId");

-- CreateIndex
CREATE INDEX "JournalEntryLine_accountId_partnerId_idx" ON "JournalEntryLine"("accountId", "partnerId");

-- CreateIndex
CREATE INDEX "JournalEntryLine_partnerId_idx" ON "JournalEntryLine"("partnerId");

-- CreateIndex
CREATE INDEX "JournalEntryLine_costCenterId_idx" ON "JournalEntryLine"("costCenterId");

-- CreateIndex
CREATE INDEX "Partner_companyId_taxId_idx" ON "Partner"("companyId", "taxId");

-- CreateIndex
CREATE INDEX "Payment_companyId_date_idx" ON "Payment"("companyId", "date");

-- CreateIndex
CREATE INDEX "Payment_partnerId_idx" ON "Payment"("partnerId");

-- CreateIndex
CREATE INDEX "Payment_bankAccountId_idx" ON "Payment"("bankAccountId");

-- AddForeignKey
ALTER TABLE "AccountingSettings" ADD CONSTRAINT "AccountingSettings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingSettings" ADD CONSTRAINT "AccountingSettings_receivableAccountId_fkey" FOREIGN KEY ("receivableAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingSettings" ADD CONSTRAINT "AccountingSettings_payableAccountId_fkey" FOREIGN KEY ("payableAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingSettings" ADD CONSTRAINT "AccountingSettings_salesIncomeAccountId_fkey" FOREIGN KEY ("salesIncomeAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingSettings" ADD CONSTRAINT "AccountingSettings_purchaseExpenseAccountId_fkey" FOREIGN KEY ("purchaseExpenseAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingSettings" ADD CONSTRAINT "AccountingSettings_salesDiscountAccountId_fkey" FOREIGN KEY ("salesDiscountAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingSettings" ADD CONSTRAINT "AccountingSettings_customerAdvanceAccountId_fkey" FOREIGN KEY ("customerAdvanceAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingSettings" ADD CONSTRAINT "AccountingSettings_supplierAdvanceAccountId_fkey" FOREIGN KEY ("supplierAdvanceAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingSettings" ADD CONSTRAINT "AccountingSettings_retainedEarningsAccountId_fkey" FOREIGN KEY ("retainedEarningsAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingSettings" ADD CONSTRAINT "AccountingSettings_currentYearResultAccountId_fkey" FOREIGN KEY ("currentYearResultAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingSettings" ADD CONSTRAINT "AccountingSettings_fxGainAccountId_fkey" FOREIGN KEY ("fxGainAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingSettings" ADD CONSTRAINT "AccountingSettings_fxLossAccountId_fkey" FOREIGN KEY ("fxLossAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingSettings" ADD CONSTRAINT "AccountingSettings_roundingAccountId_fkey" FOREIGN KEY ("roundingAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSequence" ADD CONSTRAINT "DocumentSequence_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalYear" ADD CONSTRAINT "FiscalYear_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalYear" ADD CONSTRAINT "FiscalYear_closingEntryId_fkey" FOREIGN KEY ("closingEntryId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalPeriod" ADD CONSTRAINT "FiscalPeriod_fiscalYearId_fkey" FOREIGN KEY ("fiscalYearId") REFERENCES "FiscalYear"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Journal" ADD CONSTRAINT "Journal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_fiscalPeriodId_fkey" FOREIGN KEY ("fiscalPeriodId") REFERENCES "FiscalPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntryLine" ADD CONSTRAINT "JournalEntryLine_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRate" ADD CONSTRAINT "TaxRate_salesAccountId_fkey" FOREIGN KEY ("salesAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRate" ADD CONSTRAINT "TaxRate_purchaseAccountId_fkey" FOREIGN KEY ("purchaseAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_relatedInvoiceId_fkey" FOREIGN KEY ("relatedInvoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceWithholding" ADD CONSTRAINT "InvoiceWithholding_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceWithholding" ADD CONSTRAINT "InvoiceWithholding_taxRateId_fkey" FOREIGN KEY ("taxRateId") REFERENCES "TaxRate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankConnection" ADD CONSTRAINT "BankConnection_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_glAccountId_fkey" FOREIGN KEY ("glAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "BankConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "BankReconciliation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankMatch" ADD CONSTRAINT "BankMatch_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId") REFERENCES "BankTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankMatch" ADD CONSTRAINT "BankMatch_journalEntryLineId_fkey" FOREIGN KEY ("journalEntryLineId") REFERENCES "JournalEntryLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankReconciliation" ADD CONSTRAINT "BankReconciliation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankReconciliation" ADD CONSTRAINT "BankReconciliation_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankReconciliation" ADD CONSTRAINT "BankReconciliation_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankRule" ADD CONSTRAINT "BankRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankRule" ADD CONSTRAINT "BankRule_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankRule" ADD CONSTRAINT "BankRule_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashRegister" ADD CONSTRAINT "CashRegister_glAccountId_fkey" FOREIGN KEY ("glAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashRegister" ADD CONSTRAINT "CashRegister_custodianId_fkey" FOREIGN KEY ("custodianId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialRatioSnapshot" ADD CONSTRAINT "FinancialRatioSnapshot_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "BankReconciliation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

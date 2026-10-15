-- CreateEnum
CREATE TYPE "EmployeeDocumentType" AS ENUM ('CEDULA', 'PASSPORT');

-- CreateEnum
CREATE TYPE "EmployeeSex" AS ENUM ('M', 'F');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "PayFrequency" AS ENUM ('MONTHLY', 'BIWEEKLY', 'WEEKLY');

-- CreateEnum
CREATE TYPE "EmployeePaymentMethod" AS ENUM ('TRANSFER', 'CHECK', 'CASH');

-- CreateEnum
CREATE TYPE "PayrollConceptKind" AS ENUM ('EARNING', 'DEDUCTION');

-- CreateEnum
CREATE TYPE "PayrollRunType" AS ENUM ('REGULAR', 'CHRISTMAS_BONUS');

-- CreateEnum
CREATE TYPE "PayrollRunStatus" AS ENUM ('DRAFT', 'POSTED', 'PAID', 'VOIDED');

-- AlterEnum
ALTER TYPE "SourceDocumentType" ADD VALUE 'PAYROLL';

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "firstName" VARCHAR(100) NOT NULL,
    "lastName" VARCHAR(100) NOT NULL,
    "documentType" "EmployeeDocumentType" NOT NULL DEFAULT 'CEDULA',
    "documentNumber" VARCHAR(20) NOT NULL,
    "nss" VARCHAR(20),
    "sex" "EmployeeSex",
    "birthDate" DATE,
    "email" VARCHAR(200),
    "phone" VARCHAR(30),
    "address" VARCHAR(300),
    "departmentId" TEXT,
    "position" VARCHAR(100),
    "hireDate" DATE NOT NULL,
    "terminationDate" DATE,
    "terminationReason" VARCHAR(500),
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "payFrequency" "PayFrequency" NOT NULL DEFAULT 'MONTHLY',
    "baseSalary" DECIMAL(19,4) NOT NULL,
    "paymentMethod" "EmployeePaymentMethod" NOT NULL DEFAULT 'TRANSFER',
    "bankName" VARCHAR(100),
    "bankAccountNumber" VARCHAR(40),
    "costCenterId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollConcept" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "kind" "PayrollConceptKind" NOT NULL,
    "affectsTss" BOOLEAN NOT NULL DEFAULT false,
    "affectsIsr" BOOLEAN NOT NULL DEFAULT false,
    "accountId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollConcept_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollSettings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "salaryExpenseAccountId" TEXT,
    "employerContributionsExpenseAccountId" TEXT,
    "salariesPayableAccountId" TEXT,
    "tssPayableAccountId" TEXT,
    "isrPayableAccountId" TEXT,
    "otherDeductionsPayableAccountId" TEXT,
    "srlRate" DECIMAL(9,4),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollRun" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "type" "PayrollRunType" NOT NULL DEFAULT 'REGULAR',
    "frequency" "PayFrequency" NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "payDate" DATE NOT NULL,
    "status" "PayrollRunStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" VARCHAR(500),
    "grossTotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "employeeTssTotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "isrTotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "otherDeductionsTotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "netTotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "employerTotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "parameters" JSONB,
    "journalEntryId" TEXT,
    "paymentEntryId" TEXT,
    "bankAccountId" TEXT,
    "createdById" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "voidReason" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollLine" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "baseSalary" DECIMAL(19,4) NOT NULL,
    "periodDays" INTEGER NOT NULL,
    "daysWorked" INTEGER NOT NULL,
    "salary" DECIMAL(19,4) NOT NULL,
    "otherEarnings" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "grossTotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "tssBase" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "afpEmployee" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "sfsEmployee" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "isrBase" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "isr" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "otherDeductions" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "netPay" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "afpEmployer" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "sfsEmployer" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "srlEmployer" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "infotepEmployer" DECIMAL(19,4) NOT NULL DEFAULT 0,

    CONSTRAINT "PayrollLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollItem" (
    "id" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "conceptId" TEXT NOT NULL,
    "description" VARCHAR(200),
    "amount" DECIMAL(19,4) NOT NULL,

    CONSTRAINT "PayrollItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Department_companyId_name_key" ON "Department"("companyId", "name");

-- CreateIndex
CREATE INDEX "Employee_companyId_status_idx" ON "Employee"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_companyId_code_key" ON "Employee"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_companyId_documentNumber_key" ON "Employee"("companyId", "documentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollConcept_companyId_code_key" ON "PayrollConcept"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollSettings_companyId_key" ON "PayrollSettings"("companyId");

-- CreateIndex
CREATE INDEX "PayrollRun_companyId_periodStart_idx" ON "PayrollRun"("companyId", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRun_companyId_number_key" ON "PayrollRun"("companyId", "number");

-- CreateIndex
CREATE INDEX "PayrollLine_employeeId_idx" ON "PayrollLine"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollLine_runId_employeeId_key" ON "PayrollLine"("runId", "employeeId");

-- CreateIndex
CREATE INDEX "PayrollItem_lineId_idx" ON "PayrollItem"("lineId");

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollConcept" ADD CONSTRAINT "PayrollConcept_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollConcept" ADD CONSTRAINT "PayrollConcept_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollSettings" ADD CONSTRAINT "PayrollSettings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollSettings" ADD CONSTRAINT "PayrollSettings_salaryExpenseAccountId_fkey" FOREIGN KEY ("salaryExpenseAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollSettings" ADD CONSTRAINT "PayrollSettings_employerContributionsExpenseAccountId_fkey" FOREIGN KEY ("employerContributionsExpenseAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollSettings" ADD CONSTRAINT "PayrollSettings_salariesPayableAccountId_fkey" FOREIGN KEY ("salariesPayableAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollSettings" ADD CONSTRAINT "PayrollSettings_tssPayableAccountId_fkey" FOREIGN KEY ("tssPayableAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollSettings" ADD CONSTRAINT "PayrollSettings_isrPayableAccountId_fkey" FOREIGN KEY ("isrPayableAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollSettings" ADD CONSTRAINT "PayrollSettings_otherDeductionsPayableAccountId_fkey" FOREIGN KEY ("otherDeductionsPayableAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_paymentEntryId_fkey" FOREIGN KEY ("paymentEntryId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollLine" ADD CONSTRAINT "PayrollLine_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PayrollRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollLine" ADD CONSTRAINT "PayrollLine_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollItem" ADD CONSTRAINT "PayrollItem_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "PayrollLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollItem" ADD CONSTRAINT "PayrollItem_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "PayrollConcept"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

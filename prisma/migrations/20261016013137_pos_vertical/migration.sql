-- CreateEnum
CREATE TYPE "PosShiftStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "PosCashMovementType" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "PosSaleStatus" AS ENUM ('COMPLETED', 'VOIDED');

-- CreateEnum
CREATE TYPE "PosPayMethod" AS ENUM ('CASH', 'CARD', 'TRANSFER');

-- CreateEnum
CREATE TYPE "PosPromotionType" AS ENUM ('PERCENT', 'BUY_X_PAY_Y', 'FIXED_PRICE');

-- CreateTable
CREATE TABLE "PosSettings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "defaultPartnerId" TEXT NOT NULL,
    "defaultNcfType" VARCHAR(3) NOT NULL DEFAULT 'B02',
    "fiscalCreditNcfType" VARCHAR(3) NOT NULL DEFAULT 'B01',
    "maxDiscountPct" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "cashOverShortAccountId" TEXT,
    "receiptFooter" VARCHAR(300),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosTerminal" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "cashRegisterId" TEXT NOT NULL,
    "cardBankAccountId" TEXT,
    "transferBankAccountId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PosTerminal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosShift" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "terminalId" TEXT NOT NULL,
    "number" VARCHAR(30) NOT NULL,
    "status" "PosShiftStatus" NOT NULL DEFAULT 'OPEN',
    "openedById" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openingCash" DECIMAL(19,4) NOT NULL,
    "closedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "expectedCash" DECIMAL(19,4),
    "countedCash" DECIMAL(19,4),
    "difference" DECIMAL(19,4),
    "countDetail" JSONB,
    "closeNotes" VARCHAR(500),
    "journalEntryId" TEXT,

    CONSTRAINT "PosShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosCashMovement" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "type" "PosCashMovementType" NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "reason" VARCHAR(300) NOT NULL,
    "accountId" TEXT NOT NULL,
    "journalEntryId" TEXT,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PosCashMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosDrawerEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "reason" VARCHAR(300) NOT NULL,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PosDrawerEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosSale" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "terminalId" TEXT NOT NULL,
    "number" VARCHAR(30) NOT NULL,
    "clientUuid" VARCHAR(64) NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "invoiceNumber" VARCHAR(30) NOT NULL,
    "ncf" VARCHAR(19),
    "partnerId" TEXT NOT NULL,
    "ncfType" VARCHAR(3) NOT NULL,
    "subtotal" DECIMAL(19,4) NOT NULL,
    "discountTotal" DECIMAL(19,4) NOT NULL,
    "promoTotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(19,4) NOT NULL,
    "total" DECIMAL(19,4) NOT NULL,
    "paidTotal" DECIMAL(19,4) NOT NULL,
    "changeGiven" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "status" "PosSaleStatus" NOT NULL DEFAULT 'COMPLETED',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidReason" VARCHAR(500),

    CONSTRAINT "PosSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosSaleLine" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "description" VARCHAR(300) NOT NULL,
    "quantity" DECIMAL(19,4) NOT NULL,
    "unitPrice" DECIMAL(19,4) NOT NULL,
    "discount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "promoDiscount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "promotionId" TEXT,
    "taxRateId" TEXT,
    "returnedQty" DECIMAL(19,4) NOT NULL DEFAULT 0,

    CONSTRAINT "PosSaleLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosSalePayment" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "method" "PosPayMethod" NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "tendered" DECIMAL(19,4),
    "reference" VARCHAR(100),
    "paymentId" TEXT,

    CONSTRAINT "PosSalePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosReturn" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "number" VARCHAR(30) NOT NULL,
    "creditNoteId" TEXT NOT NULL,
    "refundPaymentId" TEXT,
    "method" "PosPayMethod" NOT NULL,
    "total" DECIMAL(19,4) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "lines" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PosReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosParkedSale" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "terminalId" TEXT NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "payload" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PosParkedSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosApproval" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "action" VARCHAR(30) NOT NULL,
    "approvedById" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PosApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosUserPin" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pinHash" TEXT NOT NULL,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosUserPin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosCategory" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "color" VARCHAR(9),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PosCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosProductSetting" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "categoryId" TEXT,
    "showInPos" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PosProductSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosBarcode" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "code" VARCHAR(40) NOT NULL,

    CONSTRAINT "PosBarcode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosPromotion" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "type" "PosPromotionType" NOT NULL,
    "value" DECIMAL(19,4),
    "buyQty" INTEGER,
    "payQty" INTEGER,
    "productIds" TEXT[],
    "categoryIds" TEXT[],
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "weekdays" INTEGER[],
    "timeFrom" VARCHAR(5),
    "timeTo" VARCHAR(5),
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PosPromotion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PosSettings_companyId_key" ON "PosSettings"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "PosTerminal_companyId_code_key" ON "PosTerminal"("companyId", "code");

-- CreateIndex
CREATE INDEX "PosShift_companyId_terminalId_status_idx" ON "PosShift"("companyId", "terminalId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PosShift_companyId_number_key" ON "PosShift"("companyId", "number");

-- CreateIndex
CREATE INDEX "PosCashMovement_shiftId_idx" ON "PosCashMovement"("shiftId");

-- CreateIndex
CREATE INDEX "PosDrawerEvent_shiftId_idx" ON "PosDrawerEvent"("shiftId");

-- CreateIndex
CREATE INDEX "PosSale_companyId_shiftId_idx" ON "PosSale"("companyId", "shiftId");

-- CreateIndex
CREATE INDEX "PosSale_companyId_createdAt_idx" ON "PosSale"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "PosSale_companyId_ncf_idx" ON "PosSale"("companyId", "ncf");

-- CreateIndex
CREATE UNIQUE INDEX "PosSale_companyId_clientUuid_key" ON "PosSale"("companyId", "clientUuid");

-- CreateIndex
CREATE UNIQUE INDEX "PosSale_companyId_number_key" ON "PosSale"("companyId", "number");

-- CreateIndex
CREATE INDEX "PosSaleLine_saleId_idx" ON "PosSaleLine"("saleId");

-- CreateIndex
CREATE INDEX "PosSalePayment_saleId_idx" ON "PosSalePayment"("saleId");

-- CreateIndex
CREATE INDEX "PosReturn_saleId_idx" ON "PosReturn"("saleId");

-- CreateIndex
CREATE INDEX "PosReturn_shiftId_idx" ON "PosReturn"("shiftId");

-- CreateIndex
CREATE UNIQUE INDEX "PosReturn_companyId_number_key" ON "PosReturn"("companyId", "number");

-- CreateIndex
CREATE INDEX "PosParkedSale_companyId_terminalId_idx" ON "PosParkedSale"("companyId", "terminalId");

-- CreateIndex
CREATE INDEX "PosApproval_companyId_expiresAt_idx" ON "PosApproval"("companyId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PosUserPin_userId_key" ON "PosUserPin"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PosCategory_companyId_name_key" ON "PosCategory"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "PosProductSetting_productId_key" ON "PosProductSetting"("productId");

-- CreateIndex
CREATE INDEX "PosProductSetting_companyId_categoryId_idx" ON "PosProductSetting"("companyId", "categoryId");

-- CreateIndex
CREATE INDEX "PosBarcode_productId_idx" ON "PosBarcode"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "PosBarcode_companyId_code_key" ON "PosBarcode"("companyId", "code");

-- CreateIndex
CREATE INDEX "PosPromotion_companyId_active_idx" ON "PosPromotion"("companyId", "active");

-- AddForeignKey
ALTER TABLE "PosShift" ADD CONSTRAINT "PosShift_terminalId_fkey" FOREIGN KEY ("terminalId") REFERENCES "PosTerminal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosCashMovement" ADD CONSTRAINT "PosCashMovement_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "PosShift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosDrawerEvent" ADD CONSTRAINT "PosDrawerEvent_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "PosShift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosSale" ADD CONSTRAINT "PosSale_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "PosShift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosSaleLine" ADD CONSTRAINT "PosSaleLine_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "PosSale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosSalePayment" ADD CONSTRAINT "PosSalePayment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "PosSale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosReturn" ADD CONSTRAINT "PosReturn_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "PosSale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Una terminal tiene a lo sumo un turno abierto (dos cajeros no abren la misma caja a la vez)
CREATE UNIQUE INDEX "PosShift_one_open_per_terminal" ON "PosShift"("terminalId") WHERE "status" = 'OPEN';

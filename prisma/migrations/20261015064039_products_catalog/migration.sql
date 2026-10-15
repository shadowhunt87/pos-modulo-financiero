-- CreateEnum
CREATE TYPE "ProductKind" AS ENUM ('GOODS', 'SERVICE');

-- AlterTable
ALTER TABLE "InvoiceLine" ADD COLUMN     "productId" TEXT;

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" VARCHAR(1000),
    "kind" "ProductKind" NOT NULL DEFAULT 'SERVICE',
    "unit" VARCHAR(20) NOT NULL DEFAULT 'UND',
    "salePrice" DECIMAL(19,4),
    "purchasePrice" DECIMAL(19,4),
    "saleTaxRateId" TEXT,
    "purchaseTaxRateId" TEXT,
    "incomeAccountId" TEXT,
    "expenseAccountId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Product_companyId_name_idx" ON "Product"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Product_companyId_code_key" ON "Product"("companyId", "code");

-- CreateIndex
CREATE INDEX "InvoiceLine_productId_idx" ON "InvoiceLine"("productId");

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_saleTaxRateId_fkey" FOREIGN KEY ("saleTaxRateId") REFERENCES "TaxRate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_purchaseTaxRateId_fkey" FOREIGN KEY ("purchaseTaxRateId") REFERENCES "TaxRate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_incomeAccountId_fkey" FOREIGN KEY ("incomeAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_expenseAccountId_fkey" FOREIGN KEY ("expenseAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "sourceId" TEXT,
ADD COLUMN     "sourceModule" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "externalRef" TEXT;

-- CreateIndex
CREATE INDEX "Invoice_companyId_sourceModule_sourceId_idx" ON "Invoice"("companyId", "sourceModule", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_companyId_externalRef_key" ON "Payment"("companyId", "externalRef");


-- Llave natural contra facturas de venta duplicadas desde otro sistema (INTEGRACION-TALLER §4.4).
-- Parcial: solo ventas con origen y no anuladas (una anulada deja libre su origen para el siguiente intento).
-- Prisma no modela índices parciales: el esquema lo menciona en un comentario de Invoice.
CREATE UNIQUE INDEX "Invoice_source_active_sale_key" ON "Invoice"("companyId", "sourceModule", "sourceId")
  WHERE "type" = 'SALE' AND "status" <> 'VOIDED' AND "sourceModule" IS NOT NULL;

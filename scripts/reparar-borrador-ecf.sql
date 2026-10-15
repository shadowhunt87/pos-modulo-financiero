-- Deshace en una base de DESARROLLO la migración del borrador «wp/N3-ecf-borrador» (20261014120000_ecf_electronic_invoicing),
-- que choca con las migraciones reales de e-CF. Solo si esa migración aparece en «prisma migrate status» como
-- «not found locally». Saca un respaldo antes. Todo o nada.
BEGIN;
DROP TABLE IF EXISTS "EcfOutbox";
DROP TABLE IF EXISTS "EcfConfig";
ALTER TABLE "Invoice" DROP COLUMN IF EXISTS "ecfLastError", DROP COLUMN IF EXISTS "ecfOrigin", DROP COLUMN IF EXISTS "ecfQrUrl",
  DROP COLUMN IF EXISTS "ecfSecurityCode", DROP COLUMN IF EXISTS "ecfSignedAt", DROP COLUMN IF EXISTS "ecfStatus",
  DROP COLUMN IF EXISTS "ecfStatusAt", DROP COLUMN IF EXISTS "ecfTrackId";
ALTER TABLE "InvoiceLine" DROP COLUMN IF EXISTS "goodsOrService", DROP COLUMN IF EXISTS "unitOfMeasure";
DROP TYPE IF EXISTS "EcfStatus";
DROP TYPE IF EXISTS "EcfOrigin";
DROP TYPE IF EXISTS "GoodsOrService";
DROP TYPE IF EXISTS "EcfOutboxStatus";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261014120000_ecf_electronic_invoicing';
COMMIT;

-- Sola en su carpeta: Postgres no deja usar un valor nuevo de enum en la misma transacción que lo crea (PLAN-v0.2 §5.1)
-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'AUDITOR';

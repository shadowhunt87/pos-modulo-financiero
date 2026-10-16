-- POS completo: roles de tienda vendedor y almacén (solo entran a rutas del punto de venta, como el cajero)
ALTER TYPE "UserRole" ADD VALUE 'SELLER';
ALTER TYPE "UserRole" ADD VALUE 'WAREHOUSE';

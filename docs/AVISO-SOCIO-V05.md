# Aviso al socio: archivos tuyos que cambian con el POS como vertical

*2026-10-16 · Rama `modulos-catalogo-inventario-rrhh`. Plan: `docs/PLAN-POS.md`. Suite e2e en verde (504).*

| Área | Archivos | Qué cambia y por qué |
|---|---|---|
| Esquema | `prisma/schema.prisma` | Valores nuevos: `VERTICAL` en `SourceDocumentType` (V1a, contrato §3.2) y `CASHIER` en `UserRole` (excepción D-POS1). Columna `JournalEntry.sourceModule` con índice. Las tablas `Pos…` van **al final** y no tienen relaciones con tus modelos. |
| Asientos | `posting.service.ts` | `post` exige `sourceModule` con `VERTICAL` y prohíbe los diarios de ventas, compras, apertura y cierre. El reverso copia `sourceModule`. |
| Cobros y pagos | `payments.service.ts` | `createInTx` y `voidInTx`, con las mismas reglas en una transacción ajena. **Reembolso a cliente:** un pago `MADE` a un cliente aplicado a una nota de crédito de venta asienta Dr CxC / Cr caja o banco. |
| Facturación | `invoicing.service.ts` | `voidInTx`, con las mismas reglas que `void`. |
| Numeración | `document-sequences.service.ts` | `nextFor(tx, companyId, 'pos.venta', 'TK')` numera documentos de verticales en la misma tabla. |
| Acceso | `jwt-auth.guard.ts`, `decorators/cashier-allowed.decorator.ts` | Un usuario `CASHIER` solo entra a rutas `@CashierAllowed()`; en el resto recibe 403, también en lecturas. |
| Pruebas tuyas ajustadas | `security.e2e-spec.ts` | Lecturas restringidas del POS agregadas a la política de rutas. |

El paquete `pos-backend/` original **no se copió**: escribía asientos directo en las tablas, llevaba su propio contador de
NCF y su propio 607 y 606, y sus 6 modelos chocaban con los del núcleo. Lo que se rescató (caja, turnos, PIN, promociones)
se reescribió sobre los servicios del núcleo.

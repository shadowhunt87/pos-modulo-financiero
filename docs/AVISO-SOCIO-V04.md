# Aviso al socio: archivos tuyos que cambian con catálogo, inventario y RRHH

*2026-10-15 · Rama `modulos-catalogo-inventario-rrhh` (P1, P2 y P3; ver `docs/PLAN-catalogo-inventario-rrhh.md`). Suite e2e en verde (504).*

| Área | Archivos | Qué cambia y por qué |
|---|---|---|
| Esquema | `prisma/schema.prisma` | Modelos nuevos **al final** (`Product`, inventario, RRHH y nómina). En tus modelos solo hay relaciones nuevas (`Company`, `Account`, `TaxRate`, `JournalEntry`, `Invoice`, `BankAccount`, `CostCenter`), `InvoiceLine.productId` opcional, tres cuentas de inventario en `AccountingSettings` e `INVENTORY` y `PAYROLL` en `SourceDocumentType`. Tres migraciones nuevas; ninguna existente cambió. `prisma format` realineó columnas de algunos bloques (solo espacios). |
| Facturación | `invoicing.service.ts`, `dto/invoice.dto.ts`, `invoicing.module.ts` | La línea acepta `productId`. Si la línea no trae cuenta, toma la del producto. En compras, un producto con inventario va siempre a su cuenta de inventario. `issueTx` mueve existencias y crea el asiento de costo de ventas. `void` revierte los movimientos de inventario. |
| Maestros | `accounting-settings.*`, `document-sequences.service.ts`, `masters.module.ts` | Cuentas de inventario, costo de ventas y ajuste. Secuencias `AJ-` (ajustes de inventario) y `NOM-` (nóminas). Nuevo `/products`. |
| Pruebas tuyas ajustadas | `security.e2e-spec.ts` | Se agregaron a la lista de lecturas restringidas las rutas de `/hr` (solo ADMIN y ACCOUNTANT). |

Si tienes cambios en curso en estos archivos, avísame para unirlos sin pisarnos.

# Aviso al socio: POS completo (tienda) con roles vendedor y almacén

*2026-10-16 · Rama `modulos-catalogo-inventario-rrhh`, publicada como `main` en `pos-modulo-financiero`. Sigue a
`AVISO-SOCIO-V05.md` (POS como vertical).*

El punto de venta deja de ser solo la caja. Ahora tiene un frontend propio (`pos-frontend`, Vue) con facturación,
clientes, productos, inventario, compras y proveedores. La contabilidad se queda aquí. Para eso hacen falta **dos roles de
tienda nuevos** y rutas `/pos/store/*` que usan los servicios del núcleo **sin duplicar lógica**: el NCF, el ITBIS, el
inventario y los asientos los siguen haciendo facturación, inventario, cobros y terceros.

## Archivos tuyos que cambian

| Área | Archivo | Qué cambia y por qué |
|---|---|---|
| Esquema | `prisma/schema.prisma` | `UserRole` suma `SELLER` (vendedor) y `WAREHOUSE` (almacén). Migración `20261016150000_pos_store_roles` (solo `ALTER TYPE … ADD VALUE`). |
| Acceso | `auth/guards/jwt-auth.guard.ts`, `auth/decorators/cashier-allowed.decorator.ts` | La regla D-POS1 del cajero se generaliza a `STORE_ONLY_ROLES = CASHIER, SELLER, WAREHOUSE`: esos roles solo entran a rutas `@CashierAllowed()`. Qué rol entra a cada una lo sigue diciendo su `@Roles()`. |
| Maestros | `masters/masters.module.ts` | Exporta `ProductsService` (el POS crea y edita productos por el servicio, con sus validaciones de cuentas, impuestos e inventario). |
| Pruebas tuyas ajustadas | `test/security.e2e-spec.ts` | La política de lecturas restringidas incluye las rutas nuevas de `/pos/store` y el cambio de roles de `/pos/categories`. |
| Docker | `docker-compose.yml` | pgAdmin con un correo válido (`admin@financial.local` se rechazaba por el dominio `.local` y el contenedor se reiniciaba sin parar). |
| Frontend: acceso | `frontend/src/app/core/auth.ts`, `core/guards.ts`, `shared/labels.ts` | Tipos y nombres de los roles nuevos. `notCashierGuard`: si un vendedor o almacén entra al sistema contable, se le cierra la sesión con el aviso de usar el POS. |

## Lo nuevo (código del POS, `src/verticals/pos`)

- `pos-common.ts`: grupos de roles de tienda (`CATALOG_READERS`, `CATALOG_EDITORS`, `STOCK_READERS`, `STOCK_EDITORS`,
  `SALES_STAFF`, `INVOICE_READERS`, `COLLECTORS`, `APPROVAL_REQUESTERS`).
- `store.dto.ts`, `pos-store.service.ts` y `pos-store.controller.ts`: rutas `/pos/store/*`.
  - **Productos:** con su categoría, sus códigos de barra y si aparece en la caja.
  - **Existencias, kárdex y ajustes:** los de `InventoryService`.
  - **Compras:** factura `PURCHASE` emitida con el NCF del proveedor o B11, origen `pos.compra`.
  - **Clientes y proveedores:** los terceros del núcleo, con su saldo.
  - **Facturas de venta:** origen `pos.factura`. Precio del servidor y descuento con el mismo límite y PIN de la caja.
    Idempotentes por `clientUuid`.
  - **Cobro de facturas:** un cobro del núcleo aplicado a la factura, sin pasar del saldo.
  - **Anulación:** las ventas de caja (`pos.venta`) se anulan solo desde la caja, y lo de otros sistemas en su sistema.
  - **Resumen del día.**
- `pos.controller.ts`: las categorías las ve quien ve el catálogo y las edita también almacén. La autorización con PIN
  (`POST /pos/approvals`) también la pide el vendedor (descuento grande en una factura).

## Qué no cambia

- Ningún servicio del núcleo cambió de comportamiento: facturación, inventario, cobros y terceros se usan tal cual.
- Los roles existentes (ADMIN, ACCOUNTANT, APPROVER, VIEWER, AUDITOR) ven lo mismo de antes en el sistema contable.
- El frontend Angular sigue teniendo su caja (`/pos/caja`) y su administración del POS.

## Verificación

- Backend: `tsc` sin errores, 45 pruebas unitarias y **504 e2e en verde** (ver `BITACORA.md`, 16-oct (6)).
- Recorridos reales en la base de pruebas con un usuario de cada rol:
  - el almacén crea un producto, registra una compra y un ajuste, y el kárdex cuadra (24 − 1 = 23);
  - el vendedor factura con descuento grande y PIN (6 × 95 − 120 = 450 + 81 de ITBIS = 531);
  - la cajera cobra 200 y queda un saldo de 331;
  - cada rol recibe 403 fuera de su área.

# Plan: punto de venta (POS) como vertical del núcleo

Fecha: 15-oct-2026 · Rama: `modulos-catalogo-inventario-rrhh`.
Origen: el paquete `pos-backend/` (114 rutas) revisado el 15-oct. **No se copia tal cual**: no compila contra el núcleo y
rompe el contrato de verticales (`docs/CONTRATO-VERTICALES.md`). El análisis completo está en la bitácora.

## Qué se conserva y qué se delega

| Pieza del POS original | Qué pasa |
|---|---|
| Terminales, turnos, gaveta, entradas y salidas de efectivo, cierre con conteo, reportes X y Z | **Se queda en el POS** (tablas `Pos…`) |
| Ventas suspendidas, autorizaciones con PIN de supervisor, motor de promociones, cálculo de precios | **Se queda en el POS** |
| Venta con NCF | **Factura del núcleo** (`createInTx`, origen `pos.venta`). El núcleo asigna el NCF, calcula el ITBIS con su vigencia, hace el asiento y la sale en el 607/608 |
| Cobro de la venta (efectivo, tarjeta, transferencia, mixto) | **Cobro del núcleo** (`PaymentsService.createInTx`): efectivo a la caja de la terminal, tarjeta y transferencia a su banco |
| Devolución | **Nota de crédito del núcleo** + **reembolso** (extensión del núcleo: pago al cliente contra la nota) |
| Anulación de una venta | Anulación del cobro y de la factura en el núcleo (revierte inventario y asientos) |
| Clientes (`PosCustomer`) y proveedores (`Supplier`) | **Clientes y proveedores del núcleo** (`Partner`). «Consumidor final» es un cliente del núcleo |
| Productos, kárdex, costo promedio | **Catálogo e inventario del núcleo** (P1 y P2). El POS agrega categorías, códigos de barra y si se muestra en caja |
| Secuencias NCF propias y bloques offline | **Se eliminan**: un solo contador de NCF, el del núcleo |
| 606, 607, 608 y cuadre de ITBIS propios | **Se eliminan**: salen del núcleo |
| Compras, CxP y pagos a proveedores | **Se eliminan**: facturas de compra y pagos del núcleo |
| e-CF directo a la DGII (firma con .p12, receptor) | **Se elimina en esta versión**: el e-CF lo emite el núcleo por el proveedor certificado (N7). Si se elige E32 sin proveedor conectado, el núcleo responde con su mensaje |
| Asientos escritos a mano en las tablas | **Prohibido**. Los asientos propios del POS (entradas y salidas de efectivo, sobrantes y faltantes de caja) van por `PostingService.post` con origen `VERTICAL` y `sourceModule` (`pos.movimiento`, `pos.turno`) |

## Decisiones (D) tomadas con la opción recomendada

- **D-POS1 · Rol de cajero.** El contrato prohíbe crear roles, pero un POS necesita uno, así que se agrega **una sola**
  excepción: `CASHIER` en `UserRole`. Un cajero **solo** entra a las rutas marcadas `@CashierAllowed()`; para el resto, la
  guardia de sesión responde 403, también en lecturas. El supervisor no es un rol nuevo: es un ADMIN, ACCOUNTANT o APPROVER
  con PIN de POS. El rol «inventario» del paquete original tampoco se crea: lo hacen ADMIN y ACCOUNTANT.
- **D-POS2 · Una factura por venta.** Así cada ticket tiene su NCF, el cliente puede pedir B01 y la devolución es una nota
  de crédito de esa factura. El NCF por defecto (B02) y el de crédito fiscal (B01) se configuran en el POS; no van fijos en
  el código.
- **D-POS3 · Sin venta offline con NCF en esta versión.** El NCF lo asigna el núcleo al emitir. La caja necesita conexión
  para vender.
- **D-POS4 · Un almacén.** Es el inventario del núcleo. Sin kits ni listas de precio en esta versión: el precio sale del
  producto y las promociones lo ajustan.
- **D-POS5 · Tarjeta.** Va directo a la cuenta bancaria de la terminal, sin conciliación de liquidaciones del procesador en
  esta versión.
- **D-POS6 · Descuentos.** Un descuento manual mayor al % configurado (o cualquier anulación, devolución, salida de efectivo
  o apertura de gaveta sin venta) pide autorización con PIN de supervisor. La autorización sirve una sola vez y por 2
  minutos.

## Lo que necesita el núcleo (fase 1)

1. **V1a mínimo:** valor `VERTICAL` en `SourceDocumentType` (sola en su migración) y `JournalEntry.sourceModule`. `post`
   exige `sourceModule` con `VERTICAL`. `DocumentSequencesService.nextFor()` para numerar documentos de verticales.
2. `PaymentsService.createInTx` y `voidInTx`, e `InvoicingService.voidInTx`, para cobrar y anular dentro de la transacción
   de la venta.
3. **Reembolso a cliente:** un pago `MADE` a un cliente aplicado a una nota de crédito de venta (Dr CxC / Cr caja o banco).
4. `UserRole.CASHIER` y la guardia de alcance del cajero.

## API del POS (`/pos/...`, fase 2)

Configuración (settings, terminales, categorías y datos de producto en caja, promociones, PIN de supervisor), catálogo para
la caja, turnos (abrir, actual, entradas y salidas, cerrar con conteo, X y Z), ventas (crear idempotente por `clientUuid`,
ver, ticket, anular, devolver), ventas suspendidas y autorizaciones.

## Frontend (fase 3)

- **Caja** (`/pos/caja`, pantalla completa, la del cajero): terminal, abrir turno, productos por categoría y búsqueda o
  código de barras, carrito con descuentos, cliente y tipo de NCF, cobro mixto con cambio, ticket, suspender y recuperar,
  anular, devolver, entradas y salidas, cierre con conteo.
- **Administración** (menú «Punto de venta»): configuración y terminales, productos en caja, promociones, turnos y reporte
  Z, ventas del POS.

## Fase 4: POS completo (tienda) — 16-oct-2026

Pedido: que el POS sea un sistema comercial completo (venta, facturación, clientes, productos, caja, almacén e
inventario), con la contabilidad en el sistema financiero, roles que solo ven su área y enlaces del administrador al
sistema contable. Frontend en un repositorio aparte: `pos-frontend` (Vue 3).

**Decisiones tomadas con la opción recomendada** (el dueño autorizó decidir y documentar):

| ID | Decisión | Por qué |
|---|---|---|
| D-POS7 | Roles nuevos `SELLER` (vendedor) y `WAREHOUSE` (almacén), con la misma regla del cajero: solo rutas `@CashierAllowed()` | Cada rol ve solo su área también en el backend, no solo en el menú |
| D-POS8 | Rutas propias `/pos/store/*` que llaman a los servicios del núcleo, en lugar de abrir las rutas del núcleo a roles de tienda | No se tocan los permisos del sistema contable; la tienda tiene sus propias reglas (precio del servidor, límite de descuento, anulación) |
| D-POS9 | La factura de la tienda toma el precio del producto (no se escribe a mano) y el descuento pasa por el mismo límite y PIN de la caja | Mismo control que en la caja |
| D-POS10 | La compra es una factura `PURCHASE` del núcleo (NCF del proveedor o B11) y entra la mercancía al costo | Así quedan el kárdex, la cuenta por pagar, el 606 y el asiento sin código nuevo |
| D-POS11 | El cobro de facturas lo hace el cajero (y supervisores); el vendedor factura pero no cobra; anular facturas es de supervisores | Separación de funciones: quien vende no maneja el dinero |
| D-POS12 | Pagos a proveedores, anulación de cobros, notas de crédito manuales y reportes contables quedan en el sistema financiero | Es contabilidad; el POS solo enlaza |
| D-POS13 | Usuarios: el administrador los crea desde el POS con las rutas del núcleo (`/auth/register`, `/users`), con su clave de confirmación | No se duplica la gestión de usuarios |

**Pendiente:** venta sin conexión, cotizaciones, listas de precio, varios almacenes, transferencias entre almacenes,
exportar a Excel y PDF, sesión compartida entre el POS y el sistema contable.

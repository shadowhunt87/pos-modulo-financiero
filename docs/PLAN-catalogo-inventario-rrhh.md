# Plan: catálogo de productos, inventario y RRHH (nómina)

Fecha: 15-oct-2026 · Rama: `modulos-catalogo-inventario-rrhh` · Orden pedido: **backend y base de datos primero**, frontend después.

Tres paquetes, en este orden, un commit por paquete:

| Paquete | Qué | Riesgo |
|---|---|---|
| **P1** | Catálogo de productos y servicios, enlazado a las líneas de factura | Bajo |
| **P2** | Inventario perpetuo con costo promedio, conectado a facturación y contabilidad | Medio-alto |
| **P3** | RRHH: departamentos, empleados, conceptos y nómina dominicana (TSS, ISR, INFOTEP, regalía) | Medio-alto |

Las decisiones marcadas **(D)** se tomaron con la opción recomendada, porque el dueño pidió avanzar. Cualquiera se puede cambiar
antes de usar el módulo con datos reales.

---

## P1 · Catálogo de productos y servicios

**Tabla `Product`** (por empresa): código único, nombre, descripción, tipo (`GOODS` bien / `SERVICE` servicio), unidad,
precio de venta, costo de compra de referencia, impuesto de venta, impuesto de compra, cuenta de ingreso, cuenta de gasto y activo.

**API** (`/products`): crear, listar (búsqueda por código o nombre, tipo, activo, paginado), ver y editar. Escriben ADMIN y
ACCOUNTANT; los demás roles leen.

**Facturación:**
- La línea de factura acepta un `productId` opcional y lo guarda (`InvoiceLine.productId`).
- La línea **sigue llevando** su descripción, precio e impuesto: el frontend los llena desde el producto y el usuario los puede
  cambiar. Así las facturas viejas, las importadas y las del taller siguen igual.
- **(D)** Si la línea no trae cuenta, se usa la del producto: la de ingreso en ventas y la de gasto en compras. Si el producto
  tampoco tiene, se usa la de Configuración contable, como hoy.
- No se puede facturar un producto inactivo.

## P2 · Inventario

**Decisiones:**
- **(D) Costo promedio ponderado.** No FIFO, que es más complejo y no lo pide ningún cliente todavía. LIFO no está permitido.
- **(D) Inventario perpetuo**, por producto: el producto guarda existencia, valor y costo promedio, y cada cambio deja un
  movimiento (kárdex).
- **(D) Un solo almacén** por empresa en esta versión.
- **(D) No se vende sin existencia:** la venta que deja un producto en negativo se rechaza con un mensaje claro.
- **(D) El costo se calcula en el orden en que se registran los movimientos**, no por fecha. Una compra con fecha atrasada no
  recalcula las ventas ya hechas, y el kárdex se ordena por registro.
- Solo los productos `GOODS` con «Controla inventario» activo mueven existencias. Los servicios nunca.

**Cuentas:** el producto puede tener su cuenta de inventario y su cuenta de costo de ventas. Si no las tiene, se usan las de
Configuración contable (`inventoryAccountId`, `cogsAccountId`, `inventoryAdjustmentAccountId`).

**Con facturación (al emitir):**

| Documento | Existencia | Contabilidad |
|---|---|---|
| Compra | Entra, al costo neto de la línea en moneda base | La línea va a la cuenta de **inventario**, no a gasto (se fuerza) |
| Venta | Sale, al costo promedio | Asiento aparte: Dr costo de ventas / Cr inventario |
| Nota de crédito de venta (devolución) | Entra, al costo con que salió en la venta original | Dr inventario / Cr costo de ventas |
| Nota de crédito de compra (devolución al proveedor) | Sale, al valor de la nota | Ya lo hace el asiento de la nota (cuenta de inventario) |
| Nota de débito | No mueve existencia (es ajuste de precio) | La línea va a gasto o ingreso, no a inventario |
| Anulación | Se revierten sus movimientos al mismo costo y se anula el asiento de costo | Si una compra ya se vendió, no se puede anular |

**Ajustes de inventario:** documento con número `AJ-`, fecha, motivo, cuenta de contrapartida y líneas (producto, cantidad + o −,
costo para las entradas). Sirve para existencias iniciales, conteos físicos, mermas y daños. Genera su asiento y se puede anular.

**API** (`/inventory`): existencias y valor, kárdex por producto, ajustes (crear, listar, ver y anular).

## P3 · RRHH y nómina

**Datos:**
- Departamentos.
- Empleados: código, nombres, cédula o pasaporte, NSS, fecha de ingreso y de salida, cargo, departamento, salario mensual,
  frecuencia de pago (mensual, quincenal o semanal), forma de pago, cuenta bancaria, centro de costo y estado.
- Conceptos de nómina (ingresos y descuentos), cada uno con su cuenta y con banderas «cotiza TSS» y «paga ISR». Ejemplos: horas
  extra, comisión, préstamo, adelanto.
- Configuración de nómina: cuentas contables y la tasa de riesgos laborales de la empresa.

**Cálculo** (todo valor legal sale de **Valores fiscales** con vigencia, R9; nada fijo en el código):
- **Salario del período:** mensual = salario; quincenal = salario/2; semanal = salario × 12/52. Se prorratea por días
  calendario si la persona entra o sale dentro del período **(D)**.
- **TSS del empleado:** AFP 2.87 % y SFS 3.04 %. **Del empleador:** AFP 7.10 %, SFS 7.09 %, SRL (tasa de la empresa o 1.10 %)
  e INFOTEP 1 %.
- **Topes de la TSS:** AFP 20, SFS 10 y SRL 4 salarios mínimos cotizables, llevados al período **(D)**.
- **ISR:** se proyecta al año la base del período (ingresos que pagan ISR − AFP − SFS del empleado), se aplica la escala anual y
  se divide entre los períodos del año (método DGII).
- **Regalía pascual:** nómina aparte = salario ordinario pagado en el año ÷ 12 (si no hay nóminas, salario × meses trabajados ÷
  12). **(D)** Exenta de TSS e ISR (Código de Trabajo art. 219-222). **Por validar** con la contadora el tope de exención del ISR.
- **Neto** = bruto − TSS del empleado − ISR − otros descuentos. Si da negativo, la nómina no se puede calcular.

**Ciclo de una nómina:** borrador (se calcula sola al crear) → novedades por empleado y recálculo → **contabilizar** (asiento) →
**pagar** desde una cuenta bancaria (asiento) → o **anular** (antes del pago).

**Asiento al contabilizar:**
- Dr gasto de sueldos y Dr gasto de aportes patronales.
- Cr TSS por pagar (empleado + empleador + INFOTEP), Cr ISR retenido por pagar, Cr otros descuentos por pagar (o la cuenta del
  concepto) y Cr sueldos por pagar (neto).

**Reportes JSON:** resumen TSS del mes y resumen IR-3 (ISR retenido a asalariados) del mes.

**Roles (D):** solo ADMIN y ACCOUNTANT ven y tocan RRHH, porque los salarios son datos sensibles. AUDITOR y VIEWER no.

**Valores fiscales nuevos:** `docs/normativa-dgii/parametros/2026-10-15_nomina.json`, todos «Por validar»:
- `TSS_AFP_EMPLEADO`, `TSS_AFP_EMPLEADOR`, `TSS_SFS_EMPLEADO`, `TSS_SFS_EMPLEADOR`, `TSS_SRL_EMPLEADOR` e `INFOTEP_EMPLEADOR`;
- `TSS_SALARIO_MINIMO_COTIZABLE`: RD$23,223.00 desde el 01-feb-2026;
- `TSS_TOPE_AFP_SALARIOS`, `TSS_TOPE_SFS_SALARIOS` y `TSS_TOPE_SRL_SALARIOS`;
- `ISR_ASALARIADOS_ESCALA`: exento hasta RD$416,220.00 al año; 15 %, 20 % y 25 %.

Antes del 01-feb-2026 no hay salario mínimo cotizable cargado, así que la nómina de esas fechas da 422 hasta que se cargue.

## Queda fuera de esta versión (pendiente)

- Archivos oficiales: autodeterminación de la TSS (SUIR) e IR-3 en el formato de la DGII. Por ahora hay resúmenes JSON.
- Vacaciones (14 y 18 días), prestaciones laborales (preaviso, cesantía), liquidaciones, préstamos con cuotas automáticas y
  bonificación (utilidades).
- Varios almacenes, FIFO, lotes y series, e importación del catálogo desde Excel.
- Pruebas nuevas: por la preferencia actual (desarrollo primero, QA después) solo se garantiza que compile y que las pruebas
  existentes sigan en verde.

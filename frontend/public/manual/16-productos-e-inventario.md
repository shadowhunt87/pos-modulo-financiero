# Productos e inventario

*Actualizado: 2026-10-15 · Corresponde a: catálogo e inventario (P1 y P2)*

El **catálogo** es la lista de lo que vendes o compras: productos (bienes) y servicios. Si un bien **controla existencias**, el sistema lleva cuántas unidades tienes y cuánto valen.

Dónde está: menú **Ventas y compras › Productos y servicios**, e **Inventario › Existencias** e **Inventario › Ajustes de inventario**.

## Si eres el dueño

Con el catálogo facturas más rápido: eliges el producto y se llenan solos la descripción, el precio y el impuesto. Puedes cambiarlos en cada factura.

Si vendes mercancía, marca **Controlar existencias** en esos productos. Desde ese momento las compras suman, las ventas restan y el sistema **no deja vender lo que no tienes**. Cada venta registra también su **costo de ventas**, así tu ganancia sale bien en los estados financieros.

Solo el Administrador y el Contador pueden crear productos y ajustes. Los demás pueden mirar.

## Crear un producto o servicio

1. Entra a **Productos y servicios** y pulsa **Nuevo producto o servicio**.
2. Escribe el **Código** (por ejemplo ACE-001, sin espacios) y el **Nombre**.
3. Elige el **Tipo**: **Servicio** o **Bien (mercancía)**. Escribe la **Unidad** (UND, HORA, GAL…).
4. Si quieres, escribe el **Precio de venta**, el **Impuesto de venta**, el **Costo de compra** y el **Impuesto de compra**.
5. Las cuentas son opcionales: sin ellas se usan las de **Configuración › Cuentas automáticas**.
6. Pulsa **Guardar**.

## Usar un producto en una factura

1. En **Nueva factura**, en cada línea elige el **Producto o servicio**.
2. Se llenan la **Descripción**, el **Precio unitario** y el **Impuesto** (en una venta, los de venta; en una compra, los de compra).
3. Ajusta lo que necesites y guarda como siempre.

Una línea también puede ir sin producto, escrita a mano como antes.

## Controlar existencias

En un **Bien**, marca **Controlar existencias (inventario)**. Si quieres, elige su **Cuenta de inventario** y su **Cuenta de costo de ventas**. Si no, se usan las de **Cuentas automáticas › Inventario**.

- **Compra:** entra al costo de la línea (sin impuesto, con descuento). Su línea va siempre a la cuenta de inventario.
- **Venta:** sale al **costo promedio** y se registra el costo de ventas.
- **Nota de crédito de una venta (devolución):** vuelve al costo con que salió.
- **Nota de crédito de una compra (devolución al proveedor):** sale por el valor de la nota.
- **Anular una factura:** sus movimientos se revierten al mismo valor.

Si un producto ya tiene movimientos, no se le puede quitar el control de existencias.

## Ver las existencias y el kárdex

En **Inventario › Existencias** ves cada producto con su existencia, su costo promedio y su valor, y arriba el **valor total del inventario**. Pulsa **Ver kárdex** para ver cada entrada y salida en el orden en que se registró, con lo que quedó después de cada una.

## Registrar la existencia inicial y otros ajustes

1. Entra a **Inventario › Ajustes de inventario** y pulsa **Nuevo ajuste**.
2. Escribe la **Fecha** y el **Motivo** (por ejemplo, «Existencia inicial»).
3. Elige la **Cuenta de contrapartida**: un gasto para faltantes y mermas, o patrimonio para la existencia inicial. Si la dejas vacía se usa la de Cuentas automáticas.
4. Agrega cada producto: **Entrada** con su costo unitario, o **Salida** (sale al costo promedio).
5. Pulsa **Registrar ajuste**. Se crea el ajuste **AJ-…** con su asiento.

## Anular un ajuste

Abre el ajuste y pulsa **Anular ajuste**. Escribe el motivo. Sus movimientos se revierten al mismo valor y se reversa su asiento. No se puede si ya salió mercancía que entró con ese ajuste.

## Qué pasa en la contabilidad

- La compra de un producto con existencias va a **Inventario** (activo), no a gasto.
- La venta registra un segundo asiento: **Costo de ventas** contra **Inventario**.
- Los ajustes van contra la cuenta de contrapartida que elijas.

Así el saldo de la cuenta de inventario en el mayor es igual al valor total de **Existencias**.

## Si algo sale mal

- **«No hay existencia suficiente…»**: la venta pide más de lo que hay. Registra primero la compra o un ajuste de entrada.
- **«Falta configurar en Configuración contable: inventoryAccountId»** (o cogsAccountId): elige las cuentas de inventario en **Cuentas automáticas** o en el producto.
- **«No se puede anular: ya salió mercancía…»**: la mercancía de esa compra o ajuste ya se vendió. Registra una devolución o un ajuste en su lugar.

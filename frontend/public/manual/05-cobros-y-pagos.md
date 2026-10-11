# Cobros, pagos y lo que me deben y lo que debo

*Actualizado: 2026-10-10 · Corresponde a: v0.2, Fase 1*

Un **cobro** es dinero que te paga un cliente. Un **pago** es dinero que le entregas a un proveedor. Cada uno se aplica a una o varias facturas para saldarlas.

Dónde está: menú **Ventas y compras › Cobros y pagos** y **Ventas y compras › Lo que me deben y lo que debo**.

## Si eres el dueño

Cuando un cliente te paga:

1. Registras el cobro (cuánto, cuándo y en qué cuenta entró).
2. Eliges qué facturas paga.
3. La factura pasa a **Pagada** (o **Pago parcial** si pagó una parte).

Para saber quién te debe y quién está atrasado, abre **Lo que me deben y lo que debo**. Ahí ves el total por cobrar, cuánto está vencido y de qué cliente es.

Solo el Administrador y el Contador registran cobros y pagos. Anular lo hacen el Administrador y el Aprobador.

## Registrar un cobro

1. En **Cobros y pagos**, pulsa **Nuevo cobro o pago**. (O usa **Registrar cobro o pago** en el Panel.)
2. En **Tipo** deja **Cobro**.
3. Elige el **Cliente**. Si no existe, pulsa **Crear** debajo del campo (mira [Clientes y proveedores](/help/clientes-y-proveedores#crear-uno-sin-salir-de-la-factura-o-del-cobro)).
4. Revisa la **Fecha**.
5. Elige el **Método** (mira [Métodos de pago](#metodos-de-pago)).
6. En **Depositar en**, elige la cuenta del banco o la caja donde entró el dinero.
7. Escribe el **Monto**.
8. Si quieres, escribe la **Referencia** (el número de transferencia o cheque) y las **Notas**.
9. En **Aplicar a facturas** verás las facturas pendientes del cliente. Pulsa **Aplicar automáticamente** para que se reparta de la más vieja a la más nueva, o escribe a mano el **Monto a aplicar** en cada una.
10. Pulsa **Registrar cobro**. Verás "Cobro registrado." y se abrirá el detalle.

[CAPTURA: formulario de nuevo cobro con la tabla de facturas pendientes y los montos aplicados]

Un **pago a un proveedor** es igual: cambia **Tipo** a **Pago**, elige el **Proveedor**, y el campo se llamará **Pagar desde**.

## Aplicar a facturas y anticipos

- Solo aparecen las facturas que tienen saldo y están en la **misma moneda** que la cuenta o caja elegida.
- No puedes aplicar más que el monto del cobro. El sistema te avisa en rojo.
- No puedes aplicar a una factura más que su **Saldo pendiente**.
- Lo que no apliques a ninguna factura queda como **anticipo**: dinero recibido (o entregado) que todavía no está asignado. Lo ves abajo como "Anticipo (lo que sobra del monto)".
- Un anticipo se aplica después: abre el cobro o pago y pulsa **Aplicar anticipo a facturas**.

[CAPTURA: detalle de un cobro con anticipo sin aplicar y el botón "Aplicar anticipo a facturas"]

## Métodos de pago

Son cuatro: **Efectivo**, **Transferencia**, **Cheque** y **Tarjeta**. Describen cómo se movió el dinero. Lo importante es la cuenta o caja que eliges: el dinero entra o sale de esa.

## Ver un cobro o un pago y anularlo

1. En **Cobros y pagos**, filtra por **Tipo**, **Estado**, **Cliente o proveedor**, **Desde** y **Hasta**, y pulsa el número para abrir uno.
2. En el detalle ves el **Monto**, lo **Aplicado a facturas**, el **Anticipo sin aplicar**, la cuenta, la referencia y el asiento.
3. Si registraste algo mal, pulsa **Anular** (solo Administrador o Aprobador).
4. Escribe el **Motivo de la anulación** y confirma.

Al anular, las facturas vuelven a tener saldo pendiente y los libros se corrigen. No se puede deshacer.

Un cobro o pago aparece como **Registrado** (verde) o **Anulado** (rojo).

[CAPTURA: detalle de un cobro registrado con el botón Anular]

## Lo que me deben y lo que debo

Es la pantalla para saber cómo vas con tus cobros y pagos. Dónde: **Ventas y compras › Lo que me deben y lo que debo**. (En la pantalla puede aparecer con su nombre anterior, "Cuentas por cobrar y pagar".)

1. En **Ver**, elige **Por cobrar (clientes)** o **Por pagar (proveedores)**.
2. En **Al corte**, deja la fecha de hoy o elige otra y pulsa **Actualizar**.
3. Arriba verás cuatro cifras: **Total por cobrar** (o por pagar), **Al día**, **Vencido** (con su porcentaje) y **Más de 90 días**.
4. En la tabla, cada fila es un cliente o proveedor. Las columnas dicen cuánto está **Al día** y cuánto lleva atrasado: **1–30 días**, **31–60 días**, **61–90 días** y **Más de 90**. Mientras más a la derecha, más grave.
5. Pulsa **Estado de cuenta** en una fila para ver su historial.

[CAPTURA: pestaña "Antigüedad de saldos" con las cuatro cifras y la tabla]

## El estado de cuenta

Es la lista de movimientos de un cliente o proveedor: lo que se le facturó y lo que pagó.

1. Pulsa la pestaña **Estado de cuenta**.
2. Elige el cliente (o proveedor) y las fechas **Desde** y **Hasta**.
3. Pulsa **Ver estado de cuenta**.
4. Verás el **Saldo inicial**, cada movimiento y el **Saldo final**. Pulsa el número de asiento para ver su detalle.

Un saldo negativo significa un anticipo a favor de esa persona o empresa.

[CAPTURA: estado de cuenta de un cliente]

## Aplicar una nota de crédito

Cuando hiciste una nota de crédito (mira [Facturas](/help/facturas#corregir-un-error-nota-de-credito-nota-de-debito-o-anulacion)), debes descontarla de una factura:

1. En esta pantalla, pulsa **Aplicar nota de crédito** (arriba a la derecha).
2. Elige el cliente o proveedor.
3. Elige la **Nota de crédito** y la **Factura a la que se aplica**. El **Monto a aplicar** se llena con el máximo posible.
4. Pulsa **Aplicar nota**. Verás "Nota de crédito aplicada a la factura."

[CAPTURA: ventana "Aplicar nota de crédito"]

## Marcar facturas vencidas

Solo para el Administrador. Pulsa **Marcar facturas vencidas** y confirma: las facturas con fecha de vencimiento pasada cambian su estado a **Vencida**. No cambia ningún saldo.

## Si eres la contadora

- **Cobros y pagos** generan un asiento al registrarse. La moneda del documento es la de la cuenta de banco o caja elegida; esa cuenta debe estar activa y tener cuenta contable asociada.
- **Tasa de cambio**: si la moneda no es la base, se pide; vacía usa la registrada para la fecha.
- **Aplicaciones**: solo facturas de venta en cobros y de compra en pagos, del mismo cliente o proveedor, abiertas (Emitida, Pago parcial, Vencida), en la misma moneda, sin repetir factura, y sin exceder el saldo. La suma no puede pasar del monto.
- **Anticipo**: el sobrante queda sin aplicar y se contabiliza en la cuenta de anticipos de clientes o proveedores de **Cuentas automáticas**. Se asigna luego con una fecha de aplicación, y solo hasta el monto sin aplicar.
- **Anulación**: revierte el asiento y restaura los saldos de las facturas. Una factura con pagos aplicados no se anula hasta anular esos pagos.
- **Antigüedad**: se cuenta desde la fecha de vencimiento, en moneda base. Las notas de crédito sin aplicar restan del saldo. La fecha **Al corte** permite ver el saldo a una fecha.
- **Estado de cuenta**: por cliente o proveedor, con saldo inicial, movimientos (débito/crédito con su asiento) y saldo final. Negativo = anticipo.
- **Aplicar nota de crédito**: debe ser del mismo cliente o proveedor, mismo lado y misma moneda; el monto no pasa del disponible de la nota ni del saldo de la factura.
- Para los cobros y pagos hace falta tener configuradas las cuentas de cobrar y pagar en **Cuentas automáticas**.
- Un cobro o pago bancario puede conciliarse después contra el extracto; su asiento conciliado no se puede anular.

## Si algo sale mal

| Qué ves | Qué hacer |
|---|---|
| No veo **Nuevo cobro o pago** | Tu rol es de solo lectura o aprobador. |
| No aparece ninguna factura para aplicar | La factura puede estar pagada, anulada o en otra moneda que la cuenta elegida. O es de otro cliente o proveedor. |
| "Lo aplicado a facturas supera el monto" | Baja los montos aplicados o sube el monto del cobro. |
| "excede su saldo" | Aplica como máximo el saldo pendiente de esa factura. |
| "El pago es en … la cuenta es en …" | Elige una cuenta o caja de la misma moneda que las facturas. |
| No puedo anular un cobro | Solo el Administrador y el Aprobador pueden. Si ya fue conciliado con el banco, avisa a tu contadora. |
| Faltan cuentas contables | Pide a tu contadora que complete [Cuentas automáticas](/accounting-settings). |

Más en [Preguntas frecuentes](/help/preguntas-frecuentes).

## En mejora

Esto es conocido o está planeado. No lo reportes como error:

- El título de la pantalla todavía dice "Cuentas por cobrar y pagar" y las columnas dicen "Tercero". El menú ya usa los nombres nuevos.
- Al aplicar una nota de crédito hay que hacerlo a mano; no se descuenta sola.
- La ayuda **?** junto a campos como Método y Anticipo se está incorporando.

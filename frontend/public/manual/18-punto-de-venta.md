# Punto de venta

*Actualizado: 2026-10-16 · Corresponde a: punto de venta (POS)*

La **caja** es la pantalla para vender en el mostrador: tocas o escaneas los productos, cobras y entregas el ticket. Cada venta es una **factura del sistema** con su NCF. Por eso sale sola en el 607, en el inventario y en la contabilidad.

Dónde está: menú **Punto de venta**. Los **cajeros** entran directo a la caja y no ven el resto del sistema.

## Si eres el dueño

1. Prepara el POS en **Punto de venta › Configuración del POS**.
2. Crea los usuarios cajeros con el rol **Cajero** en **Configuración › Usuarios**.
3. Cada supervisor (administrador, contador o aprobador) pone su **PIN** para autorizar en la caja.

Al final del día, en **Turnos de caja** ves lo que se vendió y si la caja cuadró.

## Preparar el punto de venta

1. Entra a **Configuración del POS** y pulsa **Preparar**. Se crean el cliente «Consumidor final» y los ajustes por defecto.
2. Revisa los ajustes:
   - el **comprobante por defecto** (B02) y el de **crédito fiscal** (B01);
   - el **descuento sin PIN** (%);
   - la cuenta de **sobrantes y faltantes de caja**.
3. Crea una **terminal** por cada caja física. Elige la **caja** donde entra el efectivo y, si acepta, el banco de las **tarjetas** y el de las **transferencias**. Las cajas y bancos se crean en **Bancos y caja**.
4. Pon tu **PIN de supervisor** (4 a 6 números).
5. En **Productos en caja**, elige qué productos aparecen, su categoría y sus códigos de barra. Un producto sin precio de venta no aparece.

Antes de vender, revisa que estén configurados:

- los comprobantes **B02**, **B01** y **B04** (este último es para las devoluciones);
- las **Cuentas automáticas**: cuentas por cobrar, ingresos e inventario.

## Abrir el turno

1. Entra a **Punto de venta › Abrir la caja** (el cajero entra directo).
2. La primera vez, elige qué caja es; el equipo lo recuerda.
3. Escribe el **fondo inicial** y pulsa **Abrir turno**.

## Vender

1. Toca un producto o escanea su código. **F2** pone el cursor en la búsqueda.
2. Para cambiar la cantidad usa **−** y **+**. Para un descuento, pulsa **Descuento** en la línea.
3. Las **promociones** se aplican solas y se ven en verde.
4. Para otro cliente, pulsa **Cliente**: lo buscas o lo creas. Si pide crédito fiscal, elige **B01** en **Comprobante**.
5. Pulsa **Cobrar** (**F12**). Agrega los pagos: efectivo (con los botones de billetes), tarjeta o transferencia; se pueden mezclar. El sistema calcula el **cambio**.
6. Pulsa **Confirmar cobro**. Imprime el ticket o pasa a la siguiente venta con **Enter**.

Si el descuento pasa del permitido, si es una venta a crédito, o si anulas, devuelves o sacas efectivo, la caja pide la **autorización de un supervisor**: su correo y su PIN.

## Suspender y recuperar

- **Suspender** (**F9**) guarda la venta para atender a otro cliente.
- **Suspendidas** (**F10**) la recupera. Antes de cerrar el turno no puede quedar ninguna suspendida.

## Anular y devolver

En **Ventas y devoluciones** buscas el ticket (también de otros días, por su número o su NCF).

- **Anular** solo se puede en el mismo turno. Anula la factura y el cobro, y repone el inventario. Elige el motivo de la DGII.
- **Devolución:** elige qué y cuánto se devuelve y cómo le devuelves el dinero. Se hace una **nota de crédito** (B04) y el reembolso. Lo devuelto vuelve al inventario.

## Efectivo de la gaveta

En **Efectivo** registras:

- **salidas**, como un depósito al banco o un pago menor;
- **entradas**, como el fondo de cambio;
- **abrir la gaveta** sin venta.

Cada entrada y salida hace su asiento. Las salidas y la gaveta piden PIN.

## Cerrar el turno

1. Pulsa **Cerrar turno** y cuenta el efectivo por billete y moneda.
2. Después de confirmar, el sistema muestra lo que **debería haber**, lo **contado** y si hay **sobrante** o **faltante**.
3. La diferencia se registra sola en la cuenta de sobrantes y faltantes.

## Ventas del POS y turnos

- En **Ventas del POS** ves lo vendido por día, caja y cajero, y los productos más vendidos.
- En **Turnos de caja** está cada turno con su reporte, sus movimientos de efectivo y sus ventas, con el enlace a cada factura.

## Si algo sale mal

- **«El punto de venta no está configurado»**: un administrador debe pulsar **Preparar** en **Configuración del POS**.
- **«No hay existencia suficiente…»**: registra la compra o un ajuste de inventario.
- **«No hay secuencia de NCF…»**: registra los comprobantes autorizados en **Comprobantes fiscales (NCF)**.
- **«El total cambió…»**: cambió un precio o una promoción. La caja ya se actualizó; revisa el carrito y cobra de nuevo.
- **«Supervisor o PIN incorrecto»**: después de 5 intentos el PIN se bloquea 5 minutos.

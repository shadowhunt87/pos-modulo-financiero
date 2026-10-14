# Facturas, notas de crédito y notas de débito

*Actualizado: 2026-10-10 · Corresponde a: v0.2, Fase 1*

Una **factura de venta** es lo que le cobras a un cliente. Una **factura de compra** es lo que te cobra un proveedor. Una **nota de crédito** corrige una factura hacia abajo (una devolución o un descuento). Una **nota de débito** la corrige hacia arriba (un cargo adicional).

Dónde está: menú **Ventas y compras › Facturas**.

## Si eres el dueño

Hacer una factura toma un minuto:

1. Eliges el cliente.
2. Escribes qué vendiste y a qué precio.
3. Pulsas **Guardar y emitir**.

Al emitir, el sistema le pone número, le asigna el comprobante fiscal (NCF) y lo registra en tus libros. No tienes que hacer nada más.

Mientras no la emitas, es un **borrador**: la puedes cambiar o borrar sin consecuencias. Una vez emitida, ya no se edita; si te equivocas se corrige con una nota de crédito o se anula.

Solo el Administrador y el Contador crean facturas. Anular lo hacen el Administrador y el Aprobador.

## Los estados de una factura

| Estado | Qué significa |
|---|---|
| **Borrador** | Todavía no vale. Sin número ni comprobante. Se puede editar o eliminar. |
| **Emitida** | Ya tiene número y comprobante. Nadie ha pagado. |
| **Pago parcial** | Han pagado una parte. |
| **Pagada** | Pagada completa. Se ve en verde. |
| **Vencida** | Pasó la fecha de vencimiento y aún debe. Se ve en rojo. |
| **Anulada** | Se canceló. Su efecto en los libros se revirtió. |

## Buscar facturas

1. Entra a **Facturas**.
2. Escribe un número o NCF en **Buscar**.
3. Usa los filtros **Tipo**, **Estado**, **Tercero** (el cliente o proveedor), **Desde** y **Hasta**.
4. Marca **Solo vencidas** para ver a quién cobrarle.
5. Pulsa el número de una factura para abrirla.

[CAPTURA: lista de facturas con filtros y estados de colores]

## Hacer una factura de venta

1. En **Facturas**, pulsa **Nueva factura**. (También sirve el botón del Panel.)
2. En **Tipo de documento** deja **Venta**.
3. En **Cliente**, escribe el nombre o RNC y elígelo. Si no existe, pulsa **Crear** debajo del campo (mira [Crear uno sin salir de la factura](/help/clientes-y-proveedores#crear-uno-sin-salir-de-la-factura-o-del-cobro)).
4. Revisa la **Fecha de emisión** (viene con la de hoy) y el **Vencimiento**.
5. Elige el **Tipo de comprobante (NCF)**. Si el cliente tiene uno por defecto, dirá "Según el cliente". Mira [Qué es el NCF](#que-es-el-ncf).
6. En **Líneas**, escribe la **Descripción**, la **Cantidad** y el **Precio unitario** de lo que vendiste.
7. En **Impuesto**, elige el ITBIS si aplica. El ITBIS es el impuesto sobre las ventas; el sistema calcula el monto.
8. Para vender más cosas, pulsa **Agregar línea**. Para quitar una, pulsa la **✕**.
9. Revisa los **totales** abajo a la derecha: Subtotal, Impuestos, Total y Saldo por cobrar.
10. Pulsa **Guardar y emitir**.

Verás el aviso "Factura … emitida." y se abrirá la factura con su número y su NCF.

[CAPTURA: factura de venta llena con líneas, impuesto y totales]

Detalles útiles:

- El **Descuento** de cada línea es un **monto en pesos**, no un porcentaje.
- **Cuenta** déjala en "Predeterminada" salvo que tu contadora te diga otra cosa.
- **Moneda**: si eliges dólares o euros, aparece **Tasa de cambio**. Si la dejas vacía se usa la tasa registrada para esa fecha.
- **Tipo de ingreso (607)** clasifica la venta para el reporte de la DGII. Si no sabes, déjalo en "Sin clasificar" y consulta a tu contadora.
- Si algo está mal, verás avisos amarillos o un mensaje rojo con "Cómo arreglarlo".

## Guardar como borrador o emitir

Tienes dos botones al final:

- **Guardar borrador**: la guarda sin número ni comprobante. Úsalo si no estás seguro o falta algo.
- **Guardar y emitir**: la guarda y la emite de una vez.

Para terminar un borrador:

1. Abre la factura desde la lista.
2. Pulsa **Editar** para cambiarla, si hace falta, y guarda.
3. Pulsa **Emitir factura**.
4. Confirma el tipo de comprobante y pulsa **Emitir factura** otra vez.

Para descartar un borrador, pulsa **Eliminar borrador**. Se borra del todo.

[CAPTURA: detalle de un borrador con los botones Editar, Eliminar borrador y Emitir factura]

## Registrar una factura de compra

Cuando un proveedor te factura y quieres anotarlo:

1. Pulsa **Nueva factura** y en **Tipo de documento** elige **Compra**.
2. Elige el **Proveedor**. Si no existe, pulsa **Crear**.
3. Escribe el **NCF del proveedor**, tal como está impreso en su factura (por ejemplo `B0100000001`). Es obligatorio para emitir.
4. Si el proveedor no te dio comprobante, en **Comprobante propio** elige **B11** (proveedor informal) o **B13** (gastos menores). El sistema crea el número.
5. Elige el **Tipo de gasto (606)** para el reporte de la DGII, o déjalo en "Sin clasificar".
6. Llena las líneas y pulsa **Guardar y emitir**.

El sistema no te deja registrar dos veces el mismo NCF del mismo proveedor.

[CAPTURA: factura de compra con NCF del proveedor y tipo de gasto]

## Corregir un error: nota de crédito, nota de débito o anulación

No se edita una factura emitida. Según el caso:

**Devolviste mercancía o hiciste un descuento: nota de crédito.**

1. Abre la factura emitida.
2. Pulsa **Nota de crédito**. Se abre una factura nueva con los datos de la original ya puestos.
3. Cambia las cantidades o precios para que sean lo que devuelves.
4. Pulsa **Guardar y emitir**.
5. Para que reste de lo que te deben, aplícala a la factura en [Lo que me deben y lo que debo](/help/cobros-y-pagos#aplicar-una-nota-de-credito).

La suma de las notas de crédito no puede pasar del total de la factura original.

**Cobras algo adicional: nota de débito.** Mismo camino con **Nota de débito**. Llega con las líneas vacías: escribe el cargo adicional.

**La factura nunca debió existir: anular.**

1. Abre la factura. Si tiene cobros o pagos aplicados, anúlalos antes desde su detalle.
2. Pulsa **Anular** (solo Administrador y Aprobador).
3. Escribe el **Motivo**.
4. Si el comprobante lo emitiste tú, elige el **Código de anulación DGII**. Es obligatorio y se reporta en el 608.
5. Pulsa **Anular factura**. Quedará en estado Anulada y los libros se corrigen solos.

Los botones de nota y de anular solo aparecen en facturas ya emitidas y sin anular.

**Cuándo no se puede anular.** Una factura de un **mes cerrado**, de un mes **ya declarado** a la DGII (pasó el día 15 del mes siguiente) o una **factura electrónica (e-CF)** no se anula: anularla cambiaría lo que ya se presentó. Se corrige con una **nota de crédito**. Si lo intentas, el sistema te lo explica y te ofrece el botón **Crear nota de crédito**.

[CAPTURA: ventana "Anular factura" con Motivo y Código de anulación DGII]

## Importar facturas electrónicas (XML)

Las facturas electrónicas (las que empiezan con **E**, como E310000000001) las firma y las envía a la DGII tu
proveedor de facturación electrónica. Mientras ese proveedor no esté conectado al sistema, el camino es:

1. Emite la factura en el **portal de tu proveedor** (o recibe la de tu suplidor) y descarga su **XML**.
2. Entra a **Ventas y compras → Importar facturas electrónicas** y pulsa **Elegir archivos XML**. Puedes subir hasta
   10 a la vez, de hasta 1 MB cada uno.
3. Revisa lo que muestra cada archivo: si es venta o compra, el cliente o proveedor (si no existe, dice **Se creará**),
   el total y si modifica otra factura.
4. En una compra, elige el **Tipo de gasto (606)**; en una venta, el **Tipo de ingreso (607)**.
5. Pulsa **Importar y contabilizar**. La factura queda emitida, con su asiento, y marcada **No verificado con la DGII**
   (el sistema no comprueba la firma del XML).

Si el archivo tiene un problema (no es de tu empresa, el total no cuadra, ya se importó, falta el impuesto), lo dice
en rojo y no deja importarlo hasta corregirlo. **Descartar** lo quita de la lista sin guardar nada.

**Una factura electrónica no se anula.** Se corrige con una **nota de crédito E34**: emítela en el portal de tu
proveedor e impórtala aquí. El sistema la enlaza con la factura que corrige y le descuenta el saldo.

[CAPTURA: pantalla "Importar facturas electrónicas" con un archivo revisado]

## Facturas electrónicas (e-CF)

Menú **Ventas y compras › Facturas electrónicas (e-CF)**: la bandeja con el estado de cada comprobante electrónico:
**○ Por enviar**, **… Enviando**, **✓ Aceptado**, **✓ Aceptado condicional**, **✕ Rechazado** (con el motivo) o **! Contingencia**.

- Con la conexión activa, al emitir una factura E31, E32, E34… el sistema la envía solo a tu proveedor certificado.
- Si el proveedor o la DGII no responden, la factura queda en **contingencia**: se reintenta sola y el Panel te avisa (en rojo si pasa mucho tiempo). Puedes pulsar **Reintentar ahora**.
- Un e-CF **rechazado** nunca tuvo validez: corrige lo que dice el motivo, **anula** esa factura y emite una nueva.
- Un e-CF **aceptado** ya no se anula: se corrige con nota de crédito (E34).

## Conectar tu proveedor de e-CF

Menú **Configuración › Facturación electrónica: conexión** (solo administradores).

1. Elige el **Proveedor**. **Pruebas** sirve para practicar sin enviar nada a la DGII. Para el real elige **Proveedor certificado** y pega la **configuración técnica** que te da tu proveedor (dirección, rutas y formato).
2. Escribe el **token** que te da el proveedor: se guarda cifrado y nunca se vuelve a mostrar.
3. Elige el **Ambiente** (Pruebas o Producción), **quién numera** los e-NCF y los **tipos** que emitirás desde el sistema.
4. Marca **Conexión activa**, pulsa **Guardar** y luego **Probar la conexión**.

Mientras no haya conexión, emite tus e-CF en el portal del proveedor e [impórtalos](/ecf/import) aquí.

## Imprimir y adjuntar archivos

- **Imprimir** (arriba, en el detalle) abre la ventana de impresión del navegador.
- Abajo está **Adjuntos**: sube el PDF de la factura del proveedor o un comprobante. Se aceptan PDF, imágenes, Excel, Word, CSV y TXT.

## Qué es el NCF

El **NCF** (Número de Comprobante Fiscal) es el número que la DGII exige en cada venta para que sea válida. La DGII te autoriza un rango de números por cada tipo de comprobante.

Los tipos que más vas a usar al vender:

| Tipo | Úsalo cuando |
|---|---|
| **B01 · Crédito fiscal** | Le vendes a una empresa que va a deducir el ITBIS. Exige que el cliente tenga RNC o cédula. |
| **B02 · Consumo** | Le vendes a una persona final. |
| **B14, B15, B16** | Regímenes especiales, entidades del gobierno y exportaciones. |
| **E31, E32…** | Los equivalentes electrónicos, si tu empresa factura electrónicamente. |

Las notas de crédito y débito eligen su tipo solas.

El número exacto se asigna **al emitir**, no al guardar el borrador. Si no te deja emitir porque no hay números, mira [Comprobantes fiscales (NCF)](/ncf).

## Retenciones

Una **retención** es un impuesto que quien paga descuenta del total y entrega directamente a la DGII. Pasa cuando tu cliente o proveedor es un agente de retención (por ejemplo, el Estado o una empresa grande).

1. En la factura, baja a **Retenciones** y pulsa **Agregar retención**.
2. En **Retención**, elige cuál aplica.
3. Deja **Base (opcional)** vacía para que el sistema la calcule. Verás el **Monto**.
4. En los totales, **Retenciones** se resta y **Saldo por cobrar** (o por pagar) baja.

La retención de ITBIS se calcula sobre el ITBIS. Las demás, sobre el subtotal. No puede ser mayor que el total.

[CAPTURA: sección Retenciones con una retención agregada y los totales]

## Fecha de vencimiento y días de crédito

El **Vencimiento** es la fecha límite para pagar. Si lo dejas vacío, el sistema suma los **Días de crédito** del cliente o proveedor a la fecha de emisión. Pasada esa fecha, la factura se considera atrasada. Para que su estado cambie a **Vencida**, el administrador usa **Marcar facturas vencidas** en [Lo que me deben y lo que debo](/help/cobros-y-pagos#marcar-facturas-vencidas).

## Si eres la contadora

- **Cálculo**: por línea, cantidad × precio − descuento (monto), redondeado a 2 decimales; el impuesto se redondea por línea. La pantalla calcula los totales igual que el servidor.
- **Emisión** (un solo paso, en transacción): valida período y año abiertos, consume el NCF de la secuencia, asigna el número interno de la secuencia de documentos, valida el límite de crédito y genera el asiento. Desde el detalle puedes abrir el asiento.
- **Cuentas**: cada línea usa su cuenta, y si está vacía la de **Cuentas automáticas**. Cada impuesto y retención necesita su cuenta contable configurada en **Impuestos**.
- **Ventas**: el tipo sale de la factura o del NCF por defecto del cliente. B01 y E31 exigen RNC o cédula. En notas: crédito B04 (E34 si la original es electrónica), débito B03 (E33).
- **Compras**: el NCF del proveedor es obligatorio y único por proveedor. Con **Comprobante propio** B11 o B13 el NCF sale de tu secuencia.
- **Clasificación DGII**: Tipo de ingreso (607) en ventas y Tipo de gasto (606) en compras.
- **Retenciones**: base por defecto = ITBIS para retención de ITBIS y subtotal para el resto; se puede fijar a mano. El saldo de la factura es el total menos lo retenido.
- **Notas**: deben tener factura relacionada emitida, no anulada y del mismo cliente o proveedor. Las notas de crédito sumadas no pueden exceder el total original. No restan solas de la factura: se aplican en **Lo que me deben y lo que debo** (o quedan como saldo a favor).
- **Anulación**: revierte el asiento. Exige anular antes los pagos aplicados. El código DGII (01–10) es obligatorio cuando el NCF es propio (ventas, B11, B13) y alimenta el 608.
- **Moneda extranjera**: usa la tasa del campo o la registrada para la fecha; si no hay, no deja guardar.
- **Períodos**: con el mes o el año cerrado no se puede emitir ni anular con fecha dentro de él.
- Los borradores se pueden editar y eliminar; lo emitido solo se anula.

## Si algo sale mal

| Qué ves | Qué hacer |
|---|---|
| No veo **Nueva factura** | Tu rol es de solo lectura o aprobador. |
| "Elige el tipo de comprobante (NCF)" | El cliente no tiene uno por defecto. Elige B01 o B02 en la factura. |
| "No hay secuencia configurada…", "Se agotó el rango…" | Faltan números de comprobante. Pide a tu contadora que cargue la secuencia en [Comprobantes fiscales (NCF)](/ncf). |
| "El período fiscal … está cerrado" | Ese mes está cerrado. Usa otra fecha o pide a tu contadora que lo reabra. |
| "Solo se pueden editar borradores" | Es una factura emitida. Usa una nota de crédito o anula. |
| No puedo anular: "Tiene pagos aplicados" | Anula antes los cobros o pagos desde su detalle. |
| "Esta factura es de un mes ya declarado…" o "de un mes cerrado…" | No se anula: pulsa **Crear nota de crédito**. |
| "Excede el límite de crédito" | El cliente ya debe demasiado. Revisa su límite en Clientes y proveedores. |
| "Falta la tasa de cambio" | Escribe la tasa a mano en la factura. |
| "Configura la cuenta contable del impuesto" | Pide a tu contadora que complete el impuesto en [Impuestos](/tax-rates). |

Más en [Preguntas frecuentes](/help/preguntas-frecuentes).

## En mejora

Esto es conocido o está planeado. No lo reportes como error:

- Las listas y el detalle todavía usan la palabra "tercero" en lugar de "cliente / proveedor".
- La ayuda **?** junto a cada campo (NCF, retenciones, vencimiento) se está incorporando.
- La nota de crédito emitida no se descuenta sola de la factura original: hay que aplicarla a mano en Lo que me deben y lo que debo.

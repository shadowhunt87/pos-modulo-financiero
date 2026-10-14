# Configuración de la empresa

*Actualizado: 2026-10-10 · Corresponde a: v0.2, Fase 1 (versión corta)*

Aquí se deja el sistema listo para facturar. Se hace una vez y se vuelve a tocar muy pocas veces. Todo está en el menú **Configuración**.

## En pocas palabras

**Si eres el dueño:** esto lo suele hacer tu contadora contigo. Lo único que tú debes tener a mano son los datos de tu empresa y los números de comprobante (NCF) que te autorizó la DGII. Sin eso no podrás emitir facturas.

**Si eres la contadora:** la configuración mínima para emitir es: datos de la empresa, impuestos con su cuenta contable, secuencias de NCF, cuentas automáticas y libros diarios. Las pantallas de este grupo las ve todo el que tenga acceso al menú, pero cambiarlas requiere rol Administrador o Contador.

## Datos de la empresa

Menú **Configuración › Empresa**.

1. Revisa el **Nombre comercial**, la **Razón social** y el **RNC o cédula**.
2. Elige la **Moneda base** y el **Mes de inicio del año fiscal**.
3. Completa Teléfono, Correo, Dirección y, si quieres, la **URL del logo**.
4. Pulsa **Guardar cambios**. Verás "Datos de la empresa actualizados."

[CAPTURA: pantalla Empresa]

## Datos fiscales

Menú **Configuración › Datos fiscales** (o el botón **Datos fiscales (DGII)** en Empresa). Con estos datos el sistema sabe qué comprobantes, impuestos y plazos le tocan a tu empresa. Mientras falten, el Panel muestra el aviso **Completa los datos fiscales de tu empresa**.

1. Elige la **Clasificación en la DGII** (está en tu Oficina Virtual): define hasta cuándo puedes usar comprobantes B.
2. Elige el **Régimen de impuestos** (casi siempre Ordinario) y el **Tipo de sociedad**.
3. Elige el **Marco contable**: NIIF para las PYMES salvo que tu contadora diga otra cosa.
4. Si ya emites facturas electrónicas, escribe desde cuándo. Marca **Soy agente de retención** si la DGII te designó.
5. Pulsa **Guardar datos fiscales**. Solo un administrador puede guardar; los demás lo ven.

Si el año fiscal no cierra en marzo, junio, septiembre o diciembre, verás un aviso: son los únicos cierres que admite la DGII.

[CAPTURA: pantalla Datos fiscales]

## Valores fiscales

Menú **Configuración › Valores fiscales**. Son las tasas, montos y fechas de la DGII que usa el sistema (ITBIS, retenciones, umbral del 607, fin de los comprobantes B…). Cada uno dice **desde cuándo rige**, **de dónde sale** y su estado:

- **✓ Oficial**: tu contadora lo confirmó con su nombre.
- **? Por validar**: viene de la ley o de fuentes confiables, pero falta esa confirmación.

Nada se cambia a mano: cuando la ley cambia, se carga un valor nuevo con su fecha y lo anterior queda guardado. Con **Vigentes al** ves el valor que regía cualquier día, y con **Historial** todas sus versiones. Los botones **Excel** y **PDF** sacan la lista para que la contadora la revise.

[CAPTURA: pantalla Valores fiscales]

## Impuestos

Menú **Configuración › Impuestos**. Aquí viven el ITBIS (el impuesto sobre las ventas), las retenciones y otros impuestos que se eligen en las líneas de las facturas.

1. Pulsa **Nuevo impuesto**.
2. Escribe el **Nombre** y la **Tasa (%)**.
3. Elige el **Tipo** y **Aplica a** (ventas, compras o ambos).
4. Elige la **Cuenta para ventas** y la **Cuenta para compras**. Sin estas cuentas no se pueden emitir facturas con ese impuesto.
5. Guarda. Para cambiar uno existente usa **Editar**.

[CAPTURA: ventana Nuevo impuesto]

### Enlazar un impuesto con el valor oficial

La columna **Valor oficial** dice si cada impuesto está **✓ Enlazado** o **! Sin enlazar**.

- **Enlazado**: la tasa (y en las retenciones, sobre qué se calcula) sale del [valor fiscal](#valores-fiscales) vigente en la fecha de cada factura. Si la DGII cambia la tasa, se actualiza sola, y las facturas viejas no cambian.
- **Sin enlazar**: usa la tasa que escribiste. Si la ley cambia, **no se actualiza sola**.

Pulsa **Enlazar**, revisa la opción marcada como **Sugerido** (o elige la que corresponde si hay varias) y pulsa **Enlazar**. Un impuesto enlazado no deja editar su tasa: para usar otra, primero **Desenlazar**.

Las notas de crédito y débito usan la tasa de la factura que modifican, aunque la ley haya cambiado después.

## Comprobantes fiscales (NCF)

Menú **Configuración › Comprobantes fiscales (NCF)**. La DGII te autoriza un rango de números por cada tipo de comprobante (B01, B02, etc.). Aquí lo registras.

1. Pulsa **Nueva secuencia**.
2. Elige el **Tipo de comprobante**.
3. Escribe **Desde el número** y **Hasta el número** autorizados.
4. Si ya usaste alguno, escribe el **Último número ya usado**.
5. Escribe la **Fecha de vencimiento** de la autorización.
6. En **Avisar cuando queden**, pon cuántos números te quedan cuando quieres el aviso.
7. Guarda.

Cuando un rango se agota o vence, pulsa **Renovar** en esa fila y carga el nuevo. Con **Editar** solo se puede ampliar un rango, nunca reducirlo.

[CAPTURA: lista de secuencias NCF con Editar y Renovar]

## Cuentas automáticas

Menú **Configuración › Cuentas automáticas** (la pantalla se titula "Configuración contable"). Son las cuentas que el sistema usa solo al contabilizar.

1. Para cada grupo (**Ventas y cobros**, **Compras y pagos**, **Patrimonio y cierre de año**, **Diferencias cambiarias y redondeo**), elige la cuenta que corresponde. Debajo de cada una verás para qué se usa.
2. Si quieres que los asientos manuales los apruebe otra persona, marca **Los asientos manuales requieren aprobación**.
3. Pulsa **Guardar configuración**.

[CAPTURA: pantalla Configuración contable]

## Libros diarios

Menú **Configuración › Libros diarios**. Son los libros donde se agrupan los asientos (ventas, compras, banco, cierre...).

1. Si es una empresa nueva, pulsa **Crear diarios estándar**.
2. Para uno propio, pulsa **Nuevo diario** y llena **Código**, **Tipo** y **Nombre**.

## Numeración de facturas y pagos

Menú **Configuración › Numeración de facturas y pagos**. Define el prefijo y el contador del número interno de cada documento. No es el NCF.

1. Pulsa **Editar** en el documento que quieras cambiar.
2. Ajusta el **Prefijo**, los **Dígitos** y el **Próximo número**.
3. Guarda. El próximo número solo puede subir: no se reutilizan números.

## Clasificación de cuentas para reportes

Menú **Configuración › Clasificación de cuentas para reportes**. Define dónde aparece cada cuenta en el balance, el estado de resultados y el flujo de efectivo.

1. Pulsa **Clasificar automáticamente** para que el sistema proponga una clasificación.
2. Revisa la propuesta y pulsa **Aplicar clasificación**.
3. Usa **Buscar** para encontrar y ajustar cuentas una por una.

## Si algo sale mal

| Qué ves | Qué hacer |
|---|---|
| "No hay un valor vigente de …" | Falta un valor fiscal para esa fecha. Avisa a quien administra el sistema para que lo cargue. |
| "El sistema tiene valores fiscales desde el 01/01/2025" | La factura usa un impuesto enlazado con una fecha anterior. Usa un impuesto sin enlazar para documentos tan viejos. |
| "Este impuesto está enlazado a un valor oficial…" | Su tasa cambia sola. Desenlázalo si de verdad necesitas otra tasa. |
| "Falta configurar en Configuración contable" | Elige la cuenta que nombra el mensaje en Cuentas automáticas. |
| "No hay diario…" | Pulsa **Crear diarios estándar** en Libros diarios. |
| "No hay secuencia configurada" / "Se agotó el rango" | Carga o renueva la secuencia en Comprobantes fiscales (NCF). |
| "Configura la cuenta contable del impuesto" | Edita el impuesto y elige sus cuentas. |

## En mejora

Esta sección se amplía en próximas versiones: el asistente de arranque con catálogo dominicano y los datos de ejemplo llegan en la Fase 2.

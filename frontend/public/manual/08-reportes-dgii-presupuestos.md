# Reportes, DGII y presupuestos

*Actualizado: 2026-10-10 · Corresponde a: v0.2, Fase 1 (versión corta)*

Menú **Reportes**. Todo se calcula con los asientos ya contabilizados: un asiento pendiente de aprobación no aparece.

## En pocas palabras

**Si eres el dueño:** en **Estados financieros** ves cuánto ganaste (**Estado de resultados**) y qué tienes y qué debes (**Balance general**). En **Presupuestos** planeas cuánto esperas vender y gastar y lo comparas con lo real. Para los impuestos mensuales, tu contadora usa **DGII 606 · 607 · 608**.

**Si eres la contadora:** están el balance, el estado de resultados, flujo de efectivo, balanza de comprobación, mayor, libro diario, detalle por cuenta, auxiliar por tercero y razones financieras, todos exportables. Los formatos 606 (compras), 607 (ventas) y 608 (anulados) se validan antes de generar el TXT oficial.

## Estados financieros

Menú **Reportes › Estados financieros**.

1. Elige la pestaña: **Estado de resultados**, **Balance general**, **Flujo de efectivo**, **Balanza de comprobación**, **Mayor general**, **Libro diario**, **Detalle por cuenta**, **Auxiliar por tercero** o **Razones financieras**.
2. Elige las fechas. Según el reporte son **Corte al**, **Inicio del ejercicio** o **Desde** y **Hasta**. Los botones **Hoy**, **Este mes**, **Mes anterior**, **Este año**, **Año anterior** y **Todo el historial** lo hacen más rápido.
3. Lee el resultado en pantalla.
4. Para guardarlo, usa los botones de exportar (Excel o PDF) que aparecen junto al reporte.

[CAPTURA: Estado de resultados del mes]

Las **Razones financieras** agrupan indicadores de **Liquidez**, **Endeudamiento**, **Rentabilidad** y **Actividad**. Si ves **Cuentas sin categoría**, pídele a tu contadora que complete la [Clasificación de cuentas para reportes](/help/configuracion#clasificacion-de-cuentas-para-reportes).

## Revisión del mes

Menú **Reportes › Revisión del mes**. Antes de presentar a la DGII, elige el mes y pulsa **Revisar**. El sistema dice:

- Si los formatos **606, 607 y 608** tienen errores o avisos.
- Si el **ITBIS del 607** cuadra con lo que dice tu contabilidad (la cuenta de ITBIS por pagar), y lo mismo con el **ITBIS del 606** (ITBIS por adelantar) y las **retenciones** que hiciste a proveedores. Las notas de crédito se restan, así que no causan diferencias falsas.
- Si alguna diferencia se debe a **asientos manuales**: los muestra con su número para que los revises.
- Si **falta algún número de comprobante** (NCF) en tu secuencia: un número sin factura se reporta como anulado en el 608.
- Si importaste **facturas electrónicas sin verificar**.

Si usas la **misma cuenta** de ITBIS para ventas y compras, el cuadre se hace sobre el neto y verás un aviso: conviene separarlas. Cuando todo dice **Cuadra**, estás listo para declarar.

[CAPTURA: Revisión del mes con sus cuadres]

## DGII 606, 607 y 608

Menú **Reportes › DGII 606 · 607 · 608**. Son los formatos mensuales que se envían a la DGII: 606 de compras, 607 de ventas y 608 de comprobantes anulados.

1. Elige el **Período** (el mes). Puedes moverte con las flechas.
2. Elige la pestaña **606 · Compras**, **607 · Ventas** o **608 · Anulados**. Un número verde indica registros; uno rojo indica errores.
3. Si hay errores, la lista **Qué corregir** nombra cada documento. Pulsa su número, corrígelo y vuelve a cargar el período.
4. Los **Avisos** no bloquean el archivo, pero conviene revisarlos.
5. Cuando diga que no hay errores, pulsa **Descargar TXT oficial**.
6. Sube el archivo a la Oficina Virtual de la DGII.

[CAPTURA: pestaña 607 sin errores con el botón Descargar TXT oficial]

## Presupuestos

Menú **Reportes › Presupuestos**.

1. Pulsa **Nuevo presupuesto**, escribe **Nombre** y **Año**. Verás "Presupuesto creado. Agrega las cuentas y los importes."
2. Pulsa **Abrir** en su fila. En **Líneas del presupuesto**, agrega las cuentas y escribe el importe de cada mes. **Repetir** copia el primer importe a los 12 meses.
3. Guarda las líneas.
4. Cuando esté listo, pulsa **Aprobar**. Un presupuesto aprobado ya no se edita; con **Reabrir** vuelve a borrador y con **Archivar** se guarda.
5. En la pestaña **Presupuesto vs real** elige **Desde el mes** y **Hasta el mes**, y pulsa **Actualizar** para ver la comparación.

[CAPTURA: pestaña Presupuesto vs real]

## Si algo sale mal

| Qué ves | Qué hacer |
|---|---|
| Un reporte no muestra una factura reciente | Revisa que esté emitida y que su asiento esté contabilizado. |
| El 606 o 607 tiene errores | Corrige cada documento listado; suele faltar el RNC o el tipo de gasto o ingreso. |
| Descargar TXT oficial está apagado | Aún hay errores en el formato. |
| Libros descuadrados | Avisa a tu contadora. |

## En mejora

Esta sección se amplía en próximas versiones: el semáforo financiero con explicaciones para el dueño, la comparación con el año anterior y más ayuda para las razones financieras (Fase 3).

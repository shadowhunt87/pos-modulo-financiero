# Asientos, plan de cuentas y cierre

*Actualizado: 2026-10-10 · Corresponde a: v0.2, Fase 1 (versión corta)*

Un **asiento** es el registro contable de un movimiento: de dónde sale el valor y a dónde llega. El sistema crea asientos solo cuando emites facturas o registras cobros y pagos. Los manuales son para ajustes. Todo está en el menú **Contabilidad**.

## En pocas palabras

**Si eres el dueño:** casi nunca harás un asiento. Lo que sí te interesa: el indicador **Libros cuadrados** de la barra de arriba, y saber que cuando tu contadora **cierra un mes**, ese mes ya no admite cambios. Si ves que un asiento espera aprobación, avisa a quien aprueba.

**Si eres la contadora:** los asientos manuales pueden requerir aprobación de otra persona (se activa en Cuentas automáticas). Un asiento pendiente no tiene número ni afecta los reportes. Cerrar un período bloquea asientos y anulaciones con fecha dentro. El cierre del año traslada ingresos y gastos a utilidades retenidas con un asiento de cierre.

## Ver los asientos

Menú **Contabilidad › Asientos**.

1. Usa **Buscar**, **Estado**, **Tipo**, **Diario**, **Desde** y **Hasta** para filtrar.
2. Pulsa un asiento para abrir su detalle.

[CAPTURA: lista de asientos con filtros]

## Hacer un asiento manual

1. Pulsa **Nuevo asiento**.
2. Elige la **Fecha** y escribe la **Descripción**. La **Referencia** es opcional.
3. En **Líneas**, elige la **Cuenta** y escribe el **Débito** o el **Crédito** (uno solo por línea). Pulsa **Agregar línea** para más.
4. Abajo verás **Débitos**, **Créditos** y **Diferencia**. Debe quedar en cero. El botón **Cuadrar** de una línea pone lo que falta.
5. Pulsa **Guardar asiento**. Verás "Asiento contabilizado." o "Asiento guardado; queda pendiente de aprobación."

[CAPTURA: asiento nuevo con líneas cuadradas]

## Aprobar, rechazar, corregir o anular

En el detalle de un asiento, según su estado y tu rol, aparecen estos botones:

- **Aprobar**: lo contabiliza y le da número. Quien lo creó no lo puede aprobar.
- **Rechazar**: lo devuelve con un motivo.
- **Corregir**: edita un asiento pendiente o rechazado. Al guardar vuelve a pendiente.
- **Anular**: revierte un asiento contabilizado. Pide un motivo. No se puede anular uno conciliado con el banco ni el de cierre de año.

## Plan de cuentas

Menú **Contabilidad › Plan de cuentas**: la lista jerárquica de cuentas.

1. Pulsa **Nueva cuenta**.
2. Llena **Código**, **Nombre**, **Tipo**, y la **Cuenta padre** si es una subcuenta.
3. Elige la **Categoría** (sirve para los reportes) y guarda.

Solo las cuentas sin subcuentas admiten movimientos.

### Importar, exportar o cargar el catálogo estándar RD

Si tu empresa aún no tiene cuentas, pulsa **Cargar catálogo estándar RD**: trae 198 cuentas listas para usar. Si ya llevas tu contabilidad en Excel, pulsa **Importar desde Excel**, descarga la plantilla, llénala y súbela (Excel o CSV, hasta 2 MB). En los dos casos ves primero una vista previa de lo que se creará y actualizará, y no se guarda nada hasta que pulses **Importar**. Si el archivo tiene errores, se muestran primero con su explicación y debes corregirlos y subirlo de nuevo. Importar nunca borra cuentas: solo agrega las nuevas y actualiza nombres. **Exportar** baja tu plan de cuentas a Excel o CSV (lo puede hacer cualquier usuario). Solo administradores y contadoras pueden importar. Al terminar, revisa la **Clasificación de cuentas** para que los reportes las ubiquen bien.

## Saldos iniciales

Menú **Contabilidad › Saldos iniciales** (solo Administrador y Contador). Es el punto de partida de tus libros.

1. Elige la **Fecha de los saldos**.
2. En **Saldos por cuenta**, pulsa **Agregar línea** por cada cuenta. Activos al débito; pasivos y patrimonio al crédito. En cuentas por cobrar o pagar indica el cliente o proveedor.
3. Cuadra débitos y créditos y guarda. Verás "Saldos iniciales guardados."

Solo se puede cargar una vez. Para rehacerlo, hay que anular el asiento de apertura.

## Períodos fiscales: cerrar un mes

Menú **Contabilidad › Períodos fiscales**.

1. Revisa que no queden asientos pendientes de aprobación en el mes.
2. En la fila del período, pulsa **Cerrar**.
3. Si te equivocaste, pulsa **Reabrir** (no se puede si el año ya está cerrado).

Para crear períodos sueltos usa **Nuevo período**.

## Años fiscales y cierre de año

Menú **Contabilidad › Años fiscales y cierre**.

1. Para empezar un año: **Nuevo año fiscal**, con **Nombre**, **Desde**, **Hasta** y marcado **Generar los períodos mensuales**. Pulsa **Crear año**.
2. Para terminarlo: pulsa **Vista previa de cierre** en su fila. Verás ingresos, gastos, ganancia o pérdida y el asiento que se generará.
3. Si aparece "Antes de cerrar hay que resolver", corrige eso primero.
4. Con "Todo listo", un Administrador pulsa **Cerrar año fiscal**.
5. Para reabrir (solo Administrador), pulsa **Reabrir** en el año cerrado.

[CAPTURA: vista previa del cierre del año]

## Si algo sale mal

| Qué ves | Qué hacer |
|---|---|
| "El asiento no cuadra" | Ajusta hasta que la Diferencia sea cero. |
| "El período fiscal … está cerrado" | Usa otra fecha o reabre el período. |
| "No puedes aprobar un asiento que creaste tú" | Que lo apruebe otra persona. |
| "Hay … asiento(s) pendientes de aprobación" | Apruébalos o recházalos antes de cerrar el mes. |
| "Falta configurar la cuenta de Utilidades acumuladas" | Configúrala en Cuentas automáticas antes de cerrar el año. |

## En mejora

Esta sección se amplía en próximas versiones: el cierre de mes guiado paso a paso (Fase 2) y más detalle de cada pantalla.

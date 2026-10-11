# Bancos, cajas y conciliación

*Actualizado: 2026-10-10 · Corresponde a: v0.2, Fase 1 (versión corta)*

Aquí registras dónde está tu dinero (cuentas del banco y cajas) y compruebas que lo que dice tu banco coincide con tus libros. Menú **Bancos y caja**.

## En pocas palabras

**Si eres el dueño:** crea una vez tus cuentas del banco y tus cajas. Son las que eliges al registrar un cobro o un pago. La **conciliación** es comparar el estado de cuenta del banco con lo que tienes registrado; normalmente la hace tu contadora cada mes.

**Si eres la contadora:** cada cuenta o caja necesita su cuenta contable de activo. Puedes importar el extracto en CSV, categorizar movimientos con reglas, hacer transferencias entre cuentas y conciliar a una fecha de corte. Un asiento conciliado no se puede anular.

## Crear una cuenta bancaria o una caja

Menú **Bancos y caja › Bancos y cajas**. Tiene cuatro pestañas: **Cuentas bancarias**, **Cajas**, **Reglas bancarias** y **Transferencias**.

1. En **Cuentas bancarias**, pulsa **Nueva cuenta bancaria**.
2. Escribe el **Banco**, el **Número de cuenta**, el **Tipo** y la **Moneda**.
3. Elige la **Cuenta contable (activo)**.
4. Guarda. Verás "Cuenta bancaria creada."

Para una caja: pestaña **Cajas**, **Nueva caja**, con **Nombre**, **Moneda**, **Cuenta contable (activo)** y **Responsable**.

[CAPTURA: pestaña Cuentas bancarias con la lista]

## Mover dinero entre cuentas

1. Abre la pestaña **Transferencias** y pulsa **Nueva transferencia**.
2. Elige **Origen** y **Destino**, el **Monto** y la **Fecha**.
3. Pulsa **Transferir**. Verás "Transferencia registrada."

## Movimientos del banco

En **Cuentas bancarias**, pulsa **Movimientos** en la cuenta que quieras (pantalla "Cuenta bancaria").

1. Para cargar el extracto, pulsa **Importar extracto**, elige el archivo **CSV**, ajusta **Separador**, **Formato de fecha** y **Separador decimal**, indica qué columna es cada dato y pulsa **Importar**.
2. Para un movimiento suelto, pulsa **Agregar movimiento**.
3. En cada movimiento pendiente, pulsa **Categorizar** para elegir la cuenta contraria y crear el asiento, o **Ignorar** si no aplica.
4. **Aplicar reglas** categoriza solo los movimientos que coincidan con tus **Reglas bancarias** (texto a buscar, prioridad y cuenta).

[CAPTURA: movimientos de una cuenta con el botón Importar extracto]

## Conciliar el banco

Menú **Bancos y caja › Conciliación bancaria**.

1. Pulsa **Nueva conciliación**.
2. Elige la **Cuenta bancaria**, la **Fecha de corte** y el **Saldo final del extracto** (el que dice tu banco). Pulsa **Crear y conciliar**.
3. En la conciliación pulsa **Enlazar automáticamente** para que el sistema empareje los movimientos con tus asientos.
4. Revisa los que quedaron: **Enlazar** con la sugerencia, **Enlazar a mano**, **Categorizar** o **Ignorar**.
5. Mira que el aviso diga **Cuadrado** (el extracto menos el saldo esperado es cero).
6. Pulsa **Completar conciliación**.

Si te equivocas: **Deshacer enlace** en un movimiento, o **Reabrir** la conciliación completada.

[CAPTURA: conciliación cuadrada con los movimientos enlazados]

## Si algo sale mal

| Qué ves | Qué hacer |
|---|---|
| No puedo elegir mi cuenta en un cobro | Está desactivada, o no existe. Revísala en Bancos y cajas. |
| "La cuenta de banco/caja no tiene cuenta contable asociada" | Edita la cuenta y elige su cuenta contable. |
| El botón **Completar conciliación** está apagado | Aún hay diferencia. Enlaza, categoriza o ignora lo que falte. |
| No puedo anular un asiento | Si está conciliado, primero deshaz el enlace. |

## En mejora

Esta sección se amplía en próximas versiones: una pantalla de conciliación con dos columnas, importación de extractos en PDF y más ayuda para las reglas bancarias.

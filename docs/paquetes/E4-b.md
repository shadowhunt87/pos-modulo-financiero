# E4-b — Pantallas guiadas: Contabilidad

**Carril:** E · **Nivel:** N3 con revisión N2 · **Tamaño:** L · **Ola:** 0 · **Rama:** `wp/E4b-contabilidad` · **Asignado (provisional):** IA-local
**Espera a:** el componente **`app-empty-state`** y el icono de `StatusBadge`, que crea **E4-a (paso 0)**. Hasta que ese PR no esté fusionado, no lo escribas tú: parte de la rama de E4-a si Carlos te lo indica, o empieza por errores y ayudas de campo (no dependen de él).
**Ficha del 2026-10-12** · PLAN-v0.2 v1.1 tareas 4.1 a 4.3 (§9.1, §17).

## 2. Objetivo
Que las pantallas del menú **Contabilidad** (asientos, plan de cuentas, períodos, años fiscales y saldos iniciales) expliquen cuando están vacías, den errores con solución, expliquen los términos difíciles (débito, crédito, cuenta padre, cierre) y tengan un solo botón principal. No cambia la lógica ni los datos. Toca P7.

## 3. Lee antes
- Base: `CLAUDE.md`; `AGENTS.md` (si existe); `docs/PAQUETES-DE-TRABAJO.md` §1; `docs/GUIA-PRODUCTO.md` P7 y §6; `docs/PLAN-v0.2.md` §9.1, §9.2, §9.6, §17.
- **Ejemplos hechos (Fase 1) para imitar:** `frontend/src/app/shared/ui/error-notice.ts`, `field-help.ts`; `features/sales/invoice-form.html` (uso de `app-field-help` y de `app-error-notice`); `features/catalog/partner-dialog.ts` (`formError = signal<unknown>('')`, `this.formError.set(e)`); `features/catalog/import-accounts-dialog.ts`; **y lo que deje E4-a:** `features/sales/invoices.ts` (estado vacío con y sin filtros).
- Manual existente: `public/manual/06-asientos-y-cierre.md` (anclas que puedes enlazar desde `ayuda.json`).

## 4. Alcance (verificado; no toques nada más)
| Archivo (en `frontend/src/app/features/`) | Qué hacer |
|---|---|
| `ledger/entries.ts` | Estado vacío (~62): «Todavía no hay asientos… → Nuevo asiento» y variante con filtros |
| `ledger/entry-form.ts` | `formError` (~79) → `app-error-notice`; «?» en **Débito**, **Crédito**, **Referencia**, **Cuadrar**; un solo botón principal |
| `ledger/entry-detail.ts` | «Tercero» (~75) → «Cliente / proveedor»; textos de estado ya tienen aviso: no cambiar lógica |
| `ledger/fiscal-periods.ts` | Vacío (~66, ya existe: mejorar texto y botón); `formError` (~81) → `app-error-notice`; «?» en **Cerrar** y **Reabrir** |
| `ledger/fiscal-years.html` y `.ts` | `error` (~16), `formError` (~58) y `previewError` (~68) → `app-error-notice`; «?» en **Vista previa de cierre** y **Generar los períodos mensuales**; el botón principal es «Nuevo año fiscal» |
| `ledger/opening-balances.ts` | «Tercero» → «Cliente / proveedor» (~41, ~77, ~82 `aria-label`, ~144); `formError` (~102) → `app-error-notice`; «?» en **Saldos por cuenta** y **Fecha de los saldos** |
| `catalog/accounts.ts` | Ya tiene un estado vacío grande (~40); falta el vacío con filtros (~91); `formError` (~125) → `app-error-notice`; «?» en **Tipo**, **Categoría**, **Cuenta padre**; hoy hay 3 `btn-primary` (~34, ~45, ~129): uno por vista |
**Ya hecho (no lo rehagas):** `catalog/import-accounts-dialog.ts`.
**Calientes:** `public/manual/ayuda.json` (agrega **al final** de `campos` claves con prefijo `contabilidad.`; no toques lo demás). No edites `ledger-shared.ts` salvo un texto.

## 5. No hagas
- No cambies lógica, señales, rutas, ids ni llamadas a la API. No toques `journals`, `account-classification` ni `accounting-settings` (son E4-d) ni nada fiscal.
- No hagas el botón «Corregir/Reversar» ni cambies el flujo de anulación (eso es N1).
- No escribas el manual `.md` (D1). No renombres claves de `ayuda.json`. No agregues librerías.

## 6. Pasos sugeridos
1. Confirma que existen `shared/ui/empty-state.ts` y el icono del badge (E4-a). Si no, haz primero los puntos 2–4.
2. Una pantalla por vez, con un commit cada una: (a) estado vacío; (b) cada `<div class="notice neg">{{ xError() }}</div>` de guardar/acción → `<app-error-notice style="display:block;margin-top:14px" [error]="xError()" />`, señal `signal<unknown>('')`, `catch` guarda `e`; importa `ErrorNotice`/`FieldHelp` por nombre desde `../../shared/ui`.
3. «?» con `<app-field-help key="contabilidad.debito" text="Lo que entra o aumenta… en palabras simples" />` y su entrada en `ayuda.json` (`campos`); si pones `seccion/ancla`, que existan (p. ej. ancla `hacer-un-asiento-manual` en la sección `asientos-y-cierre`).
4. Un solo `btn-primary` por vista. 5. 375 px y teclado (Tab, Enter guarda, Esc cierra).

## 7. Criterios de aceptación
- Con una empresa sin datos, **Asientos** y **Plan de cuentas con filtros vacíos** muestran explicación + botón; **Períodos** y **Años fiscales** explican qué hacer primero.
- Un asiento descuadrado muestra «No se pudo guardar», «El asiento no cuadra…», «Cómo arreglarlo» y un botón a Asientos.
- «Débito» y «Crédito» tienen un «?» que abre una explicación en lenguaje de dueño (no solo de contador).
- La palabra «Tercero» desapareció de los textos visibles de estas pantallas.
- `npx ng build`, `npx ng test` y `node scripts/verificar-ayuda.mjs` sin errores.

## 8. Cómo probar
```
cd frontend && npm ci
npx ng build
npx ng test            # si se queda esperando cambios: npx ng test --watch=false
node scripts/verificar-ayuda.mjs
```
Backend para verlo: tu base propia (ficha E1a §8) y `npm start` en `frontend/`.

## 9. Entregables y PR
Un PR con **Qué hice** (pantalla por pantalla), **Archivos tocados** (lista exacta), **Decisiones**, **Cómo probar** (pasos para ver cada cambio), **Qué falta**, y las `[CAPTURA: …]` sugeridas. Sin `.env` ni datos reales.

## 10. Riesgos y trampas
- `entry-form.ts` es largo y delicado (cuadre en vivo): toca solo el mensaje de error y las ayudas.
- El botón «Corregir» de `entry-detail.ts` edita borradores; N1 lo cambiará: no lo renombres.
- Un `@empty` en `<tbody>` necesita `<tr><td colspan="N">` con el N correcto.
- Los textos deben entenderlos dueños que no son contadores: explica «débito» y «crédito» sin jerga.
- Si algo no cuadra con el plan, detente y pregunta; un modelo local pequeño debe hacer un archivo por vez y revisar `git diff` antes de seguir.

# E4-c — Pantallas guiadas: Bancos

**Carril:** E · **Nivel:** N3 con revisión N2 · **Tamaño:** L · **Ola:** 0 · **Rama:** `wp/E4c-bancos` · **Asignado (provisional):** IA-local
**Espera a:** el componente **`app-empty-state`** y el icono de `StatusBadge`, que crea **E4-a (paso 0)**. Mientras no esté fusionado, empieza por errores, ayudas de campo y botón único (no dependen de él).
**Ficha del 2026-10-12** · PLAN-v0.2 v1.1 tareas 4.1 a 4.3 (§9.1, §17).

## 2. Objetivo
Que las pantallas del menú **Bancos y caja** (cuentas bancarias y cajas, movimientos, transferencias, reglas y conciliación) expliquen cuando están vacías, den errores con solución, expliquen los términos difíciles (partidas en tránsito, saldo según el banco, regla) y tengan un solo botón principal. La conciliación es el corazón del producto (P5). No cambia la lógica ni los datos.

## 3. Lee antes
- Base: `CLAUDE.md`; `AGENTS.md` (si existe); `docs/PAQUETES-DE-TRABAJO.md` §1; `docs/GUIA-PRODUCTO.md` P5, P7 y §6; `docs/PLAN-v0.2.md` §9.1, §9.2, §9.6, §17.
- **Ejemplos hechos (Fase 1) para imitar:** `frontend/src/app/shared/ui/error-notice.ts`, `field-help.ts`; `features/sales/invoice-form.html` (uso de ambos); `features/catalog/partner-dialog.ts` (`formError = signal<unknown>('')`, `this.formError.set(e)`); **lo de E4-a:** `features/sales/invoices.ts` (estado vacío con y sin filtros).
- Manual existente: `public/manual/07-bancos-y-conciliacion.md` (anclas: `crear-una-cuenta-bancaria-o-una-caja`, `movimientos-del-banco`, `conciliar-el-banco`).

## 4. Alcance (verificado; no toques nada más)
| Archivo (en `frontend/src/app/features/treasury/`) | Qué hacer |
|---|---|
| `bank-accounts-tab.ts` | Vacío (~55): ya tiene texto; usar `app-empty-state` con botón «Nueva cuenta bancaria» (solo `canAdmin`); `formError` (~92) → `app-error-notice`; «?» en **Cuenta contable que representa al banco** y **Tipo de cuenta** |
| `cash-registers-tab.ts` | Vacío (~50), `formError` (~76) → `app-error-notice`; «?» en **Cuenta contable de la caja** |
| `transfers-tab.ts` | Vacío (~46), `formError` (~70) → `app-error-notice` |
| `bank-rules-tab.ts` | Vacío (~51: explica qué es una regla), `formError` (~77) → `app-error-notice`; «?» en **Texto que debe contener** y **Cuenta donde se registra** |
| `bank-account-detail.html` y `.ts` | Vacío de movimientos (~81) con y sin filtros; `error` (~52), `addError` (~151), `catError` (~176) → `app-error-notice`; botón principal único = **Importar extracto** (~17); los otros primarios están dentro de ventanas emergentes |
| `reconciliations.ts` | Vacío (~61) con botón «Nueva conciliación», `formError` (~82) → `app-error-notice`; «?» en **Saldo que muestra el banco** y **Fecha del extracto** |
| `reconciliation-detail.html` y `.ts` | `manualError` (~199) y `catError` (~222) → `app-error-notice`; «?» en **partidas en tránsito**, **depósitos en tránsito** y **pagos pendientes** (~52, ~126, ~139); botón principal único = **Completar conciliación** (~18) |
| `bank-accounts.ts` | Solo si es la pantalla que contiene las pestañas: título/propósito; no cambies la lógica de pestañas |
**Fuera de este paquete:** `types.ts` (no es pantalla).
**Calientes:** `public/manual/ayuda.json` (agrega **al final** de `campos` claves con prefijo `bancos.`; no toques lo demás).

## 5. No hagas
- No cambies lógica, señales, ids, rutas ni llamadas a la API (importar extractos, enlazar, completar conciliación). No toques `treasury.service` ni nada del backend.
- No toques Contabilidad, Reportes ni nada fiscal. No agregues el 0,20 % ni reglas nuevas (eso es v1.0).
- No escribas el manual `.md` (D1). No renombres claves de `ayuda.json`. No agregues librerías.

## 6. Pasos sugeridos
1. Verifica que existan `shared/ui/empty-state.ts` y el icono del badge (E4-a). Si no, haz primero los puntos de errores y ayudas.
2. Una pantalla por vez, con un commit cada una: (a) estado vacío en el `@empty` respetando el `colspan`; (b) cada `<div class="notice neg">{{ xError() }}</div>` de guardar/acción → `<app-error-notice style="display:block;margin-top:14px" [error]="xError()" />` (señal `signal<unknown>('')`, `catch` guarda `e`; importa `ErrorNotice` y `FieldHelp` por nombre desde `../../shared/ui`).
3. «?» con `<app-field-help key="bancos.saldoBanco" text="…" />` y su entrada en `ayuda.json` (`campos`); `seccion/ancla` solo si existen en `07-bancos-y-conciliacion.md`.
4. Un solo botón principal por vista. 5. Revisa 375 px y teclado.

## 7. Criterios de aceptación
- Con la empresa sin bancos: **Bancos y cajas** explica qué es una cuenta bancaria o una caja y ofrece crear la primera; **Reglas** explica para qué sirven; **Conciliación** dice que primero hace falta una cuenta bancaria y un extracto.
- Importar un archivo inválido muestra «No se pudo guardar», el motivo en español y «Cómo arreglarlo».
- En el detalle de la conciliación hay **un** botón principal visible («Completar conciliación»).
- «Saldo que muestra el banco» tiene un «?» comprensible para un dueño.
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
Un PR con **Qué hice** (pantalla por pantalla), **Archivos tocados** (lista exacta), **Decisiones**, **Cómo probar**, **Qué falta**, `[CAPTURA: …]` sugeridas. Sin `.env` ni datos reales.

## 10. Riesgos y trampas
- Las pestañas de `bank-accounts` son componentes separados que comparten la misma página: cuida que cada una tenga su propio vacío y error.
- `reconciliation-detail.html` es largo; ya tiene varios `@empty`: mejora el texto, no reescribas las tablas.
- Cuidado con modales: un `btn-primary` dentro de `<app-modal>` es válido; el criterio de «uno solo» aplica a la vista, no a la ventana emergente.
- Montos a la derecha y con `money`; no uses `Number()` para dinero.
- Un modelo local pequeño debe trabajar un archivo por vez y revisar `git diff` antes de seguir.

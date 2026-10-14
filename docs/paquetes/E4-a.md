# E4-a — Pantallas guiadas: Ventas (y las piezas compartidas)

**Carril:** E · **Nivel:** N3 con revisión N2 · **Tamaño:** L · **Ola:** 0 · **Rama:** `wp/E4a-ventas` · **Asignado (provisional):** IA-local
**Espera a:** nada (el patrón ya existe desde la Fase 1). **Este paquete crea las dos piezas compartidas** (`app-empty-state` y el icono de `StatusBadge`) que usan E4-b, E4-c y E4-d. Haz **primero** solo eso (paso 0), abre ese PR corto y avisa a Carlos para fusionarlo antes que los demás (excepción autorizada a «un paquete = un PR»).
**Ficha del 2026-10-12** · PLAN-v0.2 v1.1 tareas 4.1 a 4.3 (§9.1, §9.2, §17).

## 2. Objetivo
Que las pantallas de **Ventas y compras** cumplan el checklist de la Guía (GUIA-PRODUCTO §6): cuando no hay datos explican y ofrecen crear el primero; los errores dicen cómo arreglarlo con enlace; los campos difíciles tienen un «?»; hay un solo botón principal; y «Tercero» pasa a «cliente / proveedor». No cambia la lógica ni los datos. Toca P7, P6.

## 3. Lee antes
- Base: `CLAUDE.md`; `AGENTS.md` (si existe); `docs/PAQUETES-DE-TRABAJO.md` §1; `docs/GUIA-PRODUCTO.md` P7 y **§6 (checklist)**; `docs/PLAN-v0.2.md` §9.1 (tabla de hallazgos), §9.2, §9.6, §7 C2 (textos), §17.
- **Ejemplos YA hechos que debes imitar (Fase 1):** `frontend/src/app/shared/ui/error-notice.ts` y `field-help.ts`; `features/sales/invoice-form.html` (`<app-field-help key="factura.tipoNcf" text="…" />`, línea ~131 `<app-error-notice style="display:block;margin-top:14px" [error]="formError()" />`); `features/catalog/partner-dialog.ts` (guarda el error crudo: `formError = signal<unknown>('')`, `this.formError.set(e)`); `features/feedback/feedback-badge.ts` + `FEEDBACK_STATUS_LOOK` en `shared/labels.ts` (icono + color + texto); `public/manual/ayuda.json` (bloques `campos` y `errores`).

## 4. Alcance (verificado; no toques nada más)
**Piezas compartidas (paso 0):** crear `shared/ui/empty-state.ts` (selector `app-empty-state`; entradas `title`, `text`, `actionLabel`, `actionLink`, `canAct` (por defecto verdadero), `filtered`; salida `clear` que muestra «Quitar filtros»; clases de `styles.css` como `.empty`; sin colores nuevos) y exportarlo con **1 línea** en `shared/ui/index.ts` (**caliente**; no lo agregues al arreglo `UI`: se importa por nombre, como `ErrorNotice`). Modificar `shared/ui/badge.ts` para mostrar **icono + color + texto** según el tono (`pos ✓`, `neg ✕`, `warn !`, `info i`, sin tono `•`; el icono con `aria-hidden="true"`).
**Pantallas de este paquete**
| Archivo (en `frontend/src/app/features/`) | Qué hacer |
|---|---|
| `sales/invoices.ts` | Estado vacío («Todavía no hay facturas… → Nueva factura») y variante con filtros; «Tercero» → «Cliente / proveedor» (líneas ~36–37 y ~47) |
| `sales/invoice-detail.html` y `.ts` | `actionError` (~167, ~188) → `app-error-notice`; «Tercero» (html ~52 y el aviso visible del `.ts` ~111 «de este tercero»; el comentario ~104 no se toca) |
| `sales/payments.ts` | Estado vacío + filtros; «Tercero» (~36–37, ~46) |
| `sales/payment-detail.ts` | `allocError` (~104) → `app-error-notice`; «Tercero» (~55, ~97) |
| `sales/receivables.ts` | Vacío de la antigüedad (~82) y de la columna «Tercero» (~70, ~131); errores (`creditError` ~157) → `app-error-notice`; **dos botones `btn-primary`** (~56 y ~103): deja uno solo |
| `catalog/partners.ts` | Estado vacío («Aún no tienes clientes ni proveedores → Nuevo cliente / proveedor») y con filtros |
**Ya hechos en la Fase 1 (no los rehagas):** `sales/invoice-form.*`, `sales/payment-form.ts`, `catalog/partner-dialog.ts`.
**Calientes:** `public/manual/ayuda.json` (agrega **al final** de `campos` claves con prefijo `ventas.` para los «?» nuevos; no toques lo demás), `shared/labels.ts` solo si necesitas un texto.

## 5. No hagas
- No cambies la lógica, los nombres de señales, ids, rutas, selectores ni llamadas a la API. Solo textos, plantillas y los componentes de arriba.
- No toques `dashboard`, `tax-rates`, `ncf`, `dgii`, `company` (son E4-e) ni otras áreas. No agregues librerías ni estilos globales.
- No renombres claves existentes de `ayuda.json`. No escribas el manual (`.md`): lo hace D1.
- No cambies el texto de un error del servidor; explícalo con «Cómo arreglarlo» (`ayuda.json` → `errores` lo mantiene D1).

## 6. Pasos sugeridos
0. Crea `empty-state.ts` y el icono del badge; añade un `empty-state.spec.ts` simple; `ng build`; abre ese PR corto.
1. Por pantalla, **una a la vez** (haz commit después de cada una): (a) estado vacío en el `@empty`; (b) cada `<div class="notice neg">{{ xError() }}</div>` de **guardar/acción** pasa a `<app-error-notice style="display:block;margin-top:14px" [error]="xError()" />` (cambia la señal a `signal<unknown>('')` y en el `catch` guarda `e`, no el texto) e importa `ErrorNotice`; (c) «?» con `<app-field-help key="ventas.xxx" text="…" />` en los términos difíciles; (d) un solo `btn-primary` visible; (e) «Tercero» → «cliente / proveedor» solo en textos visibles.
2. Los errores de **carga de una lista** pueden quedar como están.
3. Revisa a 375 px (sin scroll horizontal fuera de la tabla) y con teclado (Tab, Enter, Esc).

## 7. Criterios de aceptación
- Las 6 pantallas de la tabla muestran, con la base vacía, un estado vacío con explicación **y botón** (solo ADMIN/ACCOUNTANT ven el botón de crear); con filtros activos aparece «No hay … con esos filtros» + «Quitar filtros».
- Un error provocado (p. ej. cobro mayor que el saldo) se ve con «No se pudo guardar», el mensaje en español, «Cómo arreglarlo» y un botón.
- Ninguna vista muestra más de un `btn-primary` fuera de ventanas emergentes.
- La palabra «Tercero» ya no aparece en textos visibles de estas pantallas.
- Los estados de factura y pago (`app-status`) muestran icono + color + texto.
- `npx ng build`, `npx ng test` y `node scripts/verificar-ayuda.mjs` sin errores.

## 8. Cómo probar
```
cd frontend && npm ci
npx ng build
npx ng test            # si se queda esperando cambios: npx ng test --watch=false
node scripts/verificar-ayuda.mjs
```
Para verlo: backend con tu base propia (cualquier ficha de backend, p. ej. E1a §8) y `npm start` en `frontend/`.

## 9. Entregables y PR
Dos PR: (0) piezas compartidas; (1) las 6 pantallas. Cada PR en español con **Qué hice**, **Archivos tocados** (lista exacta), **Decisiones**, **Cómo probar** (pantalla por pantalla), **Qué falta**, y `[CAPTURA: …]` sugeridas. Sin `.env`, claves ni datos reales.

## 10. Riesgos y trampas
- Un `@empty` dentro de `<tbody>` solo funciona con `<tr><td colspan="N">`: respeta el número de columnas de cada tabla.
- `ErrorNotice` y `FieldHelp` **no** están en el arreglo `UI`: impórtalos por nombre.
- Si cambias una señal de `string` a `unknown`, revisa toda su plantilla.
- `StatusBadge` se usa en casi todas las pantallas: el cambio de icono debe verse bien en todas y no romper pruebas.
- El estado vacío «con filtros» necesita saber si hay filtros activos; añade una señal calculada, sin cambiar cómo se cargan los datos.
- El texto de ayuda de `app-field-help` va primero en `ayuda.json` (`key`) y, si falta, usa `text`; si usas `seccion/ancla` deben existir en el manual (`verificar-ayuda` lo comprueba).
- Un modelo local pequeño se equivoca en archivos largos: trabaja con un archivo por vez y revisa `git diff` antes de seguir.

## 11. Cómo copiar las piezas compartidas (resumen para IA pequeñas)
1. `app-empty-state` (`shared/ui/empty-state.ts`): importa por nombre `import { EmptyState } from '../../shared/ui';` y agrégalo a `imports` (no está en `UI`).
2. Dentro de una tabla va en `<tr><td colspan="N">` (N = columnas), en el `@empty`, con `@if (!loading() && !error())`.
3. Entradas: `title`, `text`, `actionLabel`, `actionLink` (ruta), `canAct` (permiso; por defecto verdadero), `filtered`.
4. Si el botón abre una ventana en vez de una ruta, omite `actionLink` y usa `(action)="openNew()"`.
5. Con filtros activos pon `[filtered]="hasFilters()"` y `(clear)="clearFilters()"`: muestra «Quitar filtros» en lugar del botón. `hasFilters` es una señal que se calcula en `load()`; `clearFilters` reinicia los filtros (en filtros sin formulario, `resetFilterControls(bar)` de `empty-state.ts` limpia los campos).
6. Ejemplo: `<app-empty-state [filtered]="hasFilters()" (clear)="clearFilters(bar)" [title]="hasFilters() ? 'No hay facturas con esos filtros' : 'Todavía no hay facturas'" text="Crea la primera para empezar." actionLabel="Nueva factura" actionLink="/invoices/new" [canAct]="canEdit" />`
7. Ejemplos reales: `features/sales/invoices.ts` (enlace), `features/catalog/partners.ts` (ventana).
8. `StatusBadge` (`<app-status [value]="x.status" [map]="MAPA" />`) ya muestra icono + color + texto sin cambiar nada en tu pantalla: ✓ verde, ✕ rojo, ! ámbar, i azul, • sin tono (icono con `aria-hidden`).
9. No uses `<span class="badge">` suelto para estados: cámbialo por `app-status` y, si el estado no tiene tono, añádelo en `tone()` de `shared/labels.ts`.
10. Prueba: `empty-state.spec.ts` muestra cómo probar con `TestBed` y `provideRouter([])`.

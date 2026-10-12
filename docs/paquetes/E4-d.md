# E4-d — Pantallas guiadas: Reportes y Configuración (sin impuestos ni NCF)

**Carril:** E · **Nivel:** N3 con revisión N2 · **Tamaño:** L · **Ola:** 0 · **Rama:** `wp/E4d-reportes-config` · **Asignado (provisional):** IA-local
**Espera a:** el componente **`app-empty-state`** y el icono de `StatusBadge`, que crea **E4-a (paso 0)**. Mientras no esté fusionado, empieza por errores y ayudas de campo.
**Ficha del 2026-10-12** · PLAN-v0.2 v1.1 tareas 4.1 a 4.3 (§9.1, §17).

## 2. Objetivo
Que las pantallas de **Reportes** (estados financieros, presupuestos) y de **Configuración** (usuarios, mi perfil, diarios, numeración, clasificación de cuentas, cuentas automáticas) expliquen cuando están vacías, den errores con solución, expliquen los términos difíciles y tengan un solo botón principal. No cambia la lógica ni los datos. Quedan **fuera** Impuestos, NCF, DGII, Panel y Empresa (son fiscales: E4-e).

## 3. Lee antes
- Base: `CLAUDE.md`; `AGENTS.md` (si existe); `docs/PAQUETES-DE-TRABAJO.md` §1 y §4 («Pantallas fiscales»); `docs/GUIA-PRODUCTO.md` P7 y §6; `docs/PLAN-v0.2.md` §9.1, §9.2, §9.6, §7 C2, §17.
- **Ejemplos hechos (Fase 1):** `frontend/src/app/shared/ui/error-notice.ts`, `field-help.ts`; `features/sales/invoice-form.html`; `features/catalog/partner-dialog.ts` (`formError = signal<unknown>('')`, `this.formError.set(e)`); **lo de E4-a:** `features/sales/invoices.ts` (estado vacío).
- Manual: `public/manual/02-configuracion.md` (anclas: `cuentas-automaticas`, `libros-diarios`, `numeracion-de-facturas-y-pagos`, `clasificacion-de-cuentas-para-reportes`), `08-reportes-dgii-presupuestos.md`, `09-usuarios-y-permisos.md`.

## 4. Alcance (verificado; no toques nada más)
| Archivo (en `frontend/src/app/features/`) | Qué hacer |
|---|---|
| `reporting/reports.ts` y `reports.html` | «Tercero» → «Cliente / proveedor» (html ~24–25, ~231, ~262, ~266; `reports.ts` ~26 «Auxiliar por tercero»); «?» en **Razón corriente**, **Prueba ácida**, **Endeudamiento** si no los tienen (mira qué ya existe); errores de generar → `app-error-notice` si es una acción |
| `reporting/budgets.ts` | Vacío (~55, ya existe: pasar a `app-empty-state` con «Nuevo presupuesto»); `formError` (~72) → `app-error-notice` |
| `reporting/budget-detail.html` y `.ts` | `saveError` (~42), `vsError` (~99), `metaError` (~169) → `app-error-notice`; **dos botones principales** (~14 «Aprobar» y ~37 «Guardar líneas»): deja uno por vista |
| `catalog/journals.ts` | Vacío (~52: «Usa Crear diarios estándar»), `formError` (~72) → `app-error-notice`; «?» en **Tipo de diario** y **Código** |
| `catalog/document-sequences.ts` | Vacío (~40 «No hay numeraciones.» → explica qué es), `formError` (~59); «?» en **Prefijo** y **Relleno** |
| `catalog/account-classification.ts` | Vacío (~82), error (~37); «?» en **Categoría para reportes** y **Flujo de efectivo** |
| `catalog/accounting-settings.ts` | `formError` (~81) → `app-error-notice`; **«?» en cada cuenta automática** (cuentas por cobrar, por pagar, ventas, compras, anticipos, utilidades acumuladas, resultado del ejercicio, ganancia y pérdida cambiaria, redondeo) y en «Requerir aprobación de asientos» |
| `admin/users.ts` | Vacío (~60), `formError` (~86) y `resetError` (~99) → `app-error-notice`; «?» en **Rol**; botones principales por vista |
| `admin/profile.ts` | `profileError` (~32) y `passError` (~48) → `app-error-notice` |
**Calientes:** `public/manual/ayuda.json` (agrega **al final** de `campos` claves con prefijo `config.` y `reportes.`; no toques lo demás).

## 5. No hagas
- No cambies lógica, señales, ids, rutas ni llamadas a la API. No toques `tax-rates.ts`, `ncf.ts`, `dgii.*`, `company.ts` ni `dashboard.*` (E4-e).
- No cambies cómo se calculan los reportes. No agregues librerías ni estilos globales.
- No escribas el manual `.md` (D1). No renombres claves de `ayuda.json`.

## 6. Pasos sugeridos
1. Verifica que existan `shared/ui/empty-state.ts` y el icono del badge (E4-a); si no, empieza por errores y ayudas.
2. Una pantalla por vez, con un commit cada una: (a) estado vacío en el `@empty` (respeta `colspan`); (b) `<div class="notice neg">{{ xError() }}</div>` de guardar/acción → `<app-error-notice style="display:block;margin-top:14px" [error]="xError()" />` (señal `signal<unknown>('')`, `catch` guarda `e`; importa `ErrorNotice` y `FieldHelp` por nombre desde `../../shared/ui`); (c) «?» con `<app-field-help key="config.cuentaCxc" text="…" />` y su entrada en `ayuda.json` (`campos`); `seccion/ancla` solo si existen; (d) un solo botón principal; (e) «Tercero» → «cliente / proveedor».
3. Revisa 375 px y teclado.

## 7. Criterios de aceptación
- **Cuentas automáticas**: cada cuenta tiene un «?» que dice, en palabras de dueño, para qué la usa el sistema.
- **Libros diarios** vacío ofrece «Crear diarios estándar»; **Numeración** y **Presupuestos** explican qué son y ofrecen crear el primero.
- Un usuario con correo repetido ve «Ya existe un usuario con ese email» con «Cómo arreglarlo» y enlace a Usuarios.
- En el detalle de un presupuesto hay **un** botón principal visible.
- Ninguna de estas pantallas muestra «Tercero» como texto visible.
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
- `reports.html` y `reports.ts` son grandes; el cambio de «Tercero» es solo texto visible (el id `lb-par`, `partnerId` y rutas no cambian).
- `accounting-settings.ts` guarda ids de cuentas contables: no cambies cómo se eligen.
- Cuenta del usuario: no muestres ni registres claves en mensajes.
- Un `btn-primary` dentro de `<app-modal>` es válido; el criterio de «uno solo» es por vista.
- Un modelo local pequeño debe trabajar un archivo por vez y revisar `git diff`; si una pantalla es demasiado grande, avisa en el PR cuál dejaste pendiente en vez de dejarla a medias.

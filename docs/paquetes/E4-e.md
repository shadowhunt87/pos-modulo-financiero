# E4-e — Pantallas guiadas fiscales (Impuestos, NCF, DGII, Panel, Empresa)

**Carril:** E · **Nivel:** N2 · **Tamaño:** L · **Ola:** 4 · **Rama:** `wp/E4e-fiscales` · **Asignado (provisional):** IA-E
**Espera a:** **N2d** (Impuestos, Valores fiscales, Datos fiscales, aviso de ficha) y **N5** (calendario y avisos del Panel) fusionados, **y** a **E4-a** (componente `app-empty-state` e icono del badge). Se hace **después** de N2d y N5 y en **una sola rama**, para que no haya dos versiones de `tax-rates.ts` o `ncf.ts` (PAQUETES §4).
**Ficha del 2026-10-12** · PLAN-v0.2 v1.1 tareas 4.1 a 4.3 (§9.1, §17).

## 2. Objetivo
Aplicar el patrón guiado de la Fase 1 (estado vacío, ayuda de campo, errores con enlace, botón principal único) a las pantallas **fiscales** que ya tocaron N2d y N5, sin romper lo que ellos hicieron: Impuestos, Comprobantes (NCF), DGII 606/607/608, Panel y Empresa. Toca P7, P11, R8, R10.

## 3. Lee antes
- Base: `CLAUDE.md`; `AGENTS.md` (si existe); `docs/PAQUETES-DE-TRABAJO.md` §1 y §4; `docs/GUIA-PRODUCTO.md` P7, P11 y §6; `docs/GUIA-CONTABLE-FISCAL.md` R8, R10, §3.7 y §8; `docs/PLAN-v0.2.md` §9.1, §9.2, §9.6, §17.
- Ejemplos hechos: `frontend/src/app/shared/ui/error-notice.ts`, `field-help.ts`; `features/sales/invoice-form.html`; `features/catalog/partner-dialog.ts`; lo de E4-a (`features/sales/invoices.ts`); lo de N2d/N5 ya fusionado (`features/fiscal/*`, `features/dashboard/fiscal-alerts.ts`).
- Manual: `public/manual/02-configuracion.md` (anclas `impuestos`, `comprobantes-fiscales-ncf`, `datos-de-la-empresa`), `08-reportes-dgii-presupuestos.md` (`dgii-606-607-y-608`), `04-facturas.md` (`que-es-el-ncf`).

## 4. Alcance (verificado; no toques nada más)
| Archivo (en `frontend/src/app/features/`) | Qué hacer |
|---|---|
| `catalog/tax-rates.ts` | Vacío (~62), `formError` (~88) → `app-error-notice`; «?» en **Tasa**, **Tipo**, **Es retención**, **Código DGII**, **Cuenta de ventas/compras**; **conserva** lo que N2d agregó (enlace, base, aviso «no se actualiza solo») |
| `catalog/ncf.ts` | `formError` (~96) → `app-error-notice`; «?» en **Tipo de comprobante**, **Desde/Hasta**, **Vencimiento**, **Avisar cuando queden**; vacío que enseña a conseguir la secuencia en la DGII (enlaza a la guía de NCF si E2 ya existe) |
| `reporting/dgii.ts` y `dgii.html` | Vacío (~114 «No hay registros para este período») con explicación; errores (`loadError` ~25 y el bloque ~44) con «Cómo arreglarlo»; «?» en **606/607/608** y **TXT**; **conserva** la pestaña/enlace de «Revisión del mes» si N4/N6 la agregaron |
| `dashboard/dashboard.html` y `.ts` | «Tercero» (~57) → «Cliente / proveedor»; el vacío de «Últimas facturas» (~70) con botón «Nueva factura»; **conserva** `setup-checklist`, `kpi-strip` y `fiscal-alerts` si ya existen |
| `admin/company.ts` | `formError` (~45) → `app-error-notice`; «?» en **RNC**, **Moneda base**, **Mes de inicio del año fiscal**; **conserva** el enlace a «Datos fiscales» de N2d |
| `reporting/dgii-codes.ts` | Solo si hay textos de códigos sin explicar (no cambies los códigos) |
**Calientes:** `public/manual/ayuda.json` (agrega **al final** de `campos` con prefijo `fiscal.`), `shared/labels.ts` solo si hace falta un texto.

## 5. No hagas
- No cambies cálculos, tasas, códigos DGII, ni reglas de NCF. **Ningún valor fiscal** va en el código (R9).
- No deshagas ni dupliques lo de N2d/N5/N4/N6/E2: **lee antes** cada archivo y conserva sus cambios. Si chocan, para y avisa.
- No toques el backend. No agregues librerías. No escribas el manual `.md` (D2/D1).

## 6. Pasos sugeridos
1. Actualiza tu rama desde la principal y revisa `git log` de cada archivo de la tabla para ver qué cambiaron N2d, N5 y E2.
2. Una pantalla por vez, con commit cada una: (a) estado vacío con `app-empty-state`; (b) errores de guardar/acción → `app-error-notice` (señal `signal<unknown>('')`, `catch` guarda `e`); (c) «?» con `<app-field-help key="fiscal.xxx" text="…" />` + entrada en `ayuda.json`; (d) un solo botón principal; (e) textos «cliente / proveedor».
3. Explica en lenguaje de dueño lo que bloquea una regla fiscal (ver checklist contable-fiscal §8: «Este gasto no es deducible porque el comprobante es de consumo»).
4. 375 px, teclado, `verificar-ayuda`.

## 7. Criterios de aceptación
- Con una empresa sin impuestos ni NCF: **Impuestos** y **Comprobantes (NCF)** explican qué son y cómo empezar; **DGII** explica qué falta para generar el formato.
- El error «No hay secuencia configurada» muestra «Cómo arreglarlo» con botón a Comprobantes fiscales.
- Los «?» de NCF explican B01 (crédito fiscal) y B02 (consumo) en una frase.
- Nada de lo agregado por N2d (estado **Oficial / Por validar**, enlace de impuestos) ni N5 (calendario, avisos) desaparece ni cambia de comportamiento.
- `npx ng build`, `npx ng test` y `node scripts/verificar-ayuda.mjs` sin errores; checklist de GUIA-PRODUCTO §6 en cada pantalla.

## 8. Cómo probar
```
cd frontend && npm ci
npx ng build
npx ng test            # si se queda esperando cambios: npx ng test --watch=false
node scripts/verificar-ayuda.mjs
```
Backend para verlo: tu base propia (ficha E1a §8) y `npm start` en `frontend/`.

## 9. Entregables y PR
Un PR con **Qué hice**, **Archivos tocados**, **Decisiones** (qué conservaste de N2d/N5), **Cómo probar**, **Qué falta**, `[CAPTURA: …]` sugeridas.

## 10. Riesgos y trampas
- Son las pantallas con más choques entre paquetes; el orden N2d → N5 → E4-e existe por eso.
- `dgii.html` es una pantalla compartida con N4 y N6 (pestañas): cambios mínimos.
- Un estado «Por validar» sin explicación asusta al dueño: agrega el «?».
- El dueño no sabe qué es un NCF: la explicación va antes que el formulario.
- No cambies los textos del 606/607/608 que usan las contadoras sin que ellas lo revisen.

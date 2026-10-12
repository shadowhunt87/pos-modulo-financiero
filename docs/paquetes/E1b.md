# E1b — Plantilla de plan de cuentas e impuestos base (`POST /guidance/chart-template`)

**Carril:** E · **Nivel:** N1 · **Tamaño:** L · **Ola:** 2 · **Rama:** `wp/E1b-plantilla` · **Asignado (provisional):** IA-E
**Espera a:** **N2c** fusionado (los impuestos deben nacer **enlazados** a parámetros con vigencia), **E1a** (el módulo `src/guidance/`), y la **validación del plan de cuentas por las contadoras (D14)**. Sin D14 no se fija el mapeo de cuentas automáticas.
**Ficha del 2026-10-12** · PLAN-v0.2 v1.1 tarea 2.2; PLAN-v0.3 §15 (orden con N2).

## 2. Objetivo
Un botón «Preparar mi contabilidad» deja una empresa nueva lista para facturar: plan de cuentas RD clasificado, cuentas automáticas, impuestos base ya enlazados a los valores fiscales vigentes y diarios estándar. Es la base de «primera factura en menos de 15 minutos» (P2). Toca R6, R9, R7.

## 3. Lee antes
- Base: `CLAUDE.md`; `AGENTS.md` (si existe); `docs/PAQUETES-DE-TRABAJO.md` §1 y §4; `docs/GUIA-CONTABLE-FISCAL.md` R6, R9, §3.2, §3.4, §4.
- **`docs/PLAN-v0.2.md` §9.3 (grupo 2 y tabla de `chart-template`), §16.4 (e2e de `chart-template`), §20.2 (riesgo del plan base). `docs/PLAN-v0.3.md` §5.3–§5.6 y §15.**
- Código que **ya existe y debes reutilizar** (el plan v0.2 hablaba de crear `plan-cuentas-rd.ts`, pero el catálogo ya está cargado): `src/chart-of-accounts/chart-of-accounts.service.ts` (`importStandardRd`, `previewStandardRd`, `apply`), `src/chart-of-accounts/templates/catalogo-estandar-rd.json` (generado con `scripts/generar-catalogo-rd.mjs`; no se edita a mano), `src/masters/journals/journals.service.ts` (`/journals/defaults`), `src/masters/account-classification/*`, `src/masters/accounting-settings/*`, `src/masters/tax-rates/*`, `src/fiscal/` (N2a/N2b/N2c).

## 4. Alcance (verificado)
- **Modificar (E1a creó el módulo):** `src/guidance/guidance.controller.ts` (`POST /guidance/chart-template`, solo ADMIN), `guidance.service.ts`, `guidance.module.ts` (importar lo que haga falta).
- **`src/chart-of-accounts/chart-of-accounts.module.ts`/`.service.ts`:** hoy el módulo no exporta el servicio y `apply()` abre su propia transacción. Para tener **una sola transacción** hay que exportar el servicio y exponer una versión que reciba `tx`. Cambio mínimo y explicado.
- **Crear:** archivo de plantilla de impuestos y de mapeo de cuentas automáticas (p. ej. `src/guidance/templates/*.ts` o `.json`). Si es `.json`, **agrega su ruta en `nest-cli.json` → `compilerOptions.assets`** (hoy solo copia `chart-of-accounts/templates/*.json`) o no llegará a `dist/`.
- **Pruebas:** `test/guidance.e2e-spec.ts` (agrega los casos de `chart-template`).
- Sin migración nueva.

## 5. No hagas
- No inventes cuentas: usa el catálogo estándar y el mapeo que validen las contadoras (D14). No valores fiscales en el código: los impuestos se **enlazan por `parameterKey`**; la tasa sale de `valueAt`.
- No sobrescribas un plan existente: si la empresa ya tiene cuentas → **409 sin cambios**.
- No toques `invoicing.service.ts`. No cambies migraciones.

## 6. Pasos sugeridos
1. e2e primero (abajo).
2. Verifica «empresa sin cuentas»; si hay cuentas → 409.
3. En una transacción: catálogo estándar RD (198 cuentas) con su clasificación; cuentas automáticas (`AccountingSettings`: CxC, CxP, ventas, compras, anticipos, utilidades acumuladas, resultado del ejercicio, redondeo, ganancia/pérdida cambiaria); impuestos base (ITBIS 18 %, 16 %, 0 %; retenciones habituales) con cuentas de venta/compra de la misma empresa y su `parameterKey`; diarios estándar.
4. `writeAudit` del total (cuántas cuentas, impuestos, diarios).
5. Valida que, tras la plantilla y una secuencia NCF, se pueda emitir una factura de venta sin más configuración.
6. Ajusta `nest-cli.json` si agregaste `.json`.

## 7. Criterios de aceptación
- Solo ADMIN: ACCOUNTANT, APPROVER y VIEWER → 403 (y AUDITOR cuando exista).
- Todas las cuentas creadas quedan **clasificadas** y las cuentas automáticas **completas**.
- Cada impuesto creado apunta a cuentas de **su** empresa y a un `parameterKey` existente.
- **Segunda llamada → 409** y no cambia nada. La empresa B queda intacta. Queda `AuditLog`.
- Tras la plantilla + una `NcfSequence`, emitir una venta de 10.000 + ITBIS 18 % funciona y el asiento cuadra (11.800).
- Si la transacción falla a la mitad, no queda **nada** a medias.

## 8. Cómo probar
```
docker run -d --name pg-E1b -e POSTGRES_PASSWORD=<clave-local-inventada> -e POSTGRES_DB=fin_e1b -p 55443:5432 postgres:18-alpine
# TU .env local (no se sube): DATABASE_URL=postgresql://postgres:<clave>@localhost:55443/fin_e1b
#   JWT_SECRET=<openssl rand -hex 64>   UPLOADS_DIR=./uploads-e1b
npm ci && npx prisma migrate deploy && npx prisma generate
npm run build && npm test && npm run test:e2e
```
Después de `npm run build`, comprueba que el JSON nuevo existe en `dist/`.

## 9. Entregables y PR
Endpoint + plantilla + pruebas. PR con: **Qué hice**, **Archivos tocados**, **Decisiones** (cómo lograste una sola transacción), **Cómo probar**, **Qué falta** (pantalla = E2; validación de contadoras). Seguridad y revisor revisan.

## 10. Riesgos y trampas
- **Plan de cuentas con errores** = riesgo alto (PLAN-v0.2 §20.2): la validación escrita de las contadoras (D14) es requisito.
- `TaxRate.rate` queda informativo cuando hay `parameterKey`; no lo uses para calcular.
- `NcfSequence` es única por `(companyId, ncfType)`: no crees secuencias aquí (las pone el usuario con la guía NCF).
- `apply()` ya llama a la auto-clasificación; no la dupliques.
- Los impuestos exigen cuentas postables: crea cuentas antes que impuestos dentro de la misma transacción.

# N2c — `build()` con tasa y base del parámetro, y trazabilidad

**Carril:** N · **Nivel:** N1 · **Tamaño:** M · **Ola:** 2 · **Rama:** `wp/N2c-calculo` · **Asignado (provisional):** IA-N
**Espera a:** **N2a** fusionado (tablas y `valueAt`; conviene también N2b para tener datos) y a **D37** de Carlos (retención al emitir o al pagar). Esta ficha asume la recomendación: **al emitir**. Si Carlos decide «al pagar», este paquete cambia (+1,5 a 2 semanas): **para y avisa**.
Tocas `invoicing.service.ts` (del socio): PR propio y aviso previo.
**Ficha del 2026-10-12** · PLAN-v0.3 v1.2, tarea 2.4 (§5.2, §5.3, §5.4).

## 2. Objetivo
Una factura calcula sus impuestos y retenciones con la tasa y la base **vigentes a su fecha** (no con lo que diga el maestro hoy) y guarda qué tasa usó y de dónde salió. Las notas de crédito/débito heredan la tasa de la factura que modifican. Toca R9, R7, R10.

## 3. Lee antes
- Base: `CLAUDE.md`; `AGENTS.md` (si existe); `docs/PAQUETES-DE-TRABAJO.md` §1 y §4; `docs/GUIA-CONTABLE-FISCAL.md` R7, R9, R10, §8.
- **`docs/PLAN-v0.3.md` §5.2 (fecha usada, notas N5, retener al pagar), §5.3 (enlace, base declarada, A7, A3), §5.4 (trazabilidad), §13 (`fiscal-parameters.e2e-spec.ts`), §14, §16 D37 y D38.**
- Código: `src/invoicing/invoicing.service.ts` — `build()` (líneas ~86–198; la tasa se aplica en ~156 y la base de retención en ~171), `persistChildren` (~200), `issueTx` (~281; recalcula contra los maestros al emitir), `get()` (~514); `src/masters/tax-rates/tax-rates.service.ts` y `dto/tax-rate.dto.ts`; `src/dgii/dgii.service.ts` (~322) y `dgii.codes.ts` (`CONSUMER_DETAIL_THRESHOLD = 250000`); lo de `src/fiscal/` de N2a.

## 4. Alcance (verificado)
- **`src/invoicing/invoicing.service.ts` (CALIENTE, riesgo alto)**, tocar solo: `build()` (≈15 líneas: pedir a `valueAt` la tasa y la base para impuestos con `parameterKey`; ignorar la base que manda el cliente y la del borrador; llenar `appliedRate` y `fiscalParameterId` en líneas y retenciones; usar la fecha de la factura que modifica en notas de crédito/débito); `get()` (devolver `appliedRate`). Impuestos sin enlazar: **igual que hoy**.
- `src/masters/tax-rates/tax-rates.service.ts` + `dto/tax-rate.dto.ts`: `PATCH` de la tasa de un impuesto enlazado → 422 explicado; aceptar `parameterKey`.
- `src/dgii/dgii.service.ts`/`dgii.codes.ts`: el umbral de consumo sale del parámetro `F607_UMBRAL_DETALLE_CONSUMO` (con la fecha del período); `src/dgii/dgii.module.ts` importa `FiscalModule`.
- `src/invoicing/invoicing.module.ts`: importar `FiscalModule` (si N2a no lo exporta ya, 1 línea en `fiscal.module.ts`).
- **Pruebas:** completar `test/fiscal-parameters.e2e-spec.ts`; ajustar `test/dgii.e2e-spec.ts` y las que dependan del umbral para que inserten el parámetro (hoy no hay ninguno en la base de pruebas).
- **Sin migración nueva** (N2a ya agregó `appliedRate`, `fiscalParameterId`, `parameterKey`).

## 5. No hagas
- No pongas ningún valor fiscal por defecto en el código: si falta el valor → 422 (o el error dentro del reporte, ver trampas).
- No recalcules facturas ya emitidas (ninguna cambia). No toques `posting.service.ts`.
- No tocar las pantallas (preview de la factura = N2d). No cambies migraciones existentes.
- No ejecutes el cambio de «retener al pagar» sin decisión de Carlos.

## 6. Pasos sugeridos
1. Escribe primero los e2e (abajo); fallan.
2. En `build()`: si `taxRate.parameterKey`, `valueAt(key, fechaDocumento, tx)` → tasa y base; rechaza combinaciones incompatibles (base ITBIS solo con `ITBIS_WITHHOLDING`; TOTAL/SUBTOTAL con retenciones; parámetro sin base solo con impuestos de línea) y la clave `NONE` («Este impuesto no aplica desde …; quítalo de la línea»).
3. Fecha del documento: `issueDate`; en notas, la `issueDate` de `relatedInvoice` (cargar esa factura ya se hace en `build()`).
4. Guarda `appliedRate`/`fiscalParameterId` en `lines` y `withholdings` (el `createMany` de `persistChildren` los recibe del objeto).
5. Umbral del 607 con `valueAt`.
6. `PATCH` de tasa enlazada → 422.
7. Corre toda la suite; las facturas anteriores deben dar idénticos montos.

## 7. Criterios de aceptación
(Cifras de ejemplo de esta ficha, con claves `TEST_*`.)
- `TEST_RET` = 10 % hasta 30-jun-2026 y 15 % desde 1-jul-2026, base SUBTOTAL. Compra de subtotal 10.000: fecha 15-jun → retención **1.000,00**; fecha 15-jul → **1.500,00**.
- Borrador con fecha de junio emitido en julio → **1.000,00** (usa la fecha de la factura, no la de hoy).
- Nota de crédito de 4.000 sobre una factura de junio, emitida en julio → retención **400,00** (hereda junio).
- 2 % con base TOTAL sobre 10.000 + ITBIS 18 % (total 11.800) → **236,00** (con base SUBTOTAL daría 200,00; con base ITBIS, 36,00).
- Base enviada por el cliente en un impuesto enlazado → se ignora. Enlace incompatible → 422. `PATCH` de tasa enlazada → 422.
- `appliedRate` y `fiscalParameterId` quedan guardados; `get()` los devuelve.
- Antes de 2025-01-01 con impuesto enlazado → 422. Umbral 607: factura B02 de 249.999 se resume; de 250.000 va al detalle.
- Facturas previas (sin enlace) dan exactamente los mismos montos; `invoicing-payments.e2e-spec.ts` en verde sin cambios.

## 8. Cómo probar
```
docker run -d --name pg-N2c -e POSTGRES_PASSWORD=<clave-local-inventada> -e POSTGRES_DB=fin_n2c -p 55438:5432 postgres:18-alpine
# TU .env local (no se sube): DATABASE_URL=postgresql://postgres:<clave>@localhost:55438/fin_n2c
#   JWT_SECRET=<openssl rand -hex 64>   UPLOADS_DIR=./uploads-n2c
npm ci && npx prisma migrate deploy && npx prisma generate
npm run build && npm test && npm run test:e2e
```

## 9. Entregables y PR
Cambios en `build()`/`get()`, tax-rates, dgii + pruebas. PR con: **Qué hice**, **Archivos tocados** (calientes marcados), **Decisiones** (D37 aplicada, qué hace falta de valor → 422), **Cómo probar**, **Qué falta** (N2d pantallas). Seguridad y revisor revisan; el socio recibe aviso.

## 10. Riesgos y trampas
- **Dinero:** `r2()` redondea a 2 decimales half-up (modo 4 de decimal.js); no uses `Number()`. Los totales deben cuadrar con las líneas (R7).
- La retención se **reporta** en 607/606 en el período de pago, pero se **calcula y contabiliza** al emitir: no mezclar.
- `issueTx` recalcula al emitir: un borrador creado antes del enlace también debe recalcularse.
- Falta de parámetro → hoy rompería el 607 y sus e2e; decide con el revisor si el 607 devuelve 422 o un error dentro de `errors` (recomendado: dentro del reporte) y déjalo escrito en el PR.
- `TaxRate.rate` queda **informativo** en enlazados (deuda conocida); el detalle muestra la tasa aplicada solo si existe `appliedRate`.

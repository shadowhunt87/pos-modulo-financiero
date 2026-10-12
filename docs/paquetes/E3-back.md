# E3-back — Semáforo financiero (backend `src/financial-analysis/`)

**Carril:** E · **Nivel:** N2 (lo revisa N1) · **Tamaño:** M + L + L · **Ola:** 0 · **Rama:** `wp/E3-semaforo-back` · **Asignado (provisional):** IA-E
**Espera a:** los **límites por defecto validados por las contadoras (D5)**. Puedes construir todo con los valores del plan marcados como «por validar»; no se despliega hasta que las contadoras los confirmen.
**Ficha del 2026-10-12** · PLAN-v0.2 v1.1 tareas 3.1 a 3.4 (§6, §16.1).

## 2. Objetivo
El dueño ve su empresa en **verde / amarillo / rojo / gris** con una frase sencilla por indicador, puede comparar dos períodos y ver la tendencia; la contadora puede ajustar los límites. Reutiliza las 20 razones que ya calcula el sistema, sin tocarlas. Toca P3, P6, R7.

## 3. Lee antes
- Base: `CLAUDE.md`; `AGENTS.md` (si existe); `docs/PAQUETES-DE-TRABAJO.md` §1 y §4; `docs/GUIA-PRODUCTO.md` P3, P6; `docs/GUIA-CONTABLE-FISCAL.md` R7 y §8.
- **`docs/PLAN-v0.2.md` §6.1 (modelo), §6.2 (semáforo, tabla de límites y frases), §6.3 (tendencia, comparar, 6 indicadores del Panel), §6.4 (endpoints y roles), §13.1 (matriz de permisos), §16.1 (e2e con cifras).**
- Código: `src/reports/generators/financial-ratios.generator.ts` (`generate(q, user)` devuelve `ratios[]` con `key`, `value` (Decimal o null), `note`, y `statement` con `ebitda`; claves: `currentRatio, quickRatio, cashRatio, workingCapital, debtToAssets, debtToEquity, equityMultiplier, interestCoverage, grossMargin, operatingMargin, netMargin, roa, roe, daysSalesOutstanding, …`), `src/reports/reports.module.ts` (exporta `FinancialRatiosGenerator`), `src/exports/*` (`TableDoc`, `renderPdf`, `renderXlsx`), `test/financial-ratios.e2e-spec.ts` (esqueleto y datos del T1 2030), `src/feedback/*` (módulo de ejemplo).

## 4. Alcance (verificado)
- **Crear:** `src/financial-analysis/` con `financial-analysis.module.ts` (importa `ReportsModule`, **sin modificarlo**), `.controller.ts`, `.service.ts`, `dto/`, `ratio-thresholds.ts` (límites por defecto y dirección «más es mejor / menos es mejor»), `ratio-interpretations.ts` (una frase por razón y color, para el dueño), builder de exportación propio; `test/financial-analysis.e2e-spec.ts`.
- **`prisma/schema.prisma` (caliente, al final):** `RatioThreshold (companyId, ratioKey, greenAt, redAt Decimal(19,4), enabled, updatedById, updatedAt)`, único `(companyId, ratioKey)`; 1 línea de relación en `Company`; migración propia `<fecha>_ratio_thresholds`.
- **`src/app.module.ts` (caliente):** 1 import.
- **Endpoints** (`@Controller('financial-analysis')`): `GET health?from&to`, `trend?from=AAAA-MM&to=AAAA-MM&granularity=MONTH|QUARTER|YEAR&keys=`, `compare?from&to&compareFrom&compareTo`, `kpis`, `thresholds` (lectura: todos los roles); `PUT thresholds` y `DELETE thresholds/:ratioKey` (ADMIN y ACCOUNTANT); `export/health|compare?format=xlsx|pdf` (todos).
- **No toques** `financial-ratios.generator.ts` ni `ReportsModule`; no hay frontend aquí (es E3-front).

## 5. No hagas
- No modifiques las 20 razones ni el generador: **inyéctalo**. No copies su lógica.
- No uses `float`: `Prisma.Decimal` y `toDecimalPlaces(4)`; denominador cero ⇒ `null` + nota (gris «sin dato»).
- No guardes «fotos» de razones (`FinancialRatioSnapshot` sigue sin usarse). No agregues librerías. No uses símbolos como «≥» en los PDF (Helvetica los imprime como «?»).
- No cambies migraciones existentes.

## 6. Pasos sugeridos
1. Modelo `RatioThreshold` + migración; `npx prisma generate`.
2. `ratio-thresholds.ts` con la tabla del §6.2 (Razón corriente 1,5/1,0; Prueba ácida 1,0/0,7; Razón de efectivo 0,3/0,1; Capital de trabajo > 0; Endeudamiento ≤ 50 %/70 %; Deuda/patrimonio 1,0/2,0; Apalancamiento 2,0/3,0; Cobertura de intereses 3,0/1,5; márgenes; ROA y ROE; Días de cobro 45/75). Margen EBITDA: la razón no existe en el generador; cálculo sobre `statement.ebitda` (aclara la base en el PR). Sin semáforo por defecto: días de pago/inventario, ciclo y rotaciones.
3. `health`: color por dirección, **gris** si no hay valor, ROA y ROE **anualizados** si el período < 360 días (× 365/días) y rotulados; texto «Bien / Atención / Riesgo» + frase.
4. Límites: PUT valida coherencia (verde mejor que rojo) y claves existentes; DELETE restaura el valor por defecto; `writeAudit`.
5. `trend` (máx. 24 puntos; 4 claves a la vez; llama al generador por punto), `compare`, `kpis` (6 indicadores del Panel).
6. Exportaciones PDF/Excel con builder propio y las mismas cabeceras que `ExportsController.send`.
7. e2e + medición de tiempo (con ≈20.000 asientos; si pasa de 5 s, 12 puntos por defecto).

## 7. Criterios de aceptación
(datos T1 2030 de `financial-ratios.e2e-spec.ts`: utilidad neta 22.000; ingresos totales 91.000; activo 200.000 → 242.000; patrimonio 100.000 → 122.000)
- Razón corriente **2,4167** ⇒ verde. Endeudamiento **49,5868 %** ⇒ verde (límite 50 %); mover el límite verde a 49,5868 ⇒ sigue verde; a 49,58 ⇒ amarillo. Denominador cero ⇒ gris con la nota.
- ROA del T1 = **9,9548 %** se evalúa como **40,3722 %** (× 365/90) y se marca «anualizado».
- Límites: PUT ADMIN y ACCOUNTANT; **403** a APPROVER, VIEWER (y AUDITOR); límites incoherentes ⇒ 400; clave inexistente ⇒ 400; los de A no afectan a B; DELETE restaura; `AuditLog`.
- Tendencia enero–marzo 2030 ⇒ **3 puntos**; más de 24 ⇒ 400; `from > to` ⇒ 400.
- Comparar T1 2030 vs T1 2029; `kpis` devuelve 6 claves a cualquier rol y solo de su empresa; exportaciones: PDF empieza con `%PDF`; Excel contiene «Razón corriente».

## 8. Cómo probar
```
docker run -d --name pg-E3b -e POSTGRES_PASSWORD=<clave-local-inventada> -e POSTGRES_DB=fin_e3b -p 55445:5432 postgres:18-alpine
# TU .env local (no se sube): DATABASE_URL=postgresql://postgres:<clave>@localhost:55445/fin_e3b
#   JWT_SECRET=<openssl rand -hex 64>   UPLOADS_DIR=./uploads-e3b
npm ci && npx prisma migrate deploy && npx prisma generate
npm run build && npm test && npm run test:e2e
```

## 9. Entregables y PR
Módulo + migración + pruebas. PR con: **Qué hice**, **Archivos tocados** (`schema.prisma`, `app.module.ts` marcados), **Decisiones** (margen EBITDA, anualización), **Cómo probar** (incluye el tiempo medido de la tendencia), **Qué falta** (pantallas = E3-front; validación D5). Revisa N1.

## 10. Riesgos y trampas
- **Semáforo engañoso**: avisa si hay cuentas sin clasificar (`unclassified`) y rotula la anualización.
- «Margen bruto» depende mucho del sector: el aviso va en la frase.
- El generador devuelve rentabilidad **no anualizada**: la anualización la haces tú, no él.
- 24 puntos ≈ 150 consultas: mide; no crees tablas de fotos (se vuelven falsas al reabrir períodos).
- Los límites por defecto son del producto, no una ley: pero deben validar las contadoras antes de salir.

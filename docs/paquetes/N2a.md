# N2a — Parámetros fiscales con vigencia y ficha fiscal (modelo y consulta)

**Carril:** N · **Nivel:** N1 · **Tamaño:** M · **Ola:** 1 · **Rama:** `wp/N2a-parametros` · **Asignado (provisional):** IA-N
**Espera a:** aprobación del plan v0.3 por Carlos. **No se fusiona el mismo día** que A1 o N3 (choque de migraciones).
**Ficha del 2026-10-12** · PLAN-v0.3 v1.2, tarea 2.1 (§5.1, §5.2, §5.4, §6).

## 2. Objetivo
Crear la base para que ningún valor de la DGII viva en el código (R9): tablas **de solo inserción** con «válido desde», una función `valueAt(clave, fecha)` y la ficha fiscal de la empresa (clasificación DGII, régimen, tipo de sociedad, marco NIIF). Todavía no calcula facturas (eso es N2c).

## 3. Lee antes
- Base: `CLAUDE.md`; `AGENTS.md` (si existe); `docs/PAQUETES-DE-TRABAJO.md` §1 y §4; `docs/GUIA-CONTABLE-FISCAL.md` R9, §3, §4 y §8.
- **`docs/PLAN-v0.3.md` §5.1 (modelo), §5.2 (resolución, fecha mínima, notas de crédito), §5.4 (migración), §6 (ficha), §10 (permisos), §13 (`fiscal-parameters.e2e-spec.ts`), §14.**
- Código a imitar: `src/feedback/*` (módulo nuevo pequeño), `src/company/*`, `src/common/audit.ts`, `prisma/schema.prisma` (modelos `TaxRate`, `InvoiceLine`, `InvoiceWithholding`, `Feedback`), `prisma/migrations/20261011043014_feedback/migration.sql` (migración aditiva reciente), `test/feedback.e2e-spec.ts`.

## 4. Alcance (verificado)
- **Crear:** carpeta `src/fiscal/` (module, `fiscal-parameters.service.ts` con `valueAt`, `fiscal-profile.service.ts`, controller de **lectura**, dto); `prisma/migrations/<fecha>_fiscal_parameters/migration.sql`; `test/fiscal-parameters.e2e-spec.ts` (parte de N2a; N2b/N2c la completan).
- **`prisma/schema.prisma` (caliente), solo al final y con estas excepciones:** modelos `FiscalParameter`, `FiscalParameterValidation`, `FiscalParameterLoad`, `CompanyFiscalProfile` (1 a 1 con `Company`) y sus enums; `TaxRate.parameterKey String?`; `InvoiceLine.appliedRate Decimal(9,4)?` y `fiscalParameterId String?`; `InvoiceWithholding.appliedRate` y `fiscalParameterId`; **1 línea** de relación en `Company`.
- **`src/app.module.ts` (caliente):** 1 import de `FiscalModule`.
- Endpoints de este paquete (decisión de reparto de esta ficha, el plan no los separa): solo **lectura** `GET /fiscal/parameters?date=` y `GET /fiscal/parameters/:key` (historial). Las rutas de sugerencias, `effective?date`, ficha (`/fiscal/profile`) y avisos son de **N2d**.

## 5. No hagas
- No pongas ningún valor fiscal en el código. No crees `validTo`. No agregues métodos que modifiquen o borren parámetros.
- No cambies migraciones existentes ni `build()` de facturación (es N2c). No toques `invoicing.service.ts`.
- No cargues el catálogo (es N2b/D3). No agregues librerías.

## 6. Pasos sugeridos
1. Modela las tablas del §5.1: único `(key, revision, validFrom)`; `value Decimal(19,6)?`; `kind` RATE|AMOUNT|DATE|DAYS|FLAG|TABLE|NONE; `base` ITBIS|SUBTOTAL|TOTAL solo para retenciones; `supersedesId`; `source`, `sourceUrl`, `loadId`.
2. Migración aditiva con `prisma migrate dev --create-only`; revísala a mano. `npx prisma generate`.
3. `valueAt(key, date, tx?)`: descarta filas con sucesora (otra fila con `supersedesId` = su id), toma la de mayor `validFrom ≤ fecha` y mayor `revision`; usa fecha UTC; devuelve `{ id, value, base, status, validFrom, source }`; sin valor → 422 en español («No hay un valor vigente de '…' para el dd/mm/aaaa; avísanos»); antes del 2025-01-01 → 422 «El sistema tiene valores fiscales desde el 01/01/2025».
4. Estado Oficial/Por validar: sale de que exista una `FiscalParameterValidation` con nombre; si no, Por validar.
5. Servicio de la ficha (lectura/escritura interna; los endpoints llegan con N2d).
6. e2e con claves `TEST_*` (inserta por Prisma en la prueba y bórralas en `afterAll`).

## 7. Criterios de aceptación
- Con `TEST_RET` = 10 % desde 2026-01-01 y 15 % desde 2026-07-01: `valueAt` del 15-jun-2026 da 10; del 15-jul-2026 da 15.
- Una revisión nueva con `supersedesId` hace que `valueAt` ignore la fila reemplazada.
- Sin valor → 422 en español; fecha anterior al 2025-01-01 → 422.
- Comparando la tabla antes y después de cualquier operación del servicio, **ninguna fila cambia**; el servicio no expone métodos de update/delete (la prueba lo verifica).
- `GET /fiscal/parameters` responde a los 5 roles; empresa B no puede leer nada «de A» porque las tablas son globales (no hay `companyId`).
- Facturas existentes idénticas tras la migración (`appliedRate` y `fiscalParameterId` nulos).
- `security.e2e-spec.ts` en verde (rutas nuevas son solo GET).

## 8. Cómo probar
```
docker run -d --name pg-N2a -e POSTGRES_PASSWORD=<clave-local-inventada> -e POSTGRES_DB=fin_n2a -p 55436:5432 postgres:18-alpine
# TU .env local (no se sube): DATABASE_URL=postgresql://postgres:<clave>@localhost:55436/fin_n2a
#   JWT_SECRET=<openssl rand -hex 64>   UPLOADS_DIR=./uploads-n2a
npm ci && npx prisma migrate deploy && npx prisma generate
npm run build && npm test && npm run test:e2e
```

## 9. Entregables y PR
Esquema + migración + módulo + pruebas. PR con: **Qué hice**, **Archivos tocados** (marca `schema.prisma` y `app.module.ts`), **Decisiones** (incluye el reparto de endpoints con N2d), **Cómo probar**, **Qué falta** (N2b cargador, N2c cálculo). Seguridad revisa este PR.

## 10. Riesgos y trampas
- Las tablas son **globales** (sin `companyId`): la prueba «ningún update/delete sin companyId» de `security.e2e-spec.ts` mira `.update/.delete({ where: { id } })` en `src/`; no escribas ninguno.
- `valueAt` debe ignorar filas reemplazadas (hallazgo N3 del revisor): sin eso, una corrección no surte efecto.
- Los datos globales no tienen usuario ni empresa para `AuditLog`: por eso existe `FiscalParameterLoad`.
- El cliente Prisma generado (`src/generated`) no se sube a git: cada quien corre `prisma generate`.
- Dos ramas con migraciones chocan: si otra se fusiona antes, haz `rebase` y regenera la tuya con otro nombre.

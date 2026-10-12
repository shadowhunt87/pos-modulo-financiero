# E1a — Guía de arranque y flujos (backend `src/guidance/`)

**Carril:** E (experiencia guiada) · **Nivel:** N2 · **Tamaño:** M + M · **Ola:** 1 · **Rama:** `wp/E1a-guidance` · **Asignado (provisional):** IA-E
**Espera a:** nada (solo lectura sobre lo que ya existe). Es la base de E1b, E1c y E2: **crea el módulo `src/guidance/` y su registro** antes que ellos.
**Ficha del 2026-10-12** · PLAN-v0.2 v1.1, tareas 2.1, 2.4 y 2.5 (§9.3, §16.4).

## 2. Objetivo
Tres consultas que dicen al usuario nuevo **qué le falta** y **qué sigue**: el estado de su arranque en 5 grupos, los pasos de una factura (creada → emitida → cobrada → conciliada) y los chequeos antes de cerrar un mes. Con eso se arma el asistente (E2). Toca P2, P7; no escribe datos.

## 3. Lee antes
- Base: `CLAUDE.md`; `AGENTS.md` (si existe); `docs/PAQUETES-DE-TRABAJO.md` §1 y §4; `docs/GUIA-PRODUCTO.md` P2 y P7; `docs/GUIA-CONTABLE-FISCAL.md` §6 (cierre guiado) y §8.
- **`docs/PLAN-v0.2.md` §9.3 (5 grupos y tabla de endpoints de `guidance`), §16.4 (e2e), §2.1 (convenciones de backend).**
- Código a imitar: `src/feedback/*` (módulo pequeño con controller/service/module/dto), `test/feedback.e2e-spec.ts` (esqueleto de e2e con dos empresas), `src/dgii/dgii.service.ts` (`report606`, `report607`, `parsePeriod`), `src/modules/accounting/accounting.service.ts` (`trialBalance`, `listJournalEntries`), `prisma/schema.prisma` (`Company`, `FiscalYear`, `AccountingSettings`, `Journal`, `TaxRate`, `NcfSequence`, `BankAccount`, `CashRegister`, `Partner`, `Invoice`, `JournalEntry.reconciled`, `BankTransaction`).

## 4. Alcance (verificado)
- **Crear:** `src/guidance/guidance.module.ts`, `guidance.controller.ts`, `guidance.service.ts`, `dto/` (query de `period-close`), `test/guidance.e2e-spec.ts`.
- **Modificar:** `src/app.module.ts` (**caliente**: 1 import de `GuidanceModule`, al final de la lista). `GuidanceModule` importa `DgiiModule` (ya exporta `DgiiService`) y `AccountingModule` (exporta `AccountingService`) **sin modificarlos**.
- **Sin migración, sin tocar `schema.prisma`.** Las rutas de E1b/E1c (`chart-template`, `sample-data`) las agregan sus paquetes en este mismo módulo; deja el controlador listo para crecer.
- Endpoints (todos GET, todos los roles de lectura, `@UseGuards(JwtAuthGuard, RolesGuard)`):
  - `GET /guidance/setup-status`: 5 grupos `{ key, title, done, reason, route }`.
  - `GET /guidance/invoice-flow/:id`: pasos de una factura.
  - `GET /guidance/period-close?periodId=`: chequeos antes de cerrar.

## 5. No hagas
- No escribas datos ni agregues rutas POST/DELETE (son de E1b/E1c). No copies lógica de los reportes: **inyecta** los servicios.
- No pongas valores fiscales en el código. No cambies migraciones. No devuelvas datos de otra empresa (usa siempre `user.companyId`).

## 6. Pasos sugeridos
1. Esqueleto del módulo y registro; `ParseUUIDPipe` en ids.
2. `setup-status`: (1) empresa con nombre y RNC y un año fiscal abierto que contiene hoy; (2) plan de cuentas clasificado, cuentas automáticas completas (`AccountingSettings` sin nulos requeridos), impuestos base y diarios estándar; (3) al menos una `NcfSequence` activa, vigente y con números disponibles; (4) una cuenta de banco o caja activa; (5) un cliente y una factura de venta emitida. Cada grupo con `reason` en español y `route` a donde se resuelve.
3. `invoice-flow/:id`: borrador → emitida → con cobro aplicado → cobrada completa → asiento del cobro conciliado (`JournalEntry.reconciled`); factura ajena → 404.
4. `period-close?periodId=`: asientos pendientes de aprobación, facturas en borrador del mes, movimientos bancarios sin conciliar, balanza cuadrada (`trialBalance`), avisos del 606/607 vía `DgiiService`; cada chequeo `{ key, ok, detail, route }`.
5. e2e (esqueleto de `feedback.e2e-spec.ts`) con empresas A y B.

## 7. Criterios de aceptación
- Empresa nueva (sin nada): los **5 grupos pendientes**, cada uno con `route`. Cada acción (crear año, cuentas, NCF, banco, cliente + factura) lo va marcando como hecho.
- `invoice-flow` recorre: borrador → emitida → cobro parcial → cobrada → conciliada; una factura de otra empresa da 404.
- `period-close`: con un asiento pendiente, un borrador de factura y un movimiento sin conciliar muestra 3 chequeos fallidos con enlace; al resolverlos, todo en verde.
- Empresa B nunca ve estado de A. Todos los roles (incluido VIEWER) pueden leer.
- `security.e2e-spec.ts` en verde (sin rutas de escritura nuevas).

## 8. Cómo probar
```
docker run -d --name pg-E1a -e POSTGRES_PASSWORD=<clave-local-inventada> -e POSTGRES_DB=fin_e1a -p 55442:5432 postgres:18-alpine
# TU .env local (no se sube): DATABASE_URL=postgresql://postgres:<clave>@localhost:55442/fin_e1a
#   JWT_SECRET=<openssl rand -hex 64>   UPLOADS_DIR=./uploads-e1a
npm ci && npx prisma migrate deploy && npx prisma generate
npm run build && npm test && npm run test:e2e
```

## 9. Entregables y PR
Módulo + pruebas. PR con: **Qué hice**, **Archivos tocados** (`app.module.ts` marcado), **Decisiones** (cómo definiste «hecho» de cada grupo), **Cómo probar**, **Qué falta** (rutas de E1b/E1c y pantallas de E2). Un solo PR.

## 10. Riesgos y trampas
- Lo que cuenta como «contabilidad lista» lo validan las contadoras: deja la lista de chequeos en un solo lugar fácil de ajustar.
- `AccountingSettings` guarda ids de cuenta, no códigos; revisa cuáles son requeridos (ver `settings.require(...)` en `invoicing.service.ts`).
- En la base de pruebas no hay año fiscal ni diarios hasta que el e2e los cree (usa `POST /fiscal-years` y `POST /journals/defaults`).
- Este módulo crece en otros PR: cuida que dos paquetes no editen la misma función a la vez (E1b/E1c agregan métodos nuevos, no cambian los tuyos).
- `period-close` debe tolerar un período sin asientos (no lanzar error).

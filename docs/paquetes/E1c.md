# E1c — Datos de ejemplo borrables con un clic

**Carril:** E · **Nivel:** N1 · **Tamaño:** L · **Ola:** 2 · **Rama:** `wp/E1c-ejemplo` · **Asignado (provisional):** IA-E
**Espera a:** **E1b** fusionado (la empresa debe tener la contabilidad base preparada) y a **E1a** (módulo `src/guidance/`).
**Ficha del 2026-10-12** · PLAN-v0.2 v1.1 tarea 2.3 (§9.3, §16.4, §20.2).

## 2. Objetivo
El usuario puede «ver primero cómo se ve» con datos ficticios dominicanos (clientes, facturas, cobros, un banco) y **borrarlos con un clic** sin tocar nada real. Es el **único lugar del sistema que borra documentos contabilizados**, por eso es crítico. Toca R2 (excepción documentada), R3, R5.

## 3. Lee antes
- Base: `CLAUDE.md`; `AGENTS.md` (si existe); `docs/PAQUETES-DE-TRABAJO.md` §1 y §4; `docs/GUIA-PRODUCTO.md` P2; `docs/GUIA-CONTABLE-FISCAL.md` R2, R3, §8.
- **`docs/PLAN-v0.2.md` §9.3 («Datos de ejemplo borrables»), §13.2 (aislamiento), §16.4, §20.2 (riesgo «borrado toca datos reales»).**
- Código: lo de `src/guidance/` (E1a/E1b); `src/invoicing/invoicing.service.ts` (`create`, `issue`), `src/receivables-payables/payments.service.ts`, `src/treasury/treasury.service.ts`, `src/masters/partners/partners.service.ts`, `src/masters/ncf/ncf.service.ts`; `prisma/schema.prisma` (relaciones entre `Invoice`, `JournalEntry`, `Payment`, `PaymentAllocation`, `BankTransaction`, `Attachment`, `NcfSequence` — **mira qué impide borrar cada una**); `src/common/audit.ts`; `test/security.e2e-spec.ts` (regresión «escrituras por id con companyId»).

## 4. Alcance (verificado)
- **Modificar:** `src/guidance/guidance.controller.ts` y `guidance.service.ts`: `POST /guidance/sample-data` y `DELETE /guidance/sample-data` (solo ADMIN); `guidance.module.ts` (importar `InvoicingModule`, `ReceivablesPayablesModule`, `TreasuryModule`, `MastersModule`; ya exportan sus servicios).
- **`prisma/schema.prisma` (caliente, al final):** modelo `SampleRecord (companyId, entityType, entityId)` + 1 línea de relación en `Company`; migración propia `<fecha>_guidance_sample_records`.
- **Pruebas:** `test/guidance.e2e-spec.ts` (casos de datos de ejemplo).
- Contenido: ≈5 clientes y 3 proveedores ficticios (nombres como «Colmado La Esquina SRL», RNC de formato válido pero ficticio), ≈10 facturas de venta, 5 de compra, 6 cobros/pagos, una cuenta de banco con movimientos; ventas con una secuencia NCF **de ejemplo**.

## 5. No hagas
- **No borres nada que no esté anotado en `SampleRecord`** ni de otra empresa. Usa siempre `companyId` en cada `delete`/`deleteMany`.
- No cargues ejemplos si la empresa ya tiene documentos (422). No uses datos de personas reales.
- No cambies los servicios existentes para saltarte reglas: crea los datos **a través** de ellos.
- No cambies migraciones existentes.

## 6. Pasos sugeridos
1. Modelo `SampleRecord` + migración. `npx prisma generate`.
2. Carga (una transacción cuando sea posible): crea registros con los servicios existentes y anota cada `entityType/entityId`. Fechas dentro de un período **abierto** (relativas a hoy).
3. Borrado (ADMIN): en orden inverso de dependencias (cobros → facturas → asientos → movimientos bancarios → terceros → secuencia), una transacción, un `writeAudit` con el total.
4. Negativas con explicación en español: un documento **real** usa uno de ejemplo (p. ej. un cobro real aplicado a una factura de ejemplo) o un período con ejemplos está **cerrado**.
5. e2e (abajo). Revisa con `security.e2e-spec.ts`.

## 7. Criterios de aceptación
- Cargar solo en empresa **sin documentos** y con la contabilidad base lista; si no, 422.
- Tras cargar: todo queda anotado y **el balance cuadra**.
- Borrar deja la empresa **sin un solo registro de ejemplo** y sin tocar nada real ni de otra empresa (se prueba con datos reales ficticios de la misma empresa y de la B).
- Se **niega** con explicación si un cobro real está aplicado a una factura de ejemplo, o si un período con ejemplos está cerrado.
- Solo ADMIN (ACCOUNTANT/APPROVER/VIEWER → 403). Queda `AuditLog` de la carga y del borrado.
- Si el borrado falla a la mitad, no queda nada a medias.

## 8. Cómo probar
```
docker run -d --name pg-E1c -e POSTGRES_PASSWORD=<clave-local-inventada> -e POSTGRES_DB=fin_e1c -p 55444:5432 postgres:18-alpine
# TU .env local (no se sube): DATABASE_URL=postgresql://postgres:<clave>@localhost:55444/fin_e1c
#   JWT_SECRET=<openssl rand -hex 64>   UPLOADS_DIR=./uploads-e1c
npm ci && npx prisma migrate deploy && npx prisma generate
npm run build && npm test && npm run test:e2e
```

## 9. Entregables y PR
Endpoints + migración + pruebas. PR con: **Qué hice**, **Archivos tocados** (`schema.prisma` marcado), **Decisiones** (orden de borrado, qué impide borrar), **Cómo probar**, **Qué falta** (banner y botón = E2). Seguridad revisa **sí o sí** (puerta de datos reales).

## 10. Riesgos y trampas
- **Riesgo grave:** borrar datos reales. El `deleteMany` debe filtrar por los ids anotados **y** por `companyId`.
- `NcfSequence` es única por `(companyId, ncfType)`: una secuencia B01/B02 de ejemplo choca con la real que el usuario cree después. Define cómo se marca y se limpia (la guía NCF pide borrar los ejemplos primero).
- Los documentos contabilizados enlazan con claves foráneas (líneas, asignaciones, adjuntos): el orden de borrado importa; un `deleteMany` de padre falla si queda un hijo.
- Nada en el código de producción debe volver a borrar contabilizados; no reutilices este borrado en otra parte.
- El contador de la secuencia y los correlativos (`DocumentSequence`, `Journal.nextNumber`) quedan avanzados tras borrar: explícalo en el manual (D2), no intentes «rebobinar».

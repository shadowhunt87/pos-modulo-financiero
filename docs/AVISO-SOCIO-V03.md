# Aviso al socio: archivos tuyos que cambian con la v0.3 (rama `integracion`)

*2026-10-14 · Complementa `docs/AVISO-SOCIO-N1.md`. Todos los cambios están cubiertos por la suite e2e (504 pruebas en verde).*

| Área | Archivos | Qué cambia y por qué |
|---|---|---|
| Esquema | `prisma/schema.prisma` | Modelos nuevos **al final** (parámetros fiscales, 2FA, auditoría, calendario, e-CF, datos de ejemplo); en tus modelos solo líneas de relación en `Company`/`User`, `TaxRate.parameterKey`, `InvoiceLine`/`InvoiceWithholding.appliedRate` y `fiscalParameterId`, `AUDITOR` en `UserRole`, campos de envío en `EcfDocument`. Migraciones nuevas, ninguna existente cambió. |
| Facturación | `invoicing.service.ts` | `build()`: tasa y base del valor fiscal vigente en la fecha del documento (R9). `issueTx`: bloqueo de B vencidas (N5) y emisión e-CF por el proveedor (N7). `void`: mes ya declarado y e-CF rechazado. |
| Asientos | `posting.service.ts`, `accounting.service.ts`, `fiscal-year.service.ts`, `bank-reconciliation.service.ts` | Reverso en lugar de borrar (N1, ver el otro aviso). |
| DGII | `dgii.service.ts`, `dgii.codes.ts` | Umbral del 607 desde el parámetro; banderas e-CF del 607/608 (en 0 todo sale como hoy). |
| Usuarios y acceso | `auth.service.ts`, `auth.controller.ts`, `attempt-limiter.ts`, `users.service.ts`, `users.controller.ts`, DTOs | Verificación en dos pasos, confirmación reforzada (crear usuarios, ascender a ADMIN, restablecer claves), reserva de intentos `consume/refund`, clave actual mala = 422 (ya no cierra la sesión). |
| Bitácora | `common/audit.ts` | `writeAudit` acepta IP/navegador y **quita campos con nombre de secreto** de `changes`; un disparador impide `UPDATE` en `AuditLog`. |
| Otros | `tax-rates.service.ts`, `attachments.*`, `chart-of-accounts.module.ts`, `feedback.controller.ts`, `env.validation.ts`, `app.module.ts`, `docker-compose.prod.yml` | La tasa de un impuesto enlazado no se edita; patrón exacto de claves de adjuntos; se exporta el servicio del catálogo; el AUDITOR puede enviar comentarios; variables nuevas del 2FA y del e-CF. |
| Pruebas tuyas ajustadas | `security`, `users-company`, `auth`, `dgii`, `exports`, `Reports`, `accounting`, `entry-approval`, `invoicing-payments`, `qa-fase1` | Listas de rutas, confirmación reforzada, 401 → 422, reverso visible, y el reloj fijado al anular facturas de un mes ya declarado. |

Si tienes cambios en curso en estos archivos, avísame para unirlos sin pisarnos.

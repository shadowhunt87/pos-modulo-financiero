# Contrato de integración para verticales

> **Versión del contrato: 1.1-borrador** · 2026-10-12 · Autor: Arquitecto (paquete V0)
> **Núcleo verificado:** rama `fase-1`, commit `20613ae` («Plan v0.3 aprobado por Carlos»); `package.json` dice `0.0.1`
> (el núcleo todavía **no tiene número de versión publicado**; ver §4.7).
> **Estado:** v1.0-borrador **aprobado con cambios** por el revisor-crítico; esta v1.1 los incorpora, cada uno verificado
> en el código. Falta la aprobación de Carlos. Hasta entonces V1a, V1b, V2, V3 y V4 no arrancan.
> **Manda sobre:** las fichas `docs/paquetes/V1a.md`, `V1b.md`, `V2.md`, `V3.md` y `V4.md` (§8).
> **Lo leen:** el socio, su IA y quien construya los paquetes V. Está escrito para usarse **sin preguntar**: cuando algo
> todavía no existe en el código lo dice y nombra el paquete que lo construye.

## Qué cambió (v1.0-borrador → v1.1)

| # | Observación del revisor | Cambio | Dónde |
|---|---|---|---|
| A1 | La factura no sabe de qué documento de la vertical viene | V1a agrega `Invoice.sourceModule` e `Invoice.sourceId`; `createInTx` los llena. Regla nueva: la vertical **no guarda** el estado de facturación; lo **lee** de `Invoice` (anulada o cubierta por notas de crédito no cuenta). Ejemplo corregido: sin llave única por mes, bloqueo de la fila del contrato y `anular` que mira el estado real de las facturas. «Ver contrato» desde la factura y su asiento. «Facturas» **avisa**, no bloquea | §3.3, §3.6, §4.4, §5, §7 |
| A2 | Menú y rutas aparecerían para todas las empresas | **Activación por empresa**: dato en el núcleo, guardia en las rutas, filtro del menú y rechazo en `post`. Paquete propio **V4**; ninguna vertical se registra en producción sin él | §3.5, §7.3, §8.5, P4 |
| A3 | El socio tiene **dos** repositorios | §3.1 y P1/P2/P3 reescritos: dos PR coordinados por cambio, Carlos aprueba los del socio (`CODEOWNERS`, PLAN-v0.2 §12.1); propiedad y licencia **antes** que dónde vive | §3.1, §10 |
| A4 | Exigir cliente «activo» en `post` rompería anular | `post` valida solo que cliente y centro de costo sean **de la empresa**; lo «activo» se valida en cada documento. e2e «anular la factura de un cliente desactivado sigue funcionando» (V1b y N1) | §4.1.3, §7.2, §8 |
| A5 | Ciclo de imports en el registro; el manifiesto de prueba no se registraba | Manifiestos en un archivo **de solo datos** (`verticals.registry.ts`) leído por un proveedor global sin imports de módulos; `createApp({ extraModules, extraManifests })` | §4.7.1, §7.1 |
| A6 | Asientos conciliados | `voidEntry` los rechaza (422) hoy y con N1. Documentado, con su entrada de `ayuda.json` en el ejemplo y un caso en V3 | §4.1.5, §5.8, §8.4 |
| M1 | Contradicción sobre esperar a N1 | V1 se parte: **V1a** (no espera a N1) y **V1b** (después de N1), con fechas estimadas | §6, §7, §8 |
| M2 | Faltaban las cuentas de anticipos | Con origen `VERTICAL` se prohíben cuentas con `Account.subledger` `RECEIVABLE`/`PAYABLE`, las de anticipos y las de impuestos | §4.1.3, §7.2 |
| M3 | Depósito aplicado a una factura y cobro en la transacción de la vertical | Dos opciones explicadas (anticipo del núcleo / cuenta propia + `PaymentsService.createInTx`); **decide Carlos** con la contadora | §4.3.8, P9 |
| M4 | Datos sensibles | Manifiesto con `datosSensibles`; si es verdadero, lecturas restringidas por defecto (Ley 172-13, R12) | §4.5.1, §4.7.1 |
| M5 | El nombre `plantilla.rutas.ts` podía usarse para esconder rutas | V3 falla si existe un `*.rutas.ts` fuera de `_plantilla` | §8.4 |
| M6 | Prohibir leer tablas hijas impedía reportes propios | Servicios de lectura por origen en la superficie: `InvoicingService.findBySource` y `PostingService.findBySource` (V1a) | §4.4, §4.7.3 |
| Bajas | Nombres, numeración, costo de borradores, 5 s, F4/F12/F19 | Un solo identificador `alquiler.contrato` para origen y numeración; ocultar «Editar» en filas de numeración de verticales; `build` no valida `costCenterId` (V1b); facturación en lote = una transacción por documento; hechos corregidos | §2, §4.1.2, §4.3.5, §9.1 |
| Nuevo | Fuera de alcance | Sección propia: moneda extranjera, inventario, nómina, facturación recurrente o en lote, documentos no fiscales | §11 |
| Nuevo | Preguntas | Reescritas sin jerga y en el orden pedido | §10 |

Leyenda de estado en todo el documento:
- **HOY**: existe en el código verificado y se puede usar ya.
- **V1a / V1b / V4**: lo construye ese paquete del carril V. Hasta entonces no existe: no programes contra ello como si existiera.
- **N1 / N2a / N2c / N2d / A1 / S2**: cambia o aparece con ese paquete del plan v0.3 o v0.2.

---

## 0. Resumen en diez líneas

1. Una **vertical** es un módulo de negocio de un nicho (por ejemplo, alquiler de equipos) que vive **en los dos
   repositorios del sistema** (backend y frontend), en `src/verticals/<clave>/` y `src/app/features/verticals/<clave>/` (§3.1).
2. Todo lo que **vende o compra con comprobante fiscal** (NCF, ITBIS, retenciones) lo hace creando una **factura del
   núcleo**, marcada con el documento de la vertical del que sale. La vertical **lee** el estado de esa factura; no lo copia.
3. Sus **asientos propios** (depósitos, traspasos, provisiones del negocio) los crea con `PostingService.post`, dentro de
   **su** transacción, con el origen **`VERTICAL`** y un `sourceModule` como `alquiler.contrato` (**V1a**).
4. Ninguna vertical toca el `enum SourceDocumentType`: el valor `VERTICAL` se agrega **una sola vez** en V1a (§3.2).
5. Lo contabilizado **no se edita ni se borra**: se corrige con reverso (`voidEntry`; con **N1** crea el movimiento contrario).
6. Datos propios en tablas con **prefijo** (`Alquiler…`), con `companyId` en **todas**, y migraciones **solo aditivas**.
7. Cada empresa **activa** las verticales que contrató (**V4**); para las demás no existen ni en el menú ni en la API.
8. Permisos con los roles del núcleo; toda escritura con `@Roles`; si maneja datos sensibles, también las lecturas.
9. Cada vertical declara qué **versión del contrato** necesita; el núcleo **no arranca** si no es compatible (**V1a**).
10. La vertical está «conectada» cuando pasa la **suite de contrato** (V3) y la revisión de calidad (§4.10).

---

## 1. Vocabulario

| Palabra | Qué es |
|---|---|
| **Núcleo** | Todo lo que hay hoy: contabilidad, facturación, DGII, bancos, reportes, permisos |
| **Vertical** | Módulo de un nicho que usa el núcleo. Tiene una **clave** corta en minúsculas (`alquiler`) |
| **Documento de la vertical** | Lo que el usuario del nicho crea (contrato, orden, reserva). Manda; el asiento se deriva (R6) |
| **Asiento** | `JournalEntry` + `JournalEntryLine`. Siempre lo crea el núcleo (`PostingService`) |
| **Origen** | De qué documento nació un asiento (`JournalEntry.sourceType` + `sourceId`, + `sourceModule` desde V1a) o una factura (`Invoice.sourceModule` + `sourceId`, V1a) |
| **Identificador de documento** | `<clave>.<documento>`, p. ej. `alquiler.contrato`. Es a la vez el `sourceModule` y el tipo de numeración |
| **Superficie del contrato** | Lo único del núcleo que una vertical puede usar (§4.7.3). Lo demás es interno y puede cambiar sin aviso |

---

## 2. Hechos verificados en el código

| # | Hecho | Dónde |
|---|---|---|
| F1 | `PostingService.post(tx, user, input)` exige la transacción de quien llama; crea el asiento ya **POSTED** (sin borrador); valida ≥ 2 líneas con monto, un solo lado por línea, débitos = créditos, período y año abiertos, cuentas de la empresa, activas, postables y sin subcuentas; numera con el diario del tipo pedido (sin diario: 404 «crea los diarios por defecto (POST /journals/defaults)»); escribe `AuditLog` `POST` en la misma transacción | `src/posting/posting.service.ts` `post` (66–134); `src/masters/journals/journals.service.ts` `findByType` (35–37) |
| F2 | `post` **no** valida que `partnerId` ni `costCenterId` de las líneas sean de la empresa (solo la llave foránea) ni que estén activos | `posting.service.ts` 66–134. `accounting.service.ts` `assertAccountsPostable` (349–391) sí valida centros de costo |
| F3 | Si la fecha no cae en ningún `FiscalPeriod`, `post` lo acepta con `fiscalPeriodId` vacío (solo bloquea período o año **cerrados**) | `posting.service.ts` `periodFor` (47–60) |
| F4 | `voidEntry(tx, user, entryId, reason)` hoy marca `VOIDED`; rechaza con 422 un asiento **conciliado** («No se puede anular un asiento conciliado») y uno de período cerrado | `posting.service.ts` 137–149 (conciliado: 140). Cambia con **N1** (§4.1.5) |
| F5 | `voidJournalEntry` (endpoint de asientos) hoy anula **cualquier** origen salvo `CLOSING`, y también rechaza conciliados. Con **N1** solo admite `MANUAL`, `BANK_TRANSACTION` y `OTHER` | `src/modules/accounting/accounting.service.ts` 543–575 (conciliado: 553); PLAN-v0.3 §4.2 |
| F6 | `enum SourceDocumentType` cerrado de 7 valores: `MANUAL, INVOICE, PAYMENT, BANK_TRANSACTION, CASH_EXPENSE, YEAR_END_CLOSING, OTHER`. `CASH_EXPENSE` no lo usa ningún servicio | `prisma/schema.prisma` 408–416 |
| F7 | `OTHER` ya lo usan las transferencias entre cuentas (sin `sourceId`) | `src/treasury/treasury.service.ts` ~380 |
| F8 | `MastersModule` exporta solo `NcfService, AccountingSettingsService, JournalsService, DocumentSequencesService, PartnersService` | `src/masters/masters.module.ts:28` |
| F9 | `InvoicingService.create(dto, user)` e `issue(...)` abren **su propia** transacción; `issueTx` es privado | `src/invoicing/invoicing.service.ts` 210–225, 276–372 |
| F10 | El asiento de una factura lo arma el núcleo con origen `INVOICE`, diario `SALES`/`PURCHASES`, cuentas de `AccountingSettings` y de cada `TaxRate` | `invoicing.service.ts` `postEntry` (379–456) |
| F11 | 606/607/608 se arman con `prisma.invoice.findMany`, **no** desde los asientos | `src/dgii/dgii.service.ts` 159, 167, 401 |
| F12 | `DocumentSequencesService.next(tx, companyId, docType)` es atómico en la transacción; `docType` es una de 6 **claves** (`INVOICE_SALE, INVOICE_PURCHASE, CREDIT_NOTE, DEBIT_NOTE, PAYMENT_RECEIVED, PAYMENT_MADE`) con prefijos `FV, FC, NC, ND, RC, PG`; `update` responde 404 a una clave desconocida; `list` muestra también las filas guardadas de cualquier clave | `src/masters/sequences/document-sequences.service.ts` 9–16, 27–38, 40–48, 50–51 |
| F13 | `NcfService.consumeNext(tx, companyId, ncfType, issueDate)` es atómico y sin huecos | `src/masters/ncf/ncf.service.ts` 56–78 |
| F14 | `AccountingSettingsService.require(companyId, keys)` devuelve cuentas automáticas o 422 «Falta configurar…»; incluye `customerAdvanceAccountId` y `supplierAdvanceAccountId` (anticipos) | `src/masters/accounting-settings/accounting-settings.service.ts` 11–24, 83–91 |
| F15 | `CostCenter` es un modelo **sin API** | `schema.prisma` 448–459 |
| F16 | `Attachment` admite exactamente un padre de 4: `invoiceId, paymentId, journalEntryId, reconciliationId`; `AttachmentsModule` exporta solo `AttachmentsService` | `src/attachments/attachments.service.ts:15`, `attachments.module.ts:20` |
| F17 | `UserRole` fijo: `ADMIN, ACCOUNTANT, APPROVER, VIEWER` (A1 agrega `AUDITOR`). `RolesGuard` deja pasar si la ruta no tiene `@Roles` | `schema.prisma` 144–149; `src/auth/guards/roles.guard.ts` |
| F18 | «Política de rutas»: toda ruta exige `JwtAuthGuard`; toda escritura declara `@Roles` (salvo `PATCH /users/me`, `POST /auth/login`, `POST /users/me/change-password`); la lista de **lecturas** con `@Roles` es exacta (`/feedback/`, `/users/`, `/users/:id`); un VIEWER recibe 403 en cada ruta que no lo incluye. Recorre **todos** los controladores registrados | `test/security.e2e-spec.ts` 321–374 |
| F19 | Regresión de `companyId`: busca en `src/` el patrón `.update({ where: {...} })` y `.delete({ where: {...} })` sin `companyId`. **No** detecta `updateMany`, `deleteMany`, `upsert` ni consultas en SQL: esas se revisan a mano | `test/security.e2e-spec.ts` 377–403 (regex en ~394) |
| F20 | `createApp()` siempre arranca `AppModule`; no admite módulos extra | `src/app.setup.ts:14` |
| F21 | `verificar-ayuda` exige una entrada en `pantallas` de `ayuda.json` para cada ruta con `loadComponent` de cualquier `*.routes.ts` bajo `src/app`, y la lee solo si `path` y `loadComponent` están **en la misma línea** | `frontend/scripts/verificar-ayuda.mjs` |
| F22 | El origen se lee en: `ledger-detail.generator.ts` 55–82 (SQL con `::text`; enlace solo para `INVOICE`/`PAYMENT`), `labels.ts:23` (`SOURCE_DOC`), `entry-detail.ts` 62 y 139–145 (`sourceLink`), `reports.ts:302` | — |
| F23 | No hay constante, endpoint ni Swagger de versión | búsqueda en `src/` |
| F24 | El frontend usa un kit propio (`styles.css`, `shared/ui`), **sin Tailwind** | PLAN-v0.3 §1 |
| F25 | `writeAudit(tx, user, entityName, entityId, action, changes?)` con `AuditAction` fijo | `src/common/audit.ts`; `schema.prisma` 1089–1100 |
| F26 | `Invoice` **no** tiene campo de origen: no sabe de qué módulo o documento viene | `schema.prisma` 589–649 |
| F27 | Una nota de crédito cuenta contra su factura si su estado no es `DRAFT` ni `VOIDED` (misma regla que usa la emisión para no pasar del total) | `invoicing.service.ts` ~347–352 |
| F28 | Anticipos del núcleo: un cobro (`Payment` `RECEIVED`) con sobrante queda como anticipo en `customerAdvanceAccountId`; `POST /payments/:id/allocate` lo aplica a facturas. Todo cobro exige banco o caja. No hay flujo para **devolver** un anticipo a un cliente | `src/receivables-payables/payments.service.ts` `create` (132–200), `allocate` (208–248) |
| F29 | `Account.subledger` (`RECEIVABLE, PAYABLE, BANK, CASH`) marca las cuentas controladas por un auxiliar | `schema.prisma` `Account` y `SubledgerType` |
| F30 | `InvoicingService.build` no valida `costCenterId` de las líneas, ni en borrador ni al emitir | `invoicing.service.ts` 86–197 |
| F31 | En GitHub el código vive en **dos** repositorios del socio: `finanzas_run` (backend) y `finanzas_run_frontend` (frontend). La carpeta de trabajo de este servidor los tiene juntos | PLAN-v0.2 §12.1 y §12.3 |
| F32 | Prisma corta las transacciones interactivas a los **5 s** por defecto; `PrismaService` no cambia ese valor | `src/prisma/prisma.service.ts` |

---

## 3. Decisiones de arquitectura

### 3.1 Dónde vive el código y cómo entra — **pregunta al socio y a Carlos (P1–P3)**

**Antes de esto se resuelve la propiedad y la licencia del código de la vertical (P1)**: decide si la vertical es de
los dos socios, solo del socio o se licencia al núcleo. Dónde vive el código y quién aprueba los cambios dependen de esa
respuesta.

| Opción | Cómo | A favor | En contra |
|---|---|---|---|
| **A. Dentro de los dos repositorios del sistema (recomendada)** | Backend en `finanzas_run`: `src/verticals/<clave>/`, modelos al final de `prisma/schema.prisma`, migraciones en `prisma/migrations/`. Frontend en `finanzas_run_frontend`: `src/app/features/verticals/<clave>/` | **Una sola transacción** para documento + factura + asiento (R3, R6); mismas pruebas, despliegue, respaldo y exportación | Cada cambio de la vertical son **dos PR coordinados** (uno por repositorio), que se fusionan juntos. Comparte archivos que todos tocan (§4.5, §4.6) |
| B. Paquete aparte que importa el núcleo | El núcleo se publica como librería | Repositorio propio de la vertical | Con tablas propias necesita **otro** esquema y **otra** conexión: pierde la transacción común. Hay que publicar y versionar el núcleo como librería (no existe) |
| C. Servicio aparte que habla por HTTP | Llama a `/invoices`, `/accounting/journal-entries` | Independencia total | **Sin transacción común**: un contrato guardado con su factura fallida queda descuadrado; obliga a reintentos, idempotencia y una cola. `/accounting/journal-entries` crea asientos `MANUAL`, no derivados |

**Recomendación: A.** Consecuencias en palabras sencillas:
- El socio programa la vertical en **los mismos dos repositorios** donde ya trabaja; no hay un tercer sistema.
- Cada entrega de la vertical son **dos pedidos de cambio** (uno del servidor y otro de las pantallas) que se aprueban y se
  unen juntos; si se uniera uno solo, la pantalla llamaría a algo que no existe.
- Con la organización de GitHub (PLAN-v0.2 §12.1, Plan A), el archivo `CODEOWNERS` hace que **Carlos apruebe cada
  cambio del socio** y el socio los de Carlos. Claude revisa antes (calidad y seguridad) y le prepara a Carlos un
  resumen en lenguaje sencillo. Si el socio prefiere el Plan B (copias aparte), es el socio quien une; Carlos solo revisa.

### 3.2 Origen de los asientos de una vertical (`SourceDocumentType`)

**Recomendación (V1a): un valor genérico `VERTICAL` + una columna `JournalEntry.sourceModule String?`.**
- `sourceType = VERTICAL`, `sourceId` = id del documento, `sourceModule` = identificador `<clave>.<documento>`
  (minúsculas, patrón `^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$`, máx. 60).
- Se migra **una vez**: `ALTER TYPE "SourceDocumentType" ADD VALUE 'VERTICAL'` **sola en su carpeta** + otra migración
  con las columnas nuevas. Ninguna vertical vuelve a tocar el enum.
- Reglas en `post` (V1a): `VERTICAL` ⇔ `sourceModule` y `sourceId` presentes; `sourceModule` declarado en el registro
  (§4.7.1); con V4, además, vertical **activa** en la empresa.
- `voidJournalEntry` (endpoint de asientos) **rechaza `VERTICAL` desde V1a** (422 «Este asiento viene de un documento
  de <nombre>: corrígelo desde ese documento»). Con N1 la lista de permitidos (`MANUAL`, `BANK_TRANSACTION`, `OTHER`) lo
  sigue dejando fuera. Así el contador no puede reversar desde «Asientos» un asiento de un contrato y desincronizarlo.

| Alternativa descartada | Por qué no |
|---|---|
| Un valor del enum por vertical | Una migración por vertical, toca `schema.prisma` y `posting.service.ts`, etiquetas y SQL cada vez |
| Usar `OTHER` + `reference` | `OTHER` es de las transferencias (F7) y **se puede reversar desde «Asientos»** (F5); no se distingue de quién es |
| `sourceType` de enum a texto | Cambia una columna del núcleo usada en 15 lugares y pierde la validación de la base |
| Tabla aparte de orígenes | Una consulta más en cada reporte, sin ganancia |

**Lo que hoy depende del enum** (ninguno se rompe al **agregar** un valor; V1a revisa cada uno): `schema.prisma`
408–416 e índice `[companyId, sourceType, sourceId]`; `post` y su `writeAudit`; `ledger-detail.generator.ts` 55–82
(V1a agrega `sourceModule` al `SELECT` y al objeto `source`); `receivables-payables.service.ts` 72 y 83 (solo lectura);
`labels.ts:23` (`SOURCE_DOC.VERTICAL`), `entry-detail.ts` (enlace), `reports.ts:302`; con N1, la lista de permitidos
de `voidJournalEntry` y el reverso, que debe copiar `sourceModule` (ficha N1).

### 3.3 Ventas y compras con comprobante: siempre por `Invoice`, marcada con su origen

Toda operación con **NCF, ITBIS, ISC, propina legal o retenciones** es una **factura del núcleo**: el 606/607/608 sale
de `Invoice` (F11), el NCF se consume al emitir (F13), el impuesto con su vigencia lo calcula `build()` (con **N2c**) y el
asiento lo arma el núcleo (F10). La vertical **no necesita** `TaxRatesService` ni `valueAt` en el backend.

**Origen en la factura (V1a):** `Invoice.sourceModule String?` e `Invoice.sourceId String?` (índice
`[companyId, sourceModule, sourceId]`). `createInTx` los llena; las facturas creadas desde «Facturas» los dejan vacíos.
Las notas de crédito o débito **no** heredan el origen: se encuentran por `relatedInvoiceId`.

**Regla: el estado de facturación se lee, no se copia.** La vertical **no** guarda «facturado», «pagado» ni «anulado».
Lo pregunta con `InvoicingService.findBySource` (§4.4), que dice de cada factura si **vale** (`effective`): emitida, no
anulada y no cubierta por completo por notas de crédito que valen (F27). Así, si la contadora anula una factura o le
hace una nota de crédito desde «Facturas», la vertical lo ve sola, sin quedar desincronizada.

### 3.4 Versión del contrato, no del núcleo

Las verticales dependen de la **superficie** (§4.7.3), no de todo el núcleo. Se versiona el contrato (`mayor.menor`):
compatible si el **mayor es igual** y el **menor del núcleo ≥ el pedido**. Sin librería de versiones.

### 3.5 Activación por empresa (V4)

Sin esto, una vertical registrada aparecería en el menú y en la API de **todas** las empresas.
- **Dato en el núcleo:** tabla `CompanyVertical` (`companyId`, `key`, `active`, `changedAt`, `changedBy`, `note`;
  única por `[companyId, key]`) y su historial de cambios. Sin fila activa, la vertical no existe para esa empresa.
- **Quién activa:** decisión de Carlos (P4). Recomendación: **solo por comando**, que corre devops con autorización de
  Carlos y deja historial (como el cargador de valores fiscales, D25), porque la vertical se vende aparte y el ADMIN de
  un cliente no debe poder activársela solo. El ADMIN ve qué módulos tiene activos en «Empresa».
- **Backend:** decorador de clase `@VerticalKey('<clave>')` en cada controlador de la vertical + `VerticalEnabledGuard`
  (después de `JwtAuthGuard` y `RolesGuard`): si la empresa del token no la tiene activa ⇒ 404 «Este módulo no está
  disponible para tu empresa». `post`, `createInTx` y `nextFor` rechazan (422) un `sourceModule` de una vertical inactiva.
- **API:** `GET /verticals/active` (todos los roles) ⇒ `[{ key, name }]`.
- **Frontend:** `NavGroup.vertical?: string`; el menú oculta los grupos de verticales no activas; `verticalGuard('<clave>')`
  en las rutas de la vertical.
- **Desactivar** no borra nada: los asientos y facturas siguen en los libros y en los reportes; solo se ocultan las
  pantallas y se bloquea crear documentos nuevos.

### 3.6 «Facturas» ante una factura de una vertical: **avisa, no bloquea**

La factura muestra «Esta factura viene del Contrato de alquiler ALQ-000012 · Ver contrato» y, en «Anular» o «Crear nota
de crédito», el aviso «El contrato dejará de contarla como facturada». **No se bloquea** porque corregir un comprobante
fiscal es trabajo de la contadora desde la factura (D34) y la vertical lee el estado (§3.3): no hay nada que
desincronizar. El asiento de la factura muestra el mismo enlace (V1a).

---

## 4. Las reglas, pregunta por pregunta

Cada apartado dice: **regla**, **cómo**, **estado** y **qué prueba lo comprueba** (V3 = suite de contrato).

### 4.1 Asientos

**4.1.1 Importar.** El módulo de la vertical importa `PostingModule` (exporta `PostingService`). **HOY.**

**4.1.2 Quién abre la transacción.** La **vertical**, con `this.prisma.$transaction(async (tx) => { ... })`. Dentro,
en este orden: bloquear la fila del documento si hay que evitar duplicados (§5.5), validar, numerar, guardar el
documento, `writeAudit` del documento, crear la factura o el asiento, enlazar ids. Si algo falla **no queda nada**.
Transacción corta (5 s, F32): nada de HTTP, correo ni archivos dentro. Un proceso «en lote» (facturar 50 contratos)
hace **una transacción por documento**, nunca una para todos: si falla uno, los demás quedan. **HOY.**

**4.1.3 Armar `PostEntryInput` y `PostLine`** (`posting.service.ts` 12–35):

| Campo | Regla para una vertical |
|---|---|
| `date` | La **fecha del documento**. Decide período y año (F1, F3) |
| `description` / `reference` | Español legible / número del documento |
| `journalType` | `GENERAL`, `BANK` o `CASH` si mueve banco o caja, `ADJUSTMENT`. **Prohibidos** `SALES`, `PURCHASES` (facturas), `OPENING`, `CLOSING` (año fiscal). V1a lo valida para `VERTICAL` |
| `type` | Sin indicar (`STANDARD`) o `ADJUSTMENT` |
| `sourceType` / `sourceModule` / `sourceId` | `VERTICAL` / identificador / id del documento (**V1a**) |
| `lines[].debit` / `credit` | `Prisma.Decimal` en moneda base, uno solo > 0 (también lo exige la base: `JournalEntryLine_amounts_check`) |
| `lines[].accountId` | Cuentas de los **ajustes de la vertical** (§4.3.2). **V1b**: con `VERTICAL` se rechazan (422) las cuentas de impuestos (`TaxRate.salesAccountId/purchaseAccountId`), las que tienen `subledger` `RECEIVABLE` o `PAYABLE` (F29), y las de `AccountingSettings` `receivableAccountId`, `payableAccountId`, `customerAdvanceAccountId`, `supplierAdvanceAccountId`. Esas solo se mueven con facturas y cobros/pagos, o el 607, «lo que me deben» y los anticipos dejarían de cuadrar con el mayor. `BANK` y `CASH` sí se permiten |
| `lines[].partnerId` | Cliente o proveedor **de la empresa** (V1b lo valida en `post` para todos los orígenes, F2). Que esté **activo** lo valida el documento al crearse, **no** `post`: si no, no se podría corregir el asiento de un cliente desactivado |
| `lines[].costCenterId` | Solo si existe la API de centros de costo (§4.3.6); V1b valida que sea de la empresa |
| `currency`, `exchangeRate`, `amountForeign` | No usar (§11) |

**4.1.4 Bitácora.** `post` escribe la del asiento. La vertical escribe la de **su documento** con `writeAudit(tx, user,
'<Modelo>', id, AuditAction.<X>, {...})` en la misma transacción, con las acciones existentes. **HOY.**

**4.1.5 Corregir un asiento.** Nunca `update` ni `delete` sobre `JournalEntry`/`JournalEntryLine`.
- **Error de registro**: la vertical llama `this.posting.voidEntry(tx, user, entryId, motivo)` y marca su documento.
  - **HOY:** el asiento queda `VOIDED`. Solo en período abierto.
  - **Con N1:** misma llamada; crea un **reverso** (`REVERSAL`, mismo origen incluido `sourceModule`) y el original
    queda `POSTED`. Opción `{ reverseOn }` para fechar el reverso en un mes abierto. Un `REVERSAL` no se reversa (422);
    dos reversos a la vez ⇒ 409.
  - **Asiento conciliado** con el banco: `voidEntry` responde 422 «No se puede anular un asiento conciliado», **hoy y con
    N1** (F4). La vertical no lo esquiva: explica al usuario que primero deshaga la conciliación de ese movimiento en
    «Conciliación bancaria», o que registre el hecho nuevo (por ejemplo, la devolución del depósito) en lugar de anular.
- **Hecho económico nuevo** (devolver el depósito, cobrar una penalidad): otro asiento con su fecha, no una corrección.
- **Asiento de una factura**: no se toca desde la vertical; la factura se corrige como factura (anulación o, con N1/D34,
  nota de crédito).
- **Asiento de otro módulo o de otra vertical**: nunca.
**Pruebas:** V3 R2 (no hay PATCH/DELETE; reverso con N1; endpoint de asientos 422 sobre `VERTICAL`; conciliado 422).

### 4.2 Tipo de origen

Decisión, alternativas y dependencias en §3.2. Pruebas: V1a `vertical-hooks.e2e-spec.ts`; V3.

### 4.3 Maestros del núcleo

**4.3.1 Clientes y proveedores.** La vertical guarda `partnerId`; no tiene su tabla de clientes. Buscar con
`GET /partners`; crear con el diálogo `features/catalog/partner-dialog.ts` o `POST /partners`. Validar dentro de la
transacción con `tx.partner.findFirst({ where: { id, companyId: user.companyId, active: true } })` **al crear el
documento** (fuera: `PartnersService.get`). Revisar `type` según el lado. En pantalla: «cliente» o «proveedor», nunca
«tercero». **HOY.**

**4.3.2 Cuentas.** Las automáticas con `AccountingSettingsService.require` (**HOY**). Las **propias del nicho** en la
tabla de ajustes de la vertical (`<Clave>Ajustes`), validadas al guardar como `AccountingSettingsService.update`
(empresa, activa, postable, tipo esperado; patrón `SETTINGS_RULES`) y además sin las cuentas prohibidas de §4.1.3. No
se agregan columnas a `AccountingSettings`.

**4.3.3 Impuestos y parámetros con vigencia (R9).** La vertical **no calcula impuestos** (§3.3): pasa `taxRateId` y el
núcleo calcula (hoy con `TaxRate.rate`; **con N2c** con `valueAt` a la fecha, sin que cambie el código de la vertical).
Elegir impuesto en pantalla: `GET /tax-rates`. Vista previa: hoy con `taxRate.rate`; **con N2d** con
`GET /fiscal/tax-rates/effective?date=`. Un valor legal fuera de una factura se pide como clave del catálogo (N2a/N2b)
y se lee con `FiscalParametersService.valueAt` (**N2a**); nunca un número en el código.

**4.3.4 Comprobantes fiscales.** La vertical **nunca** llama `NcfService.consumeNext` (un NCF fuera de una factura no
sale en el 607 ni en el 608). El tipo de NCF lo elige el usuario o sale del cliente; nunca fijo en el código.

**4.3.5 Numeración de documentos propios (R8).** **V1a:** `DocumentSequencesService.nextFor(tx, companyId, docId,
defaultPrefix)`, donde `docId` es el **mismo identificador** del origen (`'alquiler.contrato'`, en minúsculas, así no
choca con las claves del núcleo, que van en mayúsculas). Misma tabla (`docType` ya es texto: sin migración); `next` no
cambia. En «Numeración» esas filas se ven pero **sin botón Editar** (V1a, frontend), porque `update` solo acepta las
claves del núcleo (F12). Una vertical no lleva contadores propios.

**4.3.6 Centros de costo.** No hay API (F15). Si el nicho los necesita: **V1b-opcional** (`GET/POST/PATCH
/cost-centers`, `CostCentersService.assertUsable`, pantalla en Configuración). Si no, no se construye y la vertical no
envía `costCenterId` (P10).

**4.3.7 Adjuntos.** **HOY:** adjuntar a la **factura** o al **asiento** del documento con `POST /attachments` y el
componente `shared/ui/attachments.ts`. No se agrega un quinto padre a `Attachment`. Archivos en documentos sin factura
ni asiento: tabla propia `<Clave>Archivo` reutilizando el almacenamiento, que exige **V1b-opcional** (exportar
`FILE_STORAGE`) y que S2 incluya esos archivos (§8.6).

**4.3.8 Cobros, pagos y depósitos.** Los cobros de facturas son `Payment` del núcleo (pantalla «Cobros y pagos» o
`PaymentsService.create`, que abre su propia transacción). **Aplicar un depósito a una factura impaga, o cobrar dentro de
la transacción de la vertical, no está resuelto hoy.** Opciones (**decide Carlos con la contadora, P9**):

| Opción | Cómo | Costo | Contra |
|---|---|---|---|
| 1. El depósito es un **anticipo del núcleo** | Se registra como cobro sin facturas (queda en la cuenta de anticipos, F28); aplicarlo a una factura es `POST /payments/:id/allocate` | Ninguno en el núcleo | Una garantía que se devuelve no es contablemente un anticipo; y el núcleo **no tiene** cómo devolver un anticipo a un cliente (F28) |
| 2. **Cuenta propia de depósitos** + núcleo nuevo (recomendada si la contadora confirma que la garantía no es anticipo) | Asiento `VERTICAL` al recibirlo (ejemplo §5); V1b agrega `PaymentsService.createInTx(tx, dto, user)` y la posibilidad de que el dinero de un cobro salga de una cuenta indicada (la de depósitos) en lugar de un banco o caja | ≈1–2 días en V1b (archivo del socio) | Toca el servicio de pagos |

Hasta que Carlos decida, la vertical **no** aplica depósitos a facturas: el usuario cobra la factura en «Cobros y pagos»
y devuelve el depósito con un asiento propio.

### 4.4 Reportes, DGII y lectura por origen

| Aparece **solo por postear** | **No** aparece por postear |
|---|---|
| Libro diario, mayor y mayor con documento, balanza, estados de situación y resultados, flujo de efectivo, razones financieras, conciliación bancaria | **606, 607, 608** (salen de `Invoice`, F11), antigüedad de «lo que me deben y lo que debo» (saldo de facturas), IT-1/IR-17 (N6, planificados sobre facturas y retenciones) |

- Vender o comprar con comprobante ⇒ `Invoice` con origen. HOY: `InvoicingService.create(dto, user)` (transacción
  propia, sin origen). **V1a:** `InvoicingService.createInTx(tx, input, user)` = cuerpo actual de `create` sin abrir
  transacción (`create` lo llama); `input` acepta montos `Prisma.Decimal | string | number` y `sourceModule`/`sourceId`
  opcionales (validados como en `post`). Devuelve el id.
- **Lectura por origen (V1a)**, para que la vertical arme sus reportes sin leer tablas hijas del núcleo:
  - `InvoicingService.findBySource(tx, companyId, sourceModule, sourceIds)` ⇒ por factura: `id, number, ncf, type,
    status, issueDate, total, balance, creditedTotal, effective`, más sus notas de crédito y débito.
  - `PostingService.findBySource(tx, companyId, sourceModule, sourceIds)` ⇒ asientos `VERTICAL` del origen con sus
    líneas (`accountId, debit, credit, partnerId, costCenterId`), `status` y, con N1, `reversedBy`.
  - Cualquier otra lectura de tablas hijas del núcleo **no está prevista**; si una vertical la necesita, se pide como
    método nuevo (versión menor).

### 4.5 Permisos, roles, menú, rutas, ayuda y manual

**4.5.1 Rutas del backend.** `@Controller('<clave>/<recurso>')`; en la clase `@UseGuards(JwtAuthGuard, RolesGuard,
VerticalEnabledGuard)` y `@VerticalKey('<clave>')` (V4); **toda escritura** con `@Roles(...)` explícito;
`@CurrentUser()`; `companyId` solo del token; ningún DTO acepta `companyId`; `ParseUUIDPipe`; `class-validator`.
- **Lecturas:** sin `@Roles` (todos los roles, también `AUDITOR`), **salvo datos sensibles**. Si el manifiesto dice
  `datosSensibles: true` (salud, datos personales delicados, finanzas de personas), **toda** lectura lleva `@Roles` con
  los roles que de verdad la necesitan, y esas rutas se agregan a la lista exacta de `security.e2e-spec.ts` en el mismo
  PR. Es lo que pide la Ley 172-13 de protección de datos personales (acceso mínimo, R12). Que el `AUDITOR` lea datos
  sensibles lo decide Carlos con la auditora.
- **Prueba:** «Política de rutas» cubre las rutas de la vertical sin cambios en cuanto está registrada (F18); V3 lo
  repite por prefijo y comprueba `VerticalEnabledGuard`.

**4.5.2 Roles.** La vertical **no crea roles**. Criterio por defecto: crear, editar y facturar ⇒ `ADMIN`,
`ACCOUNTANT`; aprobar ⇒ `ADMIN`, `APPROVER`; anular lo que generó asiento ⇒ `ADMIN`, `APPROVER` (como `void` hoy);
ajustes ⇒ `ADMIN`; ver ⇒ todos (o restringido si hay datos sensibles); `AUDITOR` nunca escribe. Un perfil que solo
use la vertical es un cambio del núcleo con su costo: decide Carlos (P6).

**4.5.3 Menú.** Un grupo en `layout/nav.ts` (archivo compartido: 1 bloque) con `vertical: '<clave>'` (V4) y `roles`
donde corresponda. Posición recomendada: **después de «Panel»** (P7).

**4.5.4 Rutas del frontend.** `features/verticals/<clave>/<clave>.routes.ts`, rutas `'<clave>/...'`, **una por línea**
(F21), `verticalGuard('<clave>')` (V4) y `roleGuard(...)` en las de escritura; una línea en `app.routes.ts` antes de
`'**'`. Kit del núcleo (F24), checklist §6 de la Guía de producto, etiquetas en `features/verticals/<clave>/labels.ts`.
Ningún estilo global ni librería de UI.

**4.5.5 Enlaces «Ver documento» (V1a).** `shared/vertical-sources.ts`: `VERTICAL_SOURCES[<identificador>] = { label,
link }`. Lo usan el detalle del asiento, el mayor con documento y el **detalle de la factura** (aviso de §3.6).

**4.5.6 Ayuda y manual.** `frontend/public/manual/20-<clave>.md` (20 en adelante para verticales); en `ayuda.json`, al
final de cada bloque: `secciones`, una entrada de `pantallas` **por cada ruta**, `campos` `<clave>.<campo>`, y un
`errores` por cada 422 propio **y por los del núcleo que el usuario de la vertical puede ver** (conciliado, período
cerrado si no existe ya). Prueba: `verificar-ayuda` sin errores.

### 4.6 Datos propios

**4.6.1 Dónde.** Bloque al final de `prisma/schema.prisma` con cabecera `// ===== VERTICAL <clave> (contrato v1) =====`.

**4.6.2 Reglas.**
1. **Prefijo** en modelos y enums (`AlquilerContrato`, `AlquilerEstado`).
2. **`companyId` en todas las tablas**, también las hijas.
3. Relación Prisma con `Company`: una línea de relación inversa en `Company` por modelo (único cambio permitido en un
   modelo del núcleo; no crea columnas).
4. A `Partner`, `Invoice`, `JournalEntry`, `Account`, `TaxRate`: **id sin relación Prisma**, validado con `{ id, companyId }`.
5. Llaves únicas **con** `companyId`; entre tablas propias, llave compuesta (`@@unique([id, companyId])` en el padre,
   `@relation(fields: [padreId, companyId], references: [id, companyId])` en la hija).
6. Dinero `Decimal @db.Decimal(19, 4)`; nunca `Float`.
7. **No** columnas que copien estado del núcleo («facturado», «pagado», «anulado» de una factura) (§3.3).

**4.6.3 Migraciones.** `prisma/migrations/<AAAAMMDDhhmmss>_v_<clave>_<qué>/`. Solo aditivas y solo sobre tablas y tipos
con el prefijo; llaves foráneas desde sus tablas hacia el núcleo sí. Prohibido alterar tablas o enums del núcleo o
migraciones existentes. `ADD VALUE` en un enum propio, sola en su carpeta. Cola de fusión de PAQUETES §4. Quién las
escribe: P2.

**4.6.4 Aislamiento.** `companyId` solo del token; lecturas con `where: { companyId }`; escrituras por id con
`{ id, companyId }`: la regresión automática solo vigila `.update(`/`.delete(` (F19), así que `updateMany`,
`deleteMany`, `upsert` y SQL se revisan a mano y V3 los busca; 404 para lo ajeno; todo id del núcleo en un DTO se valida
con su `companyId`. Prueba: V3 aislamiento.

**4.6.5 Respaldos y exportación.** La copia diaria incluye todo. La exportación completa (**S2**) debe detectar los
modelos con `companyId` desde el cliente de Prisma (§8.6).

### 4.7 Versión y compatibilidad

**4.7.1 Registro y versión (V1a).** Sin ciclos de importación:
- `src/verticals/contract-version.ts`: `CORE_CONTRACT_VERSION = { major: 1, minor: 0 }`.
- `src/verticals/vertical-manifest.ts`: el tipo
  ```ts
  export interface VerticalManifest {
    key: string;                                   // 'alquiler' (^[a-z][a-z0-9-]{1,29}$)
    name: string;                                  // 'Alquiler de equipos'
    version: string;                               // versión propia de la vertical
    requiresContract: { major: number; minMinor: number };
    documents: Record<string, string>;             // { 'alquiler.contrato': 'Contrato de alquiler' } (origen y numeración)
    datosSensibles: boolean;                       // §4.5.1
  }
  ```
- Cada vertical tiene `src/verticals/<clave>/<clave>.manifest.ts` que **solo** importa el tipo (nada de módulos ni servicios).
- `src/verticals/verticals.registry.ts`: **archivo de solo datos**, `export const VERTICALS: VerticalManifest[] = [ ... ]`;
  importa únicamente manifiestos.
- `src/verticals/vertical-registry.module.ts`: módulo **global** sin imports de verticales que provee `VerticalRegistry`
  (lista, búsqueda por identificador y comprobación de compatibilidad) construido con `VERTICALS` + los manifiestos
  extra de las pruebas. `PostingService`, `InvoicingService` y `DocumentSequencesService` lo inyectan: no importan
  ningún módulo de vertical, así no hay ciclo (`VerticalsModule → AlquilerModule → PostingModule → VerticalsModule`).
- `src/verticals/verticals.module.ts`: importa los módulos de las verticales (cada una agrega su línea). `app.module.ts`
  importa `VerticalRegistryModule` y `VerticalsModule` una vez.
- Al arrancar, `VerticalRegistry` comprueba cada manifiesto (clave válida y única, identificadores con prefijo
  `<key>.`, contrato compatible). Si no, **el núcleo no arranca** y dice en español qué vertical pide qué versión.
- Pruebas: `createApp({ silent, extraModules, extraManifests })` registra un módulo y su manifiesto sin tocar `VERTICALS`.

**4.7.2 Cómo cambia la versión.** **Menor**: algo nuevo y opcional. **Mayor**: cambiar o quitar algo de la superficie o
un comportamiento del que dependa una vertical; exige este documento actualizado, aviso al socio antes de fusionar y V3
en verde. Hitos: **1.0** = V1a + V4 fusionados (sin V4 ninguna vertical se registra en producción); **1.1** = V1b.

**4.7.3 Superficie del contrato.**

| Pieza | Estado |
|---|---|
| `PostingService.post`, `voidEntry`, `findBySource`; `PostEntryInput`, `PostLine` | `post`/`voidEntry` HOY; `sourceModule` y `findBySource` V1a; `reverseOn` N1 |
| `InvoicingService.createInTx` / `findBySource` / `get` / `void` | `createInTx`, `findBySource` V1a; resto HOY |
| `PaymentsService.create`; `PaymentsService.createInTx` | HOY; `createInTx` solo si Carlos elige la opción 2 (V1b) |
| `PartnersService.get` / `list`; `AccountingSettingsService.require`; `DocumentSequencesService.nextFor` | `nextFor` V1a; resto HOY |
| `CostCentersService.assertUsable`; `FILE_STORAGE` | V1b-opcional |
| `FiscalParametersService.valueAt` (lectura de claves del catálogo) | N2a |
| `writeAudit`, `isUniqueViolation`; `JwtAuthGuard`, `RolesGuard`, `@Roles`, `@CurrentUser`, `AuthUser`, `UserRole` | HOY |
| `VerticalManifest`, `CORE_CONTRACT_VERSION`, `VERTICALS`, `VerticalsModule`, `createApp({ extraModules, extraManifests })` | V1a |
| `@VerticalKey`, `VerticalEnabledGuard`, `GET /verticals/active`, `verticalGuard`, `NavGroup.vertical` | V4 |
| Lectura directa con `{ id, companyId }` de tablas **raíz**: `Partner`, `Account`, `TaxRate`, `Invoice`, `JournalEntry` (cabecera), `FiscalPeriod`, `FiscalYear` | HOY. Nunca tablas hijas: para eso `findBySource` |
| HTTP: `/partners`, `/tax-rates`, `/invoices`, `/payments`, `/attachments`, `/accounting/accounts` (lectura); `/fiscal/tax-rates/effective` | HOY; el último N2d |
| Frontend: kit `shared/ui/*`, `Api`, `Auth.has`, `roleGuard`, `NAV`, formato de `ayuda.json`; `VERTICAL_SOURCES` | HOY; `VERTICAL_SOURCES` V1a |

### 4.8 Lo que una vertical NO puede hacer

| Prohibido | Por qué | Cómo se detecta |
|---|---|---|
| Editar o borrar un asiento, una factura emitida o un pago contabilizado | R2 | V3 R2 + estático |
| Postear en período o año cerrado o «esquivarlo» con la fecha de hoy | R4 | `post` (422); V3 R4 |
| Escribir en tablas del núcleo (`tx.invoice.create`, `tx.journalEntry.update`, `tx.partner.update`…) | R1–R3, R6 | V3 estático |
| Leer tablas hijas del núcleo | Pueden cambiar sin aviso | Revisión; usar `findBySource` |
| Copiar en sus tablas el estado de una factura | Se desincroniza (§3.3) | Revisión; V3 (factura anulada desde «Facturas» ⇒ la vertical la deja de contar) |
| `companyId` que no venga del token; escrituras por id sin `companyId` (incluidos `updateMany`, `deleteMany`, `upsert`) | Aislamiento | `security.e2e-spec.ts` (parcial, F19); V3 |
| Escrituras sin `@Roles`; escritura para `AUDITOR`; lecturas abiertas con datos sensibles | R5, R12 | «Política de rutas»; V3 |
| Controladores sin `VerticalEnabledGuard`; pantallas sin `verticalGuard` | Activación por empresa | V3 |
| Crear roles o tocar `UserRole`, `AuditAction`, `SourceDocumentType` | Matriz de seguridad | V3 estático (migraciones) |
| Valores fiscales en el código (tasas, topes, plazos, tipos de NCF, códigos DGII fijos) | R9 | V3 estático (literales NCF) + revisión |
| Calcular impuestos, o asentar con `VERTICAL` en cuentas de impuestos, de clientes/proveedores o de anticipos | R10 | `post` (V1b); V3 |
| Consumir NCF | R8, R10 | V3 estático |
| `float`/`Number()` para dinero | R7 | V3 R7 + revisión |
| Alterar tablas, enums o migraciones del núcleo | Datos del socio y de las contadoras | V3 estático |
| Reversar asientos ajenos o esquivar el 422 de un asiento conciliado | R2 | V3 |
| Una transacción para muchos documentos | Límite de 5 s; todo o nada mal entendido | Revisión |
| Datos reales antes de S1–S3 | R12, D29 | Revisión de calidad |

### 4.9 Dónde vive el código

§3.1 y preguntas P1–P3 (§10).

### 4.10 Cuándo una vertical está «conectada»

1. Build y todas las pruebas en verde con la vertical registrada.
2. Suite V3 en verde: R1, R2, R3, R4, R5, R7, R8, aislamiento, activación, origen en facturas, conciliado.
3. `security.e2e-spec.ts` en verde sin excepciones nuevas (salvo lecturas restringidas declaradas).
4. Frontend: `ng build`, `ng test`, `verificar-ayuda`; checklist §6 de la Guía de producto en cada pantalla.
5. Por cada documento que genera asiento: e2e con el asiento que espera la contadora y vista previa antes de confirmar (P4).
6. Si vende o compra: la factura sale en el 607/606 y muestra «Ver <documento>».
7. Manifiesto compatible; el núcleo arranca; la vertical solo aparece en las empresas activadas.
8. Revisión de calidad completa (PAQUETES §7) con **seguridad**, y aprobación de Carlos.


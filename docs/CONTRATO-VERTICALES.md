# Contrato de integración para verticales

> **Versión del documento: 1.2 (borrador)** · 2026-10-12 · Autor: Arquitecto (paquete V0)
> **Versión del contrato que describe: 1.0** (`CORE_CONTRACT_VERSION`; vale desde que se fusionan V1a y V4; §4.7.2).
> No confundir las dos: el documento cambia con cada revisión; el número del contrato solo cuando cambia lo que las verticales pueden usar.
> **Núcleo verificado:** rama `fase-1`, commit `20613ae` («Plan v0.3 aprobado por Carlos»); `package.json` dice `0.0.1`
> (el núcleo todavía **no tiene número de versión publicado**; ver §4.7).
> **Estado:** documento 1.0 aprobado con cambios por el revisor-crítico (aplicados en 1.1); 1.1 aprobado con cambios
> menores en la revisión de comprobación (aplicados en 1.2). Falta la aprobación de Carlos. Hasta entonces V1a, V1b, V2, V3 y V4 no arrancan.
> **Manda sobre:** las fichas `docs/paquetes/V1.md` (partida en V1a y V1b), `V2.md`, `V3.md` y `V4.md` (§8).
> **Lo leen:** el socio, su IA y quien construya los paquetes V. Está escrito para usarse **sin preguntar**: cuando algo
> todavía no existe en el código lo dice y nombra el paquete que lo construye.

## Qué cambió (documento 1.1 → 1.2)

| # | Cambio | Dónde |
|---|---|---|
| P1 | Fechas honestas según quién hace cada paquete (V1a: Claude-servidor; V4, V2, V1b, V3: Claude-PC, que los toma **antes** que N4–N6, E1b, E1c y E2) | §6.2, §6.3, P8; PAQUETES §3.1 |
| P2 | La exportación completa (S2) usa un **registro explícito** (`src/data-export/export-registry.ts`): cada vertical agrega ahí sus modelos en su PR; columnas de archivos se llaman `fileUrl` y las de secretos terminan en `Enc` | §4.6.2-8, §4.6.5, §6.1, §8.6 |
| P3 | Si N1 se fusiona antes que V1a, V1a hace que el reverso copie `sourceModule` | §7.1 (a2), §8.6 |
| P4 | El paquete que llegue **segundo** entre V2 y V4 pone `@VerticalKey`, `VerticalEnabledGuard` y `verticalGuard` en la plantilla | §7.3, §8.3 |
| P5 | Apagar una vertical solo impide crear documentos **nuevos**; lo existente se consulta y se corrige (`@AllowWhenInactive`); `post` y `voidEntry` no miran la activación | §3.2, §3.5, §4.7.3, §7.3 |
| P6 | Centro de costo: «de la empresa» en `post` y `build`; «activo» solo al crear o editar un documento | §7.2 (b3) |
| P7 | Etiquetas de quién hace cada paquete (Claude-servidor / Claude-PC) | §6.2, fichas |
| A1+ | «Ver contrato» desde el asiento de una factura lee `Invoice.sourceModule` (en asientos `INVOICE`, `JournalEntry.sourceModule` está vacío) | §7.1 (a9) |

## Qué cambió (documento 1.0 → 1.1)

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
  (§4.7.1). `post` **no** mira si la vertical está activa (eso se controla al crear documentos nuevos, §3.5).
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
  única por `[companyId, key]`) y su historial de cambios. Sin fila activa, la vertical no aparece en el menú y no se pueden crear documentos nuevos; lo ya registrado se consulta y se corrige.
- **Quién activa:** decisión de Carlos (P4). Recomendación: **solo por comando**, que corre devops con autorización de
  Carlos y deja historial (como el cargador de valores fiscales, D25), porque la vertical se vende aparte y el ADMIN de
  un cliente no debe poder activársela solo. El ADMIN ve qué módulos tiene activos en «Empresa».
- **Backend:** decorador de clase `@VerticalKey('<clave>')` en cada controlador de la vertical + `VerticalEnabledGuard`
  (después de `JwtAuthGuard` y `RolesGuard`): si la empresa del token no la tiene activa ⇒ 404 «Este módulo no está
  disponible para tu empresa». Las rutas de **consulta** y de **corrección** de documentos existentes llevan
  `@AllowWhenInactive()` y siguen funcionando con la vertical apagada. `nextFor` y `createInTx` rechazan (422) un
  identificador de una vertical inactiva (no se numeran documentos ni se emiten facturas nuevas). `post` y `voidEntry`
  **no** miran la activación: así se puede corregir lo ya registrado.
- **API:** `GET /verticals/active` (todos los roles) ⇒ `[{ key, name }]`.
- **Frontend:** `NavGroup.vertical?: string`; el menú oculta los grupos de verticales no activas; `verticalGuard('<clave>')`
  en las rutas de la vertical.
- **Desactivar** no borra nada: asientos y facturas siguen en libros y reportes. Se ocultan el grupo del menú y las
  pantallas de creación; el detalle de cada documento sigue accesible desde «Ver documento» en el asiento o la factura
  (rutas con `data: { verticalInactiveOk: true }`, que `verticalGuard` deja pasar).
- **Corregir un depósito de una vertical apagada:** desde el detalle del contrato (ruta permitida), «Anular» o
  «Registrar devolución» funcionan igual que con la vertical encendida, porque esas rutas llevan `@AllowWhenInactive()`
  y `voidEntry`/`post` no miran la activación. El endpoint de asientos sigue rechazando `VERTICAL` (la corrección se hace
  desde el documento). Si la vertical ya no está instalada en el sistema, la única vía es un asiento manual de ajuste
  que haga la contadora (R2 se cumple: no se edita nada).

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
  - `InvoicingService.findBySource(tx, companyId, sourceModule, sourceIds)` (`tx` acepta también `PrismaService` fuera de una transacción) ⇒ por factura: `id, number, ncf, type,
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
8. **Nombres fijos** (las revisiones de seguridad y de la exportación buscan estos nombres en inglés): la columna que
   guarda la clave de un archivo se llama `fileUrl` y su valor sigue el patrón `<companyId>/<clave>/<uuid>`; toda
   columna con un secreto cifrado termina en `Enc` (p. ej. `apiKeyEnc`). Nunca contraseñas ni secretos sin cifrar.

**4.6.3 Migraciones.** `prisma/migrations/<AAAAMMDDhhmmss>_v_<clave>_<qué>/`. Solo aditivas y solo sobre tablas y tipos
con el prefijo; llaves foráneas desde sus tablas hacia el núcleo sí. Prohibido alterar tablas o enums del núcleo o
migraciones existentes. `ADD VALUE` en un enum propio, sola en su carpeta. Cola de fusión de PAQUETES §4. Quién las
escribe: P2.

**4.6.4 Aislamiento.** `companyId` solo del token; lecturas con `where: { companyId }`; escrituras por id con
`{ id, companyId }`: la regresión automática solo vigila `.update(`/`.delete(` (F19), así que `updateMany`,
`deleteMany`, `upsert` y SQL se revisan a mano y V3 los busca; 404 para lo ajeno; todo id del núcleo en un DTO se valida
con su `companyId`. Prueba: V3 aislamiento.

**4.6.5 Respaldos y exportación.** La copia diaria incluye todo. La exportación completa (**S2**) usa un **registro
explícito** de modelos, `src/data-export/export-registry.ts` (anexo S0 §4.2), y una prueba que falla si un modelo de
`Prisma.ModelName` no está en él. Por eso **el PR de la vertical edita ese archivo del núcleo**: una entrada por modelo,
de clase `COMPANY` (todas sus tablas tienen `companyId`), con `excludedColumns` (las que terminan en `Enc`, con motivo),
`jsonColumns` si las hay y, si guarda archivos, `files` con la columna `fileUrl`, la carpeta del ZIP y el patrón exacto
`^<companyId>/<clave>/<uuid>$`. Si falta, la prueba de cobertura de S2 falla y el PR no se une.

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
| `@VerticalKey`, `VerticalEnabledGuard`, `@AllowWhenInactive()`, `GET /verticals/active`, `verticalGuard`, `NavGroup.vertical` | V4 |
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

---

## 5. Ejemplo mínimo completo: vertical ficticia «alquiler de equipos»

Caso: la empresa alquila equipos por mes. Al firmar el contrato **recibe un depósito en garantía** (asiento propio de
la vertical, sin impuestos) y cada mes **factura el alquiler** (factura del núcleo marcada con el contrato; su asiento lo
arma el núcleo). Usa piezas de **V1a** y **V4** (marcadas). Montos, cuentas e impuestos los elige el usuario.

### 5.1 Manifiesto — `src/verticals/alquiler/alquiler.manifest.ts` (V1a; solo importa el tipo)
```ts
import type { VerticalManifest } from '../vertical-manifest.js';

export const ALQUILER_MANIFEST: VerticalManifest = {
  key: 'alquiler',
  name: 'Alquiler de equipos',
  version: '0.1.0',
  requiresContract: { major: 1, minMinor: 0 },
  documents: { 'alquiler.contrato': 'Contrato de alquiler' },
  datosSensibles: false,
};
```

### 5.2 Modelos — bloque al final de `prisma/schema.prisma`
```prisma
// ===== VERTICAL alquiler (contrato v1) =====
// Cuentas propias del nicho; una fila por empresa. Se validan al guardar (empresa, activa, postable, tipo, no prohibida).
model AlquilerAjustes {
  id                     String   @id @default(uuid())
  companyId              String   @unique
  company                Company  @relation(fields: [companyId], references: [id])
  cuentaIngresoId        String?  // INCOME: ingreso por alquiler (si falta, la de Configuración contable)
  cuentaDepositosId      String?  // LIABILITY: depósitos de clientes por devolver
  cuentaCobroDepositosId String?  // ASSET con subledger BANK o CASH: donde entra el depósito
  tipoIngresoDgii        String?  // lo elige el usuario (607); nunca fijo en el código
  updatedAt              DateTime @updatedAt
}

model AlquilerContrato {
  id              String         @id @default(uuid())
  companyId       String
  company         Company        @relation(fields: [companyId], references: [id])
  numero          String         // ALQ-000001 (nextFor 'alquiler.contrato')
  partnerId       String         // cliente del núcleo: id sin relación Prisma, validado con companyId
  equipo          String
  inicio          DateTime
  precioMensual   Decimal        @db.Decimal(19, 4)
  taxRateId       String?        // impuesto elegido por el usuario; la tasa la calcula el núcleo
  ncfType         String?        // elegido por el usuario; si falta, el del cliente
  deposito        Decimal        @default(0) @db.Decimal(19, 4)
  depositoEntryId String?        // asiento del depósito, sin relación Prisma
  estado          AlquilerEstado @default(ACTIVO)
  anuladoMotivo   String?
  createdById     String
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt

  facturas AlquilerFactura[]

  @@unique([companyId, numero])
  @@unique([id, companyId])
  @@index([companyId, estado])
}

// Solo dice a qué MES corresponde cada factura. NO guarda su estado: se lee de Invoice (findBySource).
// Sin llave única por mes: si la factura de un mes se anula o se cubre con nota de crédito, se puede volver a facturar.
model AlquilerFactura {
  id         String           @id @default(uuid())
  companyId  String
  company    Company          @relation(fields: [companyId], references: [id])
  contratoId String
  contrato   AlquilerContrato @relation(fields: [contratoId, companyId], references: [id, companyId])
  periodo    String           // "2026-11"
  invoiceId  String           // Invoice del núcleo, sin relación Prisma
  createdAt  DateTime         @default(now())

  @@unique([companyId, invoiceId])
  @@index([companyId, contratoId, periodo])
}

enum AlquilerEstado {
  ACTIVO
  CERRADO
  ANULADO
}
```
En `model Company` (único cambio en un modelo del núcleo): `alquilerAjustes AlquilerAjustes?`,
`alquilerContratos AlquilerContrato[]`, `alquilerFacturas AlquilerFactura[]`. Migración
`prisma/migrations/<fecha>_v_alquiler_inicial/`: solo `CREATE TYPE "AlquilerEstado"`, `CREATE TABLE "Alquiler…"`,
índices y llaves foráneas desde esas tablas.

### 5.3 Módulo y registro
```ts
// src/verticals/alquiler/alquiler.module.ts
@Module({ imports: [PostingModule, MastersModule, InvoicingModule], controllers: [AlquilerController], providers: [AlquilerService] })
export class AlquilerModule {}

// src/verticals/verticals.registry.ts (V1a; SOLO datos)
export const VERTICALS: VerticalManifest[] = [ALQUILER_MANIFEST];

// src/verticals/verticals.module.ts (V1a)
@Module({ imports: [AlquilerModule] })
export class VerticalsModule {}
```
En producción la vertical se agrega a `VERTICALS` **solo cuando V4 está fusionado**; antes, solo en su rama y sus pruebas.

### 5.4 DTO — `src/verticals/alquiler/dto/contrato.dto.ts`
```ts
const MAX_AMOUNT = 999_999_999_999_999; // mismo tope que las facturas

export class CrearContratoDto {
  @IsUUID() partnerId: string;
  @IsString() @IsNotEmpty() @MaxLength(200) equipo: string;
  @IsDateString() inicio: string;
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.01) @Max(MAX_AMOUNT) precioMensual: number;
  @IsOptional() @IsUUID() taxRateId?: string;
  @IsOptional() @IsString() @MaxLength(3) ncfType?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(MAX_AMOUNT) deposito?: number;
}
export class FacturarMesDto {
  @IsString() @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'periodo: AAAA-MM' }) periodo: string;
  @IsDateString() fecha: string;
}
export class AnularContratoDto {
  @IsString() @IsNotEmpty() @MaxLength(500) motivo: string;
}
```

### 5.5 Servicio — `src/verticals/alquiler/alquiler.service.ts`
```ts
import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { AuditAction, InvoiceType, JournalType, SourceDocumentType } from '../../generated/prisma/enums.js';
import type { AuthUser } from '../../auth/types/auth-user.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { writeAudit } from '../../common/audit.js';
import { PostingService } from '../../posting/posting.service.js';
import { InvoicingService } from '../../invoicing/invoicing.service.js';
import { DocumentSequencesService } from '../../masters/sequences/document-sequences.service.js';
import { AnularContratoDto, CrearContratoDto, FacturarMesDto } from './dto/contrato.dto.js';

type Tx = Prisma.TransactionClient;
const ZERO = new Prisma.Decimal(0);
const DOC = 'alquiler.contrato'; // mismo identificador para origen y numeración (manifiesto)

@Injectable()
export class AlquilerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posting: PostingService,
    private readonly invoicing: InvoicingService,
    private readonly sequences: DocumentSequencesService,
  ) {}

  private async ajustes(tx: Tx, companyId: string) {
    const a = await tx.alquilerAjustes.findUnique({ where: { companyId } });
    if (!a?.cuentaDepositosId || !a.cuentaCobroDepositosId) {
      throw new UnprocessableEntityException('Falta configurar las cuentas de depósitos en Ajustes del alquiler');
    }
    return a as typeof a & { cuentaDepositosId: string; cuentaCobroDepositosId: string };
  }

  /** Bloquea la fila del contrato hasta el fin de la transacción: dos pedidos a la vez se atienden en fila. */
  private async bloquear(tx: Tx, id: string, companyId: string) {
    const r = await tx.alquilerContrato.updateMany({ where: { id, companyId }, data: { updatedAt: new Date() } });
    if (r.count === 0) throw new NotFoundException('Contrato no encontrado');
    return tx.alquilerContrato.findFirstOrThrow({ where: { id, companyId } });
  }

  /** Contrato + (si hay depósito) su asiento: Banco/Caja al débito, Depósitos de clientes al crédito. Todo o nada. */
  async crear(dto: CrearContratoDto, user: AuthUser) {
    const id = await this.prisma.$transaction(async (tx) => {
      const { companyId } = user;
      const cliente = await tx.partner.findFirst({ where: { id: dto.partnerId, companyId, active: true } });
      if (!cliente || cliente.type === 'SUPPLIER') throw new NotFoundException('Cliente no encontrado');
      if (dto.taxRateId && !(await tx.taxRate.findFirst({ where: { id: dto.taxRateId, companyId, active: true } }))) {
        throw new NotFoundException('Impuesto no encontrado');
      }
      const numero = await this.sequences.nextFor(tx, companyId, DOC, 'ALQ'); // V1a
      const deposito = new Prisma.Decimal(dto.deposito ?? 0);
      const c = await tx.alquilerContrato.create({
        data: {
          companyId, numero, partnerId: cliente.id, equipo: dto.equipo, inicio: new Date(dto.inicio),
          precioMensual: new Prisma.Decimal(dto.precioMensual), taxRateId: dto.taxRateId, ncfType: dto.ncfType,
          deposito, createdById: user.id,
        },
      });
      await writeAudit(tx, user, 'AlquilerContrato', c.id, AuditAction.CREATE, { numero, deposito: deposito.toString() });

      if (deposito.gt(0)) {
        const cfg = await this.ajustes(tx, companyId);
        const entry = await this.posting.post(tx, user, {
          date: c.inicio,
          description: `Depósito en garantía ${numero} - ${cliente.name}`,
          reference: numero,
          journalType: JournalType.BANK,
          sourceType: SourceDocumentType.VERTICAL, // V1a
          sourceModule: DOC,                       // V1a
          sourceId: c.id,
          lines: [
            { accountId: cfg.cuentaCobroDepositosId, debit: deposito, credit: ZERO, description: 'Depósito recibido' },
            { accountId: cfg.cuentaDepositosId, debit: ZERO, credit: deposito, partnerId: cliente.id, description: 'Depósito por devolver' },
          ],
        });
        await tx.alquilerContrato.update({ where: { id: c.id, companyId }, data: { depositoEntryId: entry.id } });
      }
      return c.id;
    });
    return this.ver(id, user);
  }

  /** Factura del mes, marcada con el contrato. Un mes cuenta como facturado solo si su factura "vale" (findBySource). */
  async facturarMes(contratoId: string, dto: FacturarMesDto, user: AuthUser) {
    const invoiceId = await this.prisma.$transaction(async (tx) => {
      const { companyId } = user;
      const c = await this.bloquear(tx, contratoId, companyId);
      if (c.estado !== 'ACTIVO') throw new UnprocessableEntityException('El contrato no está activo: no se puede facturar');

      const delMes = await tx.alquilerFactura.findMany({ where: { companyId, contratoId, periodo: dto.periodo } });
      if (delMes.length) {
        const estado = await this.invoicing.findBySource(tx, companyId, DOC, [c.id]); // V1a
        if (estado.some((f) => f.effective && delMes.some((m) => m.invoiceId === f.id))) {
          throw new ConflictException(`El mes ${dto.periodo} de este contrato ya está facturado`);
        }
      }

      const cfg = await tx.alquilerAjustes.findUnique({ where: { companyId } });
      const invoiceId = await this.invoicing.createInTx(tx, { // V1a
        type: InvoiceType.SALE,
        partnerId: c.partnerId,
        issueDate: new Date(dto.fecha),
        ncfType: c.ncfType ?? undefined,
        dgiiIncomeType: cfg?.tipoIngresoDgii ?? undefined,
        notes: `Contrato ${c.numero} · ${dto.periodo}`,
        sourceModule: DOC, sourceId: c.id,               // la factura sabe de qué contrato viene
        lines: [{
          description: `Alquiler de ${c.equipo} · ${dto.periodo}`,
          quantity: 1,
          unitPrice: c.precioMensual,                    // Decimal: no pasa por Number()
          taxRateId: c.taxRateId ?? undefined,
          accountId: cfg?.cuentaIngresoId ?? undefined,
        }],
        issueNow: true,
      }, user);
      const f = await tx.alquilerFactura.create({ data: { companyId, contratoId: c.id, periodo: dto.periodo, invoiceId } });
      await writeAudit(tx, user, 'AlquilerFactura', f.id, AuditAction.CREATE, { contrato: c.numero, periodo: dto.periodo, invoiceId });
      return invoiceId;
    });
    return this.invoicing.get(invoiceId, user);
  }

  /**
   * Anular un contrato registrado POR ERROR. Solo si ninguna de sus facturas vale (anuladas o cubiertas por notas
   * de crédito no cuentan). El asiento del depósito se corrige con voidEntry (VOIDED hoy; reverso con N1).
   * Si ese asiento ya está conciliado con el banco, voidEntry responde 422: el usuario deshace la conciliación o,
   * si el dinero sí entró, registra la devolución del depósito (asiento nuevo) en vez de anular.
   */
  async anular(contratoId: string, dto: AnularContratoDto, user: AuthUser) {
    await this.prisma.$transaction(async (tx) => {
      const { companyId } = user;
      const c = await this.bloquear(tx, contratoId, companyId);
      if (c.estado === 'ANULADO') throw new ConflictException('El contrato ya está anulado');
      const facturas = await this.invoicing.findBySource(tx, companyId, DOC, [c.id]); // V1a
      if (facturas.some((f) => f.effective)) {
        throw new UnprocessableEntityException('El contrato tiene facturas vigentes: corrígelas con una nota de crédito antes de anularlo');
      }
      await tx.alquilerContrato.update({ where: { id: contratoId, companyId }, data: { estado: 'ANULADO', anuladoMotivo: dto.motivo } });
      if (c.depositoEntryId) await this.posting.voidEntry(tx, user, c.depositoEntryId, `Anulación ${c.numero}: ${dto.motivo}`);
      await writeAudit(tx, user, 'AlquilerContrato', contratoId, AuditAction.VOID, { motivo: dto.motivo });
    });
    return this.ver(contratoId, user);
  }

  /** Contrato con el estado REAL de sus facturas (leído del núcleo, no guardado aquí). */
  async ver(id: string, user: AuthUser) {
    const c = await this.prisma.alquilerContrato.findFirst({ where: { id, companyId: user.companyId }, include: { facturas: true } });
    if (!c) throw new NotFoundException('Contrato no encontrado');
    const estado = await this.invoicing.findBySource(this.prisma, user.companyId, DOC, [c.id]);
    return { ...c, facturas: c.facturas.map((f) => ({ ...f, factura: estado.find((e) => e.id === f.invoiceId) ?? null })) };
  }
}
```

### 5.6 Controlador — `src/verticals/alquiler/alquiler.controller.ts`
```ts
@VerticalKey('alquiler')                                           // V4
@UseGuards(JwtAuthGuard, RolesGuard, VerticalEnabledGuard)          // V4
@Controller('alquiler/contratos')
export class AlquilerController {
  constructor(private readonly alquiler: AlquilerService) {}

  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  @Post()
  crear(@Body() dto: CrearContratoDto, @CurrentUser() user: AuthUser) { return this.alquiler.crear(dto, user); }

  @AllowWhenInactive()                                              // V4: consultar lo existente con la vertical apagada
  @Get(':id')
  ver(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) { return this.alquiler.ver(id, user); }

  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  @Post(':id/facturas')
  facturar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: FacturarMesDto, @CurrentUser() user: AuthUser) {
    return this.alquiler.facturarMes(id, dto, user);
  }

  @AllowWhenInactive()                                              // V4: corregir lo existente con la vertical apagada
  @Roles(UserRole.ADMIN, UserRole.APPROVER)
  @Post(':id/anular')
  anular(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AnularContratoDto, @CurrentUser() user: AuthUser) {
    return this.alquiler.anular(id, dto, user);
  }
}
```
(Faltan, por brevedad, la lista paginada y `GET`/`PUT /alquiler/ajustes` con `@Roles(UserRole.ADMIN)`.)

### 5.7 Asientos que resultan (montos de prueba, con un impuesto de prueba del 10 %, no un valor fiscal)

| Asiento | Origen | Débito | Crédito |
|---|---|---|---|
| Depósito (diario de bancos) | `VERTICAL` · `alquiler.contrato` · id del contrato | Banco 5.000 | Depósitos de clientes 5.000 (con cliente) |
| Factura del mes (lo arma el núcleo) | `INVOICE` · id de la factura; la factura lleva `alquiler.contrato` · id del contrato | CxC 11.000 (con cliente) | Ingreso por alquiler 10.000 · Impuesto por pagar 1.000 |

Si la contadora anula esa factura desde «Facturas» (o la cubre con una nota de crédito), `findBySource` la devuelve con
`effective: false`: el contrato muestra ese mes como **no facturado** y se puede facturar de nuevo o anular el contrato.

### 5.8 Frontend y ayuda
```ts
// features/verticals/alquiler/alquiler.routes.ts — una ruta por línea (verificar-ayuda)
export const routes: Routes = [
  { path: 'alquiler/contratos', loadComponent: () => import('./contratos').then((m) => m.Contratos), title: 'Contratos de alquiler', canActivate: [verticalGuard('alquiler')] },
  { path: 'alquiler/contratos/new', loadComponent: () => import('./contrato-form').then((m) => m.ContratoForm), title: 'Nuevo contrato', canActivate: [verticalGuard('alquiler'), roleGuard('ADMIN', 'ACCOUNTANT')] },
  { path: 'alquiler/contratos/:id', loadComponent: () => import('./contrato-detail').then((m) => m.ContratoDetail), title: 'Contrato de alquiler', canActivate: [verticalGuard('alquiler')], data: { verticalInactiveOk: true } },
  { path: 'alquiler/ajustes', loadComponent: () => import('./ajustes').then((m) => m.Ajustes), title: 'Ajustes del alquiler', canActivate: [verticalGuard('alquiler'), roleGuard('ADMIN')] },
];
```
`nav.ts`: `{ title: 'Alquiler de equipos', vertical: 'alquiler', items: [{ label: 'Contratos', path: '/alquiler/contratos' }, { label: 'Ajustes del alquiler', path: '/alquiler/ajustes', roles: ['ADMIN'] }] }`.
`shared/vertical-sources.ts`: `'alquiler.contrato': { label: 'Contrato de alquiler', link: (id) => ['/alquiler/contratos', id] }`.

`ayuda.json` (al final de cada bloque):
```json
"secciones": [ …, { "slug": "alquiler", "archivo": "20-alquiler.md", "titulo": "Alquiler de equipos" } ],
"pantallas": {
  "/alquiler/contratos":     { "seccion": "alquiler", "ancla": "contratos", "siguiente": { "texto": "Crea tu primer contrato", "ruta": "/alquiler/contratos/new" } },
  "/alquiler/contratos/new": { "seccion": "alquiler", "ancla": "crear-un-contrato" },
  "/alquiler/contratos/:id": { "seccion": "alquiler", "ancla": "facturar-un-mes" },
  "/alquiler/ajustes":       { "seccion": "alquiler", "ancla": "ajustes-del-alquiler" }
},
"campos": { "alquiler.deposito": { "texto": "Dinero que el cliente deja como garantía. No es un ingreso: se le devuelve al terminar el contrato.", "seccion": "alquiler", "ancla": "el-deposito" } },
"errores": [
  { "patron": "Falta configurar las cuentas de depósitos", "explicacion": "Antes de recibir depósitos, indica en qué cuenta entra el dinero y en cuál se registra lo que debes devolver.", "enlace": { "texto": "Ir a Ajustes del alquiler", "ruta": "/alquiler/ajustes" } },
  { "patron": "No se puede anular un asiento conciliado", "explicacion": "Ese movimiento ya está conciliado con el estado del banco. Si el dinero sí entró, no anules: registra la devolución del depósito. Si fue un error, primero deshaz la conciliación de ese movimiento.", "enlace": { "texto": "Ir a Conciliación bancaria", "ruta": "/reconciliations" } },
  { "patron": "tiene facturas vigentes", "explicacion": "Un contrato con facturas emitidas no se anula. Corrige cada factura con una nota de crédito y vuelve a intentarlo.", "enlace": { "texto": "Ver facturas", "ruta": "/invoices" } }
]
```
Con `frontend/public/manual/20-alquiler.md` y los títulos «Contratos», «Crear un contrato», «Facturar un mes», «Ajustes
del alquiler» y «El depósito».

### 5.9 Pruebas e2e — `test/alquiler.e2e-spec.ts` (esqueleto de `test/feedback.e2e-spec.ts`)
Dos empresas con sufijo, 4 roles, `createApp({ silent: true })`, alquiler **activo solo en la empresa A** (V4). Casos:
1. Crear contrato con depósito 5.000 ⇒ asiento `VERTICAL`/`alquiler.contrato` cuadrado, `POSTED`, en la balanza; `AuditLog` del contrato y del asiento.
2. Facturar `2026-11` ⇒ factura `ISSUED` con NCF, `sourceModule`/`sourceId` del contrato, en el 607; repetir ⇒ 409; **dos pedidos simultáneos del mismo mes ⇒ uno 201 y otro 409**.
3. Anular esa factura desde «Facturas» ⇒ el contrato la muestra no vigente y el mes se puede volver a facturar.
4. Fecha en período cerrado ⇒ 422 y no queda contrato, número ni `AuditLog`.
5. Sin ajustes ⇒ 422 con el texto de `ayuda.json`.
6. VIEWER ⇒ 403 en `POST`; ACCOUNTANT ⇒ 403 en `anular`.
7. Empresa B ⇒ 404 (vertical no activa); con la vertical activa en B, el contrato de A ⇒ 404 y los ids de A en un DTO ⇒ 404.
7b. Apagar la vertical en A ⇒ crear contrato o facturar 404/422; ver y anular un contrato existente siguen funcionando.
8. Anular con factura vigente ⇒ 422; con la factura cubierta por nota de crédito ⇒ se anula.
9. Asiento del depósito **conciliado** ⇒ `anular` 422 «No se puede anular un asiento conciliado» y nada cambia.
10. `POST /accounting/journal-entries/:id/void` sobre el asiento del depósito ⇒ 422.
11. Montos 0,1 + 0,2 exactos (R7); 10 contratos en paralelo ⇒ números `ALQ-` sin huecos (R8).

---

## 6. Qué está estable hoy, qué cambia y cuándo

### 6.1 Estabilidad por pieza

| Pieza | Hoy | Cambia con | Qué toca el socio |
|---|---|---|---|
| Transacción, `post`, `writeAudit`, guards, `@Roles`, `companyId` | Estable | V1a (`sourceModule`), V1b (reglas de cuentas y de empresa) | Agregar `VERTICAL` + `sourceModule` |
| Clientes, cuentas automáticas, lectura de tablas raíz | Estable | — | Nada |
| Facturar | `create` (transacción propia, sin origen) | V1a (`createInTx` con origen, `findBySource`) | Cambiar la llamada; leer el estado con `findBySource` |
| Impuestos de la factura | `TaxRate.rate` | N2a/N2c | Nada en backend; vista previa con N2d |
| Numeración propia, registro y versión | No existen | V1a | Usarlos; escribir el manifiesto |
| Activación por empresa | No existe | V4 | `@VerticalKey`, guardas, `vertical` en el menú |
| Corregir (`voidEntry`) | Marca `VOIDED`; conciliado ⇒ 422 | N1 (reverso; conciliado sigue 422) | Nada |
| Endpoint de asientos sobre asientos de la vertical | Los anula | V1a (los rechaza) | Nada |
| Factura de mes cerrado o e-CF | Se anula si el período está abierto | N1 (nota de crédito) | Nada: la vertical lee el estado |
| Depósitos aplicados a facturas, cobro en la transacción | No resuelto | Decisión P9 (+ V1b si opción 2) | Según la decisión |
| Rol `AUDITOR` | No existe | A1 | Nada salvo datos sensibles |
| Exportación completa | No existe | S2 | Agregar sus modelos a `export-registry.ts` en su PR (§4.6.5) |
| Datos reales | Prohibido | S1, S2, S3 | — |

### 6.2 Calendario estimado

> **Nota (2026-10-13, propuesta pendiente de Carlos):** la vertical real del socio es el **taller**, una aplicación aparte
> que se integra por API. Para el taller, este calendario y los paquetes V2, V3 y V4 quedan **reemplazados** por
> `docs/INTEGRACION-TALLER.md` (§3 dice qué partes de este contrato siguen valiendo y §6 sus fechas). Este contrato se
> conserva para futuras verticales construidas dentro del núcleo.

Supuestos (PAQUETES §3.1): **V1a** lo hace **Claude-servidor**, intercalado con N1 (los dos van primero en su lista);
**V4, V2, V1b y V3** los hace **Claude-PC**, uno tras otro, **antes** que N4, N5, N6, E1b, E1c, E2 y el resto de su cola,
en cuanto termine lo que ya tiene en curso (A1, E3-back, E4-a, S5, D3). Las dos sesiones pueden compartir el mismo cupo
de uso: si se agota, todo se corre. Cada paquete pasa además por la revisión de calidad (≈2–3 días).

| Paquete | Quién | Depende de | Fechas estimadas | Habilita |
|---|---|---|---|---|
| V0 (este contrato) | Claude-servidor | Carlos aprueba | semana del 12-oct | Todo el carril V |
| N1 | Claude-servidor | D34 | ≈ 19-oct a 6-nov | V1b |
| **V1a** | Claude-servidor | V0 | 26-oct a 6-nov | V4, V2, V1b |
| **V4** | Claude-PC | V1a, P4 | 9-nov a 13-nov | Contrato 1.0; mostrar la vertical en pruebas |
| **V2** | Claude-PC | V1a | 16-nov a 20-nov | V3 |
| **V1b** | Claude-PC | N1, V1a | 23-nov a 27-nov | Contrato 1.1, V3 |
| **V3** | Claude-PC | V1b, V2, V4 | 30-nov a 11-dic | «Vertical conectada» |

**Lo que se le puede prometer al socio:** asientos y facturas conectados **hacia el 7 de noviembre**; su vertical
visible en el ambiente de pruebas **hacia el 16 de noviembre**; pruebas finales **hacia el 11 de diciembre**. Margen
realista: una semana más en cada fecha si el cupo de uso se agota o una revisión devuelve el paquete.

### 6.3 Orden recomendado para el socio (empezar ya)

**Requisito previo:** acuerdo de propiedad y licencia (P1) y acceso a los repositorios (organización de GitHub, punto 2
de Carlos). Sin acceso, trabaja sobre una copia de `fase-1` y lo integra después.

1. **Ya:** nicho y clave; tablas de la vertical con las reglas §4.6 en su rama.
2. **Ya:** pantallas con el kit y el checklist, menú, rutas, ayuda y su `.md`.
3. **Ya:** cómo se arma cada asiento como función pura con pruebas unitarias (la usarán la vista previa y `post`).
4. **Ya:** facturar con `InvoicingService.create` (existe) para probar el flujo, sabiendo que no queda marcado ni es atómico.
5. **Con V1a (≈ 7 de noviembre):** conectar `post` con `VERTICAL`, `createInTx` con origen, `findBySource`, `nextFor`,
   manifiesto y registro (1 a 2 días). **No** usar `OTHER` ni `MANUAL` como atajo: V3 lo rechaza.
6. **Con V4 (≈ 16 de noviembre):** `@VerticalKey`, guardas y menú. Recién entonces la vertical entra en `VERTICALS` y
   puede desplegarse en el ambiente de pruebas.
7. **Con V2 y V1b (≈ 20 a 27 de noviembre):** correr toda la suite; comparar con la plantilla.
8. **Con V3 (≈ 11 de diciembre):** conectar el adaptador y corregir lo que falle.
9. **Datos reales:** solo después de S1–S3.

---

## 7. Huecos del código y quién los cierra

### 7.1 V1a — sin esperar a N1

| # | Hueco | Cambio | Archivos (C = compartido por muchos paquetes) | Riesgo |
|---|---|---|---|---|
| a1 | No hay origen para asientos ni facturas de verticales (F6, F26) | `VERTICAL` en el enum (migración **sola**); otra migración con `JournalEntry.sourceModule`, `Invoice.sourceModule`, `Invoice.sourceId` y el índice `[companyId, sourceModule, sourceId]` | `prisma/schema.prisma` (C), 2 migraciones | Medio |
| a2 | `post` no conoce `sourceModule` | `PostEntryInput.sourceModule?`; reglas de §3.2 y de `journalType`/`type` **solo cuando** `sourceType = VERTICAL`. Nada cambia para los demás llamadores. **Si N1 ya está fusionado**, también hace que el reverso de `voidEntry` copie `sourceModule` (si V1a va primero, lo hace N1) | `src/posting/posting.service.ts` (C) | Medio |
| a3 | El endpoint de asientos anula cualquier origen (F5) | `voidJournalEntry` rechaza `VERTICAL` con 422 «corrígelo desde el documento» | `src/modules/accounting/accounting.service.ts` | Bajo |
| a4 | No se puede facturar en la transacción de otro módulo (F9) | `createInTx(tx, input, user)` con `sourceModule`/`sourceId`; `create` lo llama | `src/invoicing/invoicing.service.ts` (C) | Medio |
| a5 | No hay lectura por origen (M6) | `InvoicingService.findBySource` y `PostingService.findBySource` (§4.4) | mismos archivos | Bajo |
| a6 | Numeración cerrada (F12) | `nextFor(tx, companyId, docId, defaultPrefix)` | `document-sequences.service.ts` | Bajo |
| a7 | No hay versión ni registro (F23) | §4.7.1: `contract-version.ts`, `vertical-manifest.ts`, `verticals.registry.ts` (solo datos), `vertical-registry.module.ts` (global), `verticals.module.ts`; comprobación al arrancar | `src/verticals/*` (nuevo), `src/app.module.ts` (C) | Bajo |
| a8 | `createApp` no admite módulos ni manifiestos de prueba (F20) | `createApp({ silent?, extraModules?, extraManifests? })`; producción sin cambios | `src/app.setup.ts` | Bajo |
| a9 | El origen nuevo no se ve | `ledger-detail` con `sourceModule`; `SOURCE_DOC.VERTICAL = 'Módulo de negocio'`; `shared/vertical-sources.ts`; enlaces en `entry-detail.ts` y `reports.ts`; en el asiento de una factura (`INVOICE`, donde `JournalEntry.sourceModule` está vacío) el enlace «Ver <documento>» sale de `Invoice.sourceModule`/`sourceId`: el detalle del asiento (`GET /accounting/journal-entries/:id`) devuelve además `invoiceSource { sourceModule, sourceId }` cuando el origen es `INVOICE`; en `invoice-detail` el aviso y «Ver <documento>» de §3.6; en `document-sequences.ts`, sin «Editar» para filas de verticales | backend 1 archivo; frontend `labels.ts` (C), 4 archivos + 1 nuevo | Bajo |

Pruebas de V1a: `test/vertical-hooks.e2e-spec.ts` con un módulo y manifiesto de prueba (a8): asiento `VERTICAL` que
cuadra, en mayor, balanza y estados, con `AuditLog`; descuadrado 422; período cerrado 422; `sourceModule` no registrado
o ausente 422; `journalType` `SALES` 422; endpoint de asientos 422; `createInTx` todo o nada y con origen;
`findBySource` con factura anulada y con nota de crédito total ⇒ `effective: false`; `nextFor` sin huecos con 10 en
paralelo; arranque rechaza un manifiesto incompatible; **toda** la suite actual en verde.

### 7.2 V1b — después de N1

| # | Cambio | Archivos | Riesgo |
|---|---|---|---|
| b1 | `post` valida, para **todos** los orígenes, que `partnerId` y `costCenterId` sean **de la empresa** (sin exigir «activo») | `posting.service.ts` (C) | **Alto** (lo usan todos) |
| b2 | Con `VERTICAL`: rechazar cuentas de impuestos, con `subledger` `RECEIVABLE`/`PAYABLE`, y las de CxC, CxP y anticipos de `AccountingSettings` | `posting.service.ts` (C) | Medio |
| b3 | `InvoicingService.build` valida que `costCenterId` sea **de la empresa** en borrador y al emitir (F30); que esté **activo** solo al crear o editar el borrador, no al emitir ni al corregir (misma idea que el cliente en `post`) | `invoicing.service.ts` (C) | Bajo |
| b4 | **Solo si Carlos elige la opción 2 de §4.3.8:** `PaymentsService.createInTx` y cobro desde una cuenta indicada | `payments.service.ts` | Medio |
| b5 | **Opcionales, si el socio los pide (P10):** API de centros de costo; exportar `FILE_STORAGE` | `src/masters/*`, `attachments.module.ts` | Bajo |

Pruebas de V1b: cliente o centro de costo de otra empresa ⇒ 400 en `post` y en facturas; cuentas prohibidas con
`VERTICAL` ⇒ 422; **anular la factura de un cliente desactivado sigue funcionando** (y su reverso con N1); pagos,
tesorería y cierre de año sin cambios.

### 7.3 V4 — Activación por empresa
§3.5: tabla `CompanyVertical` + historial (migración propia), mecanismo de activación según P4, `@VerticalKey`,
`VerticalEnabledGuard`, `@AllowWhenInactive()`, `GET /verticals/active`, rechazo en `createInTx`/`nextFor` (no en `post`
ni en `voidEntry`), `NavGroup.vertical`, filtro del menú, `verticalGuard` (con `data.verticalInactiveOk`), módulos activos
visibles en «Empresa», e2e (activa/inactiva, 404, menú, **corregir un documento existente con la vertical apagada**) y
su ayuda. **Si V2 ya está fusionado**, V4 agrega a la plantilla `@VerticalKey`, los guardas y `verticalGuard` (si V4
llega primero, lo hace V2).

### 7.4 Lo que **no** se construye
Exportar `TaxRatesService`; un quinto padre en `Attachment`; columnas nuevas en `AccountingSettings` o claves nuevas en
`DOC_TYPES`; roles nuevos o permisos por módulo; webhooks o API pública versionada.

---

## 8. Qué piden los paquetes V (y otras fichas afectadas)

### 8.1 V1a
Construye a1–a9 (§7.1). **Claude-servidor**. Nivel N1, tamaño **L**, ola 1, depende de **V0**; **no** espera a N1 (solo toca `voidEntry` si N1 ya está, para copiar `sourceModule`).
Toca `posting.service.ts` e `invoicing.service.ts` (del socio): aviso antes de fusionar. Seguridad revisa.

### 8.2 V1b
Construye b1–b3 y, según decisiones, b4–b5 (§7.2). **Claude-PC**. Nivel N1, tamaño **M**, ola 2, depende de **N1 y V1a**: b1 cambia
`post`, que N1 usa para el reverso, y la prueba «anular la factura de un cliente desactivado» solo tiene sentido con el
reverso real. Seguridad revisa y confirma §9.1.

### 8.3 V2 — Plantilla
Copia la forma de §5 con un documento genérico (`PlantillaDocumento`). Cambios a su ficha: depende de **V1a** (no solo
V0); ubicación `src/verticals/_plantilla/` y `frontend/src/app/features/verticals/_plantilla/`; manifiesto fuera de
`VERTICALS`, registrado en su e2e con `createApp({ extraModules, extraManifests })`; su tabla llega vacía a producción
(se dice en el PR); archivo de rutas `plantilla.rutas.ts` para que `verificar-ayuda` no exija entradas, con la
instrucción de renombrarlo al copiar; usa `findBySource` para el estado de sus facturas; si V4 ya está fusionado usa sus decoradores y guardas; si no, los deja marcados y **V4 los agrega** al fusionarse (§7.3); `docs/plantilla-vertical.md` sigue §6.3.

### 8.4 V3 — Pruebas de contrato
**Claude-PC**. Depende de **V1b, V2 y V4** (V1a llega con ellos); ola 2. Adaptador:
```ts
export interface VerticalContractAdapter {
  key: string; routePrefix: string; writeRoles: UserRole[];
  setup(ctx: ContractCtx): Promise<void>;                                  // ajustes, cuentas, activación
  createDocument(ctx: ContractCtx, who: string, over?: { date?: string; amount?: string }): Promise<{ status: number; id?: string }>;
  entriesOf(ctx: ContractCtx, id: string): Promise<string[]>;              // asientos que generó (propios o de factura)
  invoicesOf?(ctx: ContractCtx, id: string): Promise<string[]>;            // facturas con su origen
  correct?(ctx: ContractCtx, id: string, who: string): Promise<{ status: number }>;
  cleanup(ctx: ContractCtx): Promise<void>;
}
```
Comprueba: R1; R2 (sin PATCH/DELETE; reverso con N1; endpoint de asientos 422; **asiento conciliado ⇒ `correct` 422 y
nada cambia**); R3 (período cerrado ⇒ 422 sin documento ni `AuditLog`); R4; R5 (rutas del prefijo con `@Roles`, VIEWER
403, sin `AUDITOR` en escrituras, lecturas restringidas si `datosSensibles`); R7; R8; aislamiento; activación (empresa sin
la vertical ⇒ 404); origen en facturas (anulada desde «Facturas» ⇒ deja de contar). **Estáticas:** ninguna escritura
`tx.<modeloDelNúcleo>.(create|createMany|update|updateMany|upsert|delete|deleteMany)` en `src/verticals/<clave>/`; ningún
`consumeNext(`; ningún literal de tipo NCF; todo modelo con prefijo tiene `companyId`; las migraciones `_v_<clave>_` solo
tocan tablas y tipos con prefijo; los manifiestos no importan módulos; **falla si existe un `*.rutas.ts` fuera de
`_plantilla`**; todo controlador con `@VerticalKey` y `VerticalEnabledGuard`; toda ruta del frontend con `verticalGuard`.

### 8.5 V4 — Activación por empresa (paquete nuevo)
§7.3. **Claude-PC**. Nivel N1 (permisos y aislamiento), tamaño **M**, ola 1, depende de **V1a** y de la decisión **P4** de Carlos.
Ficha nueva `docs/paquetes/V4.md`.

### 8.6 Otras fichas
- **N1:** el reverso copia `sourceModule` (si V1a ya está fusionado; si N1 va primero, lo agrega V1a, §7.1 a2); la lista de permitidos de `voidJournalEntry` no incluye `VERTICAL`; se conserva
  el 422 de asientos conciliados; e2e «anular la factura (y el pago) de un cliente desactivado sigue funcionando».
- **S2:** registro explícito (`export-registry.ts`) con prueba de cobertura contra `Prisma.ModelName`; las verticales
  agregan sus entradas (§4.6.5). Los patrones de seguridad reconocen archivos por la columna `fileUrl` y secretos por el
  sufijo `Enc`; las verticales deben respetar esos nombres (§4.6.2-8).
- **Tablero:** V1 se reemplaza por V1a y V1b; V4 nuevo; V2 depende de V1a; V3 de V1b, V2 y V4.

---

## 9. Riesgos y deuda

### 9.1 Hallazgo colateral (para seguridad)
`post` no valida que `partnerId` y `costCenterId` sean de la empresa (F2), y `InvoicingService.build` no valida
`costCenterId` ni en borrador ni al emitir (F30): la llave foránea acepta el id de **otra empresa**. Impacto actual bajo
(no hay API de centros de costo), pero sería un hueco de aislamiento con verticales. Lo cierran b1 y b3.

### 9.2 Riesgos
| Riesgo | Impacto | Mitigación |
|---|---|---|
| b1 cambia `post`, que usan todos | Alto | Solo «de la empresa», nunca «activo»; después de N1; suite completa; aviso al socio |
| La IA del socio programa contra algo que aún no existe | Medio | Estado marcado en cada pieza; §6.3 |
| Una vertical asienta impuestos o cuentas de clientes por su cuenta | Alto | §3.3, b2, V3 |
| La vertical copia el estado de una factura y se desincroniza | Alto | Regla §3.3, `findBySource`, V3 |
| Una vertical visible para empresas que no la contrataron | Alto (comercial y de datos) | V4 obligatorio antes de registrarla en producción |
| Dos PR (backend y frontend) fusionados por separado | Medio | Se aprueban y se unen juntos; la revisión los mira juntos |
| Choques en archivos compartidos | Medio | Bloque propio al final; cola de fusión |
| Datos sensibles abiertos a todos los roles | Alto (Ley 172-13) | `datosSensibles` + V3 |
| Datos reales antes de S1–S3 | Grave | Regla de datos reales |

### 9.3 Deuda aceptada
(1) Prefijos de numeración de verticales no editables. (2) Referencias al núcleo sin llave foránea Prisma, compensadas
con validación y V3. (3) Un solo esquema Prisma (se revisa con la segunda vertical). (4) Tabla vacía de la plantilla en
producción. (5) La regresión de `companyId` no cubre `updateMany`/`deleteMany`/`upsert` (F19): V3 lo cubre solo para
verticales.

---

## 10. Preguntas abiertas (en orden, con recomendación)

| # | Para | Pregunta | Recomendación |
|---|---|---|---|
| P1 | Carlos y socio | **¿De quién es el código de la vertical y con qué licencia se usa junto al sistema financiero?** Va primero porque de esto dependen las demás | Dejarlo por escrito antes de unir la primera vertical. Si es de los dos, todo es más simple; si es solo del socio, que la licencia permita venderla junto al sistema y usarla si la relación termina |
| P2 | Carlos y socio | ¿Dónde se guarda el código de la vertical? | En los **mismos dos repositorios** del sistema (servidor y pantallas). Cada cambio de la vertical serán dos pedidos de cambio que se aprueban y se unen juntos |
| P3 | Carlos y socio | ¿Quién aprueba los cambios del socio y quién arma los cambios de la base de datos de su vertical? | Con la organización compartida de GitHub, **Carlos aprueba cada cambio del socio** (y el socio los de Carlos); Claude los revisa antes y le da a Carlos un resumen sencillo. El socio arma los cambios de la base de datos de su vertical; la revisión comprueba que no toquen tablas del sistema |
| P4 | Carlos | ¿Quién enciende la vertical para una empresa? ¿Hace falta antes de la primera venta? | **Sí, antes de la primera venta** (y antes de mostrarla en el ambiente de pruebas). Que la encienda solo el equipo técnico con tu autorización, no el administrador del cliente, porque se vende aparte |
| P5 | Socio | ¿Cuál es el nicho y su nombre corto? | Una palabra en español y minúsculas (`alquiler`, `taller`, `clinica`) |
| P6 | Socio → Carlos decide | ¿Bastan los permisos que existen (administrador, contador, aprobador, solo lectura) o el negocio necesita una persona que solo use la vertical? | Empezar con los existentes; un permiso nuevo es otro trabajo con su costo |
| P7 | Carlos | ¿Dónde va la vertical en el menú? | Justo después de «Panel» |
| P8 | Socio | ¿Aceptas conectar los asientos cuando esté V1a (≈ 7 de noviembre), mostrar la vertical en pruebas cuando esté V4 (≈ 16 de noviembre) y pasar las pruebas finales con V3 (≈ 11 de diciembre), con una semana de margen en cada fecha? Mientras tanto avanzas con tablas, pantallas y cálculos | Sí: así no se construye sobre atajos que luego habría que deshacer |
| P9 | Carlos con la contadora | El depósito en garantía, ¿se trata como un anticipo del cliente o como dinero por devolver en una cuenta propia? ¿Se podrá usar para pagar una factura atrasada? | Cuenta propia, si la contadora confirma que una garantía no es un anticipo; aplicarla a facturas cuesta 1 a 2 días más (§4.3.8) |
| P10 | Socio | ¿Tu negocio necesita repartir ingresos y gastos por sucursal, equipo u obra, o guardar archivos en documentos que todavía no tienen factura? | Si no, no se construye ahora |

---

## 11. Fuera de alcance (decide Carlos si entra después)

| Tema | Por qué queda fuera | Qué hacer mientras tanto |
|---|---|---|
| **Moneda extranjera** en asientos propios (p. ej. depósitos en dólares) | `post` no valida la coherencia de `currency`/`amountForeign`; habría que definir tasa, diferencia cambiaria y devolución | Cobrar en dólares solo con **factura** (la factura maneja moneda y tasa); depósitos solo en pesos |
| **Inventario** (equipos como existencias, costo, salidas) | No existe en el núcleo (Guía contable §5, v1.0) | La vertical lleva su lista de equipos sin efecto contable |
| **Nómina** | No existe (Guía contable §9, «Después») | Fuera |
| **Facturación recurrente o en lote automática** | El núcleo no tiene tareas programadas | Un botón «Facturar este mes» que el usuario pulsa; una transacción por contrato |
| **Documentos no fiscales impresos** (PDF de contrato, orden, recibo) | No hay motor de documentos para verticales; las exportaciones PDF del núcleo son de reportes | Fuera; si se pide, paquete propio con la librería de PDF que ya usa el núcleo |

---

## 12. Historial del contrato

| Versión | Fecha | Cambio |
|---|---|---|
| Documento 1.0 (borrador) | 2026-10-12 | Primera versión (V0), verificada contra `fase-1` @ `20613ae` |
| Documento 1.1 (borrador) | 2026-10-12 | Cambios del revisor-crítico (tabla «Qué cambió») |
| Documento 1.2 (borrador) | 2026-10-12 | Cambios menores de la revisión de comprobación (P1–P7, A1). Pendiente: Carlos |
| Contrato 1.0 | (al fusionar V1a y V4) | `VERTICAL` + `sourceModule`, origen en facturas, `createInTx`, `findBySource`, `nextFor`, registro, activación |
| Contrato 1.1 | (al fusionar V1b) | Validaciones de empresa en `post` y `build`, cuentas prohibidas con `VERTICAL` |

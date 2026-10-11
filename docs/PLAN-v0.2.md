# Plan técnico v0.2 — Experiencia guiada, ayuda integrada, auditoría y análisis financiero

Fecha: 2026-10-10 · Autor: Arquitecto · **Versión 1.1** (v1.0 + cambios del revisor-critico + decisiones de Carlos)
Estado: **revisor-critico: APROBAR CON CAMBIOS (aplicados aquí)** · Decisiones de Carlos incorporadas (sección 18).
Documentos que mandan sobre este plan: `docs/GUIA-PRODUCTO.md` (**obligatoria**, aprobada por Carlos el
2026-10-10) y `CLAUDE.md`. Plan anterior `docs/PLAN.md` (v3.1): **no se reemplaza**.
El veredicto de calidad de cada fase es de `qa`; la aprobación de negocio, de Carlos.

---

## 0. Resumen para Carlos (una página)

**Principio rector: que cualquier persona pueda usar el sistema sin capacitación** (Guía, P7). Cada
pantalla nueva o tocada dice dónde estás, para qué sirve y qué hacer después; las tablas vacías
explican y ofrecen crear el primero; los errores dicen cómo arreglarlos; todo lo guiado **se puede
saltar u ocultar** para quien ya sabe.

**Qué trae la v0.2**
1. **Crear sin salir**: crear o editar el cliente/proveedor desde la factura y desde los cobros/pagos,
   sin perder lo escrito. "Tercero" pasa a "cliente / proveedor" en lo que se toca.
2. **Ayuda dentro del sistema**: manual por tareas, escrito para **el dueño y para la contadora**, y un
   botón "?" en cada pantalla.
3. **Arranque guiado**: asistente de configuración en **5 grupos** con plan de cuentas e impuestos de RD
   precargados, **guía especial para los NCF**, **datos de ejemplo que se borran con un clic**, y la meta
   medida de **primera factura válida en menos de 15 minutos**.
4. **Semáforo financiero**: verde/amarillo/rojo con explicación sencilla, comparación de períodos,
   tendencia e indicadores en el Panel.
5. **Pantallas existentes guiadas**: las adaptamos nosotros (estados vacíos, ayudas, errores con enlace).
6. **Herramientas de auditoría** para las 2 contadoras: encargos, papeles de trabajo, marcas de revisión,
   hallazgos e informe PDF/Excel, con un usuario "Auditor" que no puede tocar la contabilidad.
7. **Respaldos automáticos** con copia fuera del servidor y restauración ensayada (base hecha el 2026-10-10; faltan el cifrado, la copia externa y el aviso, ver 11.2).
8. **"Enviar comentario"** dentro del sistema para que todos los que prueban reporten lo que no entienden.

**Regla de oro (Guía, P10): sin datos reales hasta tener respaldos probados, 2FA y exportación
completa.** La v0.2 deja listos los respaldos; 2FA y exportación completa van en la v0.3. Por lo tanto,
**la v0.2 sigue siendo solo para datos ficticios**.

**Pasa a la v0.3**: DuPont, punto de equilibrio y análisis vertical/horizontal (después de 2FA y la
exportación), y la paleta de búsqueda Ctrl+K.

**Con tu socio**: dejamos de mandarle un paquete al final. **Plan A (el tuyo)**: una **organización de
GitHub** donde ustedes dos son dueños por igual, con sus repos transferidos, la rama principal protegida (cada
cambio necesita la aprobación del otro socio) y un **tablero** con cada tarea del plan asignada a ti, al socio o a
Claude. **Plan B** si él no acepta: copias (forks) de sus repos y un PR por fase. En ambos: **una entrega pequeña
por fase con historial compartido**. Los pasos en GitHub, separados por quién los hace, están en 12.1 y 12.2.

**Tiempo**: **≈12 semanas de trabajo efectivo**, que en calendario son **≈15 a 17 semanas** contando las
esperas por tu socio (revisión de cada PR) y por las contadoras (validaciones que bloquean).

---

## 0.1 Qué cambió en esta versión (1.1) y equivalencia de nombres de fases

| Antes (v1.0) | Ahora (v1.1) | Contenido |
|---|---|---|
| Fase 0 | **Fase 0** | + repos con el socio (organización o forks) y **respaldos** (P10) |
| Fase 1A | **Fase 1** | Crear sin salir, Ayuda, base guiada (más liviana), Enviar comentario |
| Fase G1 | **Fase 2** | Arranque guiado + **datos de ejemplo** + NCF guiado + flujos |
| Fase 1B | **Fase 3** | Semáforo, comparación, Panel |
| Fase G2 | **Fase 4** | Pantallas existentes guiadas (las hacemos nosotros) |
| Fase 2 | **Fase 5** | Auditoría I (ya **no** condicionada) |
| Fase 3 | **Fase 6** | Auditoría II |
| Fase 4 | **v0.3** | DuPont, equilibrio, vertical/horizontal (anexo B) |
| Fase 5 (paquete final) | **Fase 7** | Cierre de versión; ya no hay paquete: un PR por fase |

Cambios del revisor-critico aplicados: P10 respaldos y regla de datos reales (11); P2 datos de ejemplo,
prueba cronometrada, checklist de 5 grupos, NCF guiado (9.3); P3 dos audiencias y prueba con perfil dueño
(9.6, 8.2); P7 "Ocultar ayudas" y "Saltar" (9.5); rol Auditor sin reapertura por el ADMIN, riesgo de
restablecer la clave, sin hablar de "independencia", enum en migración propia (5); historial compartido con
Plan A (organización compartida) y Plan B (forks), y conteo real de archivos (12, 17); menú unificado en un solo lugar (9.4); componentes construidos en la fase
que los usa y un solo archivo de contenido con verificación automática (8.3, 9.2); Fase 4 a v0.3; semanas
efectivas vs. calendario y P1 por fase (3, 19); orden de tablas.

---

## 1. Punto de partida (verificado en el código el 2026-10-10)

| Tema | Estado real |
|---|---|
| Repositorios | El socio tiene **dos** repos: `shadowhunt87/finanzas_run` (backend NestJS) y `shadowhunt87/finanzas_run_frontend` (Angular). Nuestro `carlosjfriast-sketch/modulo-financiero` los juntó (backend en la raíz, frontend en `frontend/`) **sin su historial** (commit `b552cfe`), más 4 cambios propios: `c5efa7c` (lock regenerado + compose de pruebas), `f9a4715` (seguridad nginx/CSP + body 6 MB en `src/app.setup.ts`), `a1d21cf` (guía y plan) y documentación. Hoy el socio **no da permiso de escritura** en sus repos; Carlos le propondrá una organización compartida (12.1). |
| Arquitectura en uso | NestJS 11 + Prisma 7 + Postgres 18, **login propio y 4 roles fijos**, pantallas Angular 22. Distinto de `PLAN.md` v3.1 (Next.js en plataforma, pase firmado). La v0.2 se construye **sobre lo que existe**. Ver deuda 20.1. |
| Respaldos | Base hecha el 2026-10-10 con scripts/backup.sh y cron (ver 11.2). Faltan el cifrado, la copia fuera del servidor y el aviso. |
| Razones | `src/reports/generators/financial-ratios.generator.ts`: 20 razones para `[from, to]`, más un estado con `ebitda`, `ebit`, ingresos, costos y saldos de balance al inicio y al cierre. Rentabilidad **no anualizada** (lo avisa en `warnings`). `FinancialRatioSnapshot` existe en el esquema y **nadie la usa**. |
| Exportación | `src/exports`: `TableDoc` → `renderPdf` (pdfkit) / `renderXlsx` (exceljs), **funciones importables sin tocar el módulo**. En el PDF las celdas se recortan con "..." pero las `notes` de cada sección **se ajustan en varias líneas**. Helvetica: letras con tilde y ñ sí; símbolos como "≥" salen como "?". |
| Adjuntos | `src/attachments`: dueño fijo en 4 campos y subida cerrada a VIEWER. `LocalFileStorage`, `detectFile`, `sanitizeFileName`, `contentDisposition` son **reutilizables sin modificarlos**. |
| Bitácora | `AuditLog` + `writeAudit(...)` dentro de la misma transacción, en 19 archivos. Sin pantalla. El restablecimiento de clave por un ADMIN **ya queda registrado** (`users.service.ts`: `writeAudit(..., 'User', id, UPDATE, { passwordReset: true })`) y **ya invalida las sesiones** (`passwordChangedAt`). |
| Roles | `UserRole` = ADMIN, ACCOUNTANT, APPROVER, VIEWER. `RolesGuard`: sin `@Roles` no restringe. Todas las escrituras declaran roles (lo vigila `test/security.e2e-spec.ts`, "Política de rutas", que además fija que las **únicas** lecturas restringidas son `/users/` y `/users/:id`). Un rol nuevo nace con **lectura total y cero escritura**. |
| Validación | 856 reglas de class-validator en los DTOs, **solo 13 con mensaje en español**: si algo se escapa de la pantalla, llega "partnerId must be a UUID". |
| Configuración inicial | **No existe** plan de cuentas base de RD ni asistente. Sí existen acciones sueltas: `POST /journals/defaults`, `POST /fiscal-years`, `POST /account-classification/auto`. Todos los servicios necesarios están exportados por sus módulos (facturación, pagos, tesorería, maestros, año fiscal, DGII). |
| Usuarios | Un usuario pertenece a **una sola** empresa; el correo es único en todo el sistema; no se borran, se desactivan. |
| Pantallas | ≈33 pantallas (92 archivos en `src/app`). Kit propio en `shared/ui` (`Modal`, `Pagination`, `StatusBadge`, `Combobox`, `ChartView`, `ExportButtons`, `AttachmentsPanel`), estilos en `styles.css`. **No hay Tailwind**: no se introduce. Todas las pantallas tienen `page-head` con título y línea `sub`. |
| Servidor web | `frontend/deploy/nginx.conf`: `.png` en caché **un año**; una ruta inexistente devuelve `index.html` (200). CSP: `default-src 'self'; script-src 'self' + hash; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:`. |
| Despliegue | El contenedor `migrate` corre `prisma migrate deploy` antes de la API. |
| Suelto | `test/budgets.e2e-spec (1).ts` no se ejecuta (nombre fuera del patrón). Se avisa al socio. |

---

## 2. Convenciones del socio que se respetan

La v0.2 llega al socio en PRs por fase: **tiene que parecer escrita por él**. Cada desarrollador **imita**
estos ejemplos; revisor-critico y qa rechazan lo que se aparte sin justificación escrita.
(Rutas: **[back]** = repo `finanzas_run`, **[front]** = repo `finanzas_run_frontend`.)

### 2.1 Backend

| Convención | Ejemplo existente a imitar | Regla para la v0.2 |
|---|---|---|
| Módulo por carpeta | [back] `src/budgets/` = controller, service, module y `dto/budget.dto.ts` | `src/auditing/`, `src/financial-analysis/`, `src/guidance/`, `src/feedback/` con la misma forma |
| Imports ESM con `.js` | `import { BudgetsService } from './budgets.service.js';` | Siempre |
| Guards en la clase | `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Controller('budgets')` | Igual |
| Roles por ruta | `@Post() @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)` | Toda escritura con `@Roles` explícito; nunca `Object.values(UserRole)` |
| Usuario actual | `@CurrentUser() user: AuthUser`; `companyId` solo de `user.companyId` | Ningún DTO acepta `companyId` |
| Validación | class-validator (`@IsString() @MinLength(2) @MaxLength(120)`), `ValidationPipe` con `whitelist` + `forbidNonWhitelisted` | Igual; textos largos con `@MaxLength`; ids con `ParseUUIDPipe`; fechas `@IsDateString()` |
| Bitácora en la misma transacción | [back] `attachments.service.ts`: `$transaction(async (tx) => { ...; await writeAudit(tx, user, 'Attachment', row.id, AuditAction.CREATE, {...}); })` | Toda escritura nueva; acciones existentes, **sin tocar `AuditAction`** |
| Empresa en escrituras | `tx.account.update({ where: { id, companyId: user.companyId } })` (vigilado por el test de regresión) | Igual |
| 404 si es de otra empresa | `findFirst({ where: { id, companyId } })` → `NotFoundException('... no encontrado')` | Igual |
| Bloqueo de lo cerrado | `UnprocessableEntityException('El período fiscal "X" está cerrado')` | Encargo cerrado ⇒ 422 en español |
| Duplicados | `isUniqueViolation(e)` → `ConflictException` | Igual |
| Correlativos | `Journal.nextNumber` dentro de la transacción | Hallazgos H-001... con `nextFindingNumber` |
| Decimales | `Prisma.Decimal`, `ZERO`, `dec()`; `toDecimalPlaces(4)`; `null` + `note` si el denominador es cero | Igual |
| "Quién" sin relación | `FiscalYear.closedById String?` | Para no tocar el modelo `User` |
| Generadores | `FinancialRatiosGenerator` inyecta `BalanceSheetGenerator` e `IncomeStatementGenerator` | Se inyectan; no se copia lógica |
| Exportaciones | builders `Section[]` + `renderPdf/renderXlsx`; cabeceras de `ExportsController.send` | Builders propios; mismas cabeceras |
| Comentarios | En español, explican el porqué | Igual |
| e2e | [back] `test/financial-ratios.e2e-spec.ts`: `createApp({ silent: true })`, dos empresas con sufijo, `bcrypt.hash(password, 4)`, `token[rol]`, helper `api(...)`, montos a mano en el comentario, limpieza en `afterAll` | Mismo esqueleto |
| Migraciones | Carpetas `prisma/migrations/<fecha>_<nombre>/migration.sql`, solo aditivas | Igual; **`ALTER TYPE ... ADD VALUE` en su propia migración** |

### 2.2 Frontend

| Convención | Ejemplo existente a imitar | Regla para la v0.2 |
|---|---|---|
| Componentes | [front] `dashboard.ts`: `ChangeDetectionStrategy.OnPush`, `imports: [RouterLink, ...UI]`, `signal()`/`computed()`, `inject()` | Igual; sin `NgModule`, sin zone; RxJS solo `firstValueFrom` |
| Rutas por área | `features/reporting/reporting.routes.ts` con `loadComponent`; áreas en `app.routes.ts` con `loadChildren` | Áreas nuevas `audit`, `help`, `setup` |
| Menú | `layout/nav.ts`, `NavItem.roles` | Un solo cambio de menú, definido en 9.4 |
| Guardas | `roleGuard(...roles)` | Igual |
| Etiquetas | `shared/labels.ts` (+ `tone()`, `opts`) | Todo lo nuevo ahí, **al final** del archivo |
| API y errores | `Api.getP<T>`, `api.download`, `errorMessage(e)`, `Notify` | Igual |
| Gráficas | `<app-chart [config]="chart()" />` | Igual |
| Exportar | `<app-export-buttons [path] [query] name />` | Igual, apuntando a rutas nuevas |
| Dinero | `decimal.js` vía `shared/format.ts`; pipes `money`, `fdate`, `lbl`, `signClass` | Nunca `Number()` para sumar dinero |
| Estilos | Clases de `styles.css`; estilos locales cortos | Ningún estilo global nuevo; sin librerías de UI |
| Botones según rol | `@if (auth.has('ADMIN', 'ACCOUNTANT'))` | Igual |
| Pantalla de referencia | `features/catalog/partners.ts` ("PANTALLA DE REFERENCIA") | Las nuevas siguen su esquema |

### 2.3 Librerías nuevas
- **Backend: ninguna.**
- **Frontend: solo `marked`** (Markdown → HTML) para la Ayuda: MIT, cero dependencias, mantenida desde
  2011, sin CDN, cargada **solo** al abrir la Ayuda; el HTML pasa por el limpiador de Angular
  (`[innerHTML]`) y la CSP prohíbe scripts en línea. Aprobada por Carlos (D11).
- **Servidor (no es dependencia de la app)**: para los respaldos, `gnupg` (cifrado) y `rclone` (copia fuera
  del servidor, MIT), en una imagen propia basada en `postgres:18-alpine`. Las valida seguridad.
Cualquier otra: el desarrollador se detiene y lo consulta con justificación escrita.

---

## 3. Validación contra la Guía de producto

### 3.1 Qué parte de la promesa (P1) mejora cada fase
Promesa: *"La contabilidad de tu empresa **en orden** y **al día con la DGII**, **sin tener que ser
contador**, y **con tu contador trabajando en el mismo lugar**."*

| Fase | Parte de la promesa | Principios de la Guía |
|---|---|---|
| 0 Preparación, repos, respaldos | Base de **confianza** para todo lo demás (los datos no se pierden) | P10 |
| 1 Crear sin salir, Ayuda, base guiada, comentarios | **Sin tener que ser contador** | P7, P3, P6 |
| 2 Arranque guiado, ejemplos, NCF guiado, flujos | **En orden** desde el día 1 y **al día con la DGII** (NCF bien configurados), **sin ser contador** | P2, P7, P11 |
| 3 Semáforo, comparación, Panel | **En orden**: el dueño entiende la salud de su empresa **sin ser contador** | P3, P6 |
| 4 Pantallas existentes guiadas | **Sin tener que ser contador**, en todo el sistema | P7, P6 |
| 5–6 Auditoría | **Con tu contador trabajando en el mismo lugar** | P9 |
| 7 Cierre | — (calidad, revisión final) | P10 |

### 3.2 Checklist de la Guía (sección 6) en cada pantalla nueva o tocada
Se aplica completo. Notas de cómo se cumple aquí: migas y propósito (9.2); acción principal en el mismo
lugar (9.4); estados vacíos (9.2); errores (9.6); botón "?" (8); términos difíciles con explicación (9.2);
montos y estados con **icono + color + texto** (`StatusBadge` del kit gana un ícono en la Fase 4); crear sin
salir (7); celular a 375 px; teclado (Tab, Enter guarda, Esc cierra); prueba de usuario nuevo (9.7);
convenciones del socio (2).

### 3.3 Divergencias con la Guía, dichas explícitamente
- **Ctrl+K (P8)** y **2FA/exportación completa (P10)** quedan en la v0.3, como dice la propia Guía (sección 7).
- **"Bitácora visible para el administrador" (P10)**: la v0.2 solo muestra el historial **de un documento**
  al auditor (O1) y los restablecimientos de clave del usuario auditor (5.6). El visor general queda para
  la v0.3 (Carlos no lo eligió para la v0.2).
- **Usuario en varias empresas / portal del contador (P9)**: no en v0.2; una auditora con varias empresas
  usa un correo por empresa (deuda, D2).

---

## 4. Recomendación y alternativas descartadas

### 4.1 Recomendación (en lenguaje de negocio)
Todo lo nuevo va en **módulos y archivos nuevos**; lo existente se toca lo mínimo y se entrega al socio en
PRs pequeños por fase. La experiencia guiada se logra con **mecanismos globales** (barra superior, un
traductor de errores) y **piezas pequeñas del kit**, no rediseñando pantallas. Las 20 razones existentes no
se tocan. La auditoría es un módulo aparte: lo que escribe la auditora **nunca** modifica la contabilidad.

### 4.2 ¿VIEWER o rol nuevo AUDITOR? → **AUDITOR** (aprobado, D1)

| | Usar VIEWER | Rol nuevo AUDITOR |
|---|---|---|
| Leer la contabilidad | Sí | Sí (automático) |
| Escribir en auditoría | Habría que dárselo a **todo** VIEWER | Solo el auditor |
| Escribir en la contabilidad | No | No (prueba automática sobre todas las rutas, también las futuras del socio) |
| Separación de funciones y trazabilidad | Mezcla personal de la empresa con la auditora | Clara; cada acción queda a su nombre |
| Costo | 0 | 1 línea de esquema + migración propia + 2 archivos de pantalla con 1 línea |

**Lo que el sistema NO garantiza** (se dice tal cual, sin hablar de "independencia"): el ADMIN de la empresa
administra los usuarios, así que puede desactivar a la auditora o restablecer su clave. El sistema da
**trazabilidad**: esas acciones quedan registradas y la auditora las ve (5.6).

### 4.3 Alternativas descartadas
| Alternativa | Por qué no |
|---|---|
| Entregar al socio un paquete al final | Choques acumulados y sin historial común. Se cambia por una entrega pequeña por fase con historial compartido (12). |
| Pedir al socio permiso de escritura en **sus** repos personales | Él no lo da, y dejaría a Carlos como invitado en código que es de los dos. Plan A: organización con ambos como dueños; Plan B: forks. |
| Deploy keys como acceso de Claude en el Plan A | No permiten abrir PRs ni mantener el tablero. Usuario máquina con rol Write (12.1). |
| Ampliar `Attachment` para los archivos de auditoría | Toca modelo, servicio y DTOs de adjuntos del socio. Tabla propia que **reutiliza** almacenamiento y validación. |
| Modificar `FinancialRatiosGenerator` | Archivo con pruebas a mano y alto riesgo de choque. Se envuelve. |
| Relaciones Prisma a `User` en tablas nuevas | 6–8 líneas en el modelo más sensible. Precedente `FiscalYear.closedById`. |
| Marcas de revisión con una columna por tipo de documento | Relaciones inversas en 4 modelos. `entityType + entityId` como `AuditLog`. |
| Guardar fotos de razones para la tendencia | Se vuelven falsas al reabrir períodos. Cálculo en vivo, medido. |
| Dictamen formal (NIA 700) | Es responsabilidad profesional de la auditora. Se genera un **informe de revisión** (D8). |
| Copiar el formulario de cliente en factura y pago | Se extrae a un componente reutilizable. |
| "Ir a clientes" en la misma pestaña con aviso | Se perdería la factura si se acepta. Otra pestaña (D12). |
| Manual como páginas Angular / sitio aparte / HTML a mano | Cada cambio pasaría por un programador / otra pieza que desplegar / más difícil de escribir. Markdown + `marked`. |
| Botón "?" dentro de cada pantalla | ≈40 archivos del socio. Uno en la barra superior + mapa. |
| Rediseñar pantallas para la experiencia guiada | Semanas y choque seguro. Componentes pequeños insertados. |
| Traducir mensajes en los 856 decoradores o con `exceptionFactory` global | Toca casi todos los DTOs del socio o cambia respuestas que sus pruebas verifican. Traductor en el frontend. |
| Librería de "tours" guiados | Dependencia nueva; `app-stepper` y `app-field-help` alcanzan. |
| Datos de ejemplo en una "empresa de demostración" aparte | Un usuario pertenece a una sola empresa: habría que crear otro usuario. Se cargan en la misma empresa, registrados para borrarlos con un clic. |
| Preferencia "Ocultar ayudas" guardada en el servidor | Tabla y escritura nuevas (y una excepción más en las pruebas de roles) para algo de comodidad. Se guarda en el navegador, por usuario. |
| Comentarios de prueba por un formulario externo (p. ej. Google Forms) | Los datos saldrían del servidor de Carlos (su regla de privacidad) y se perdería el contexto de la pantalla. Se hace dentro de la app. |
| Respaldos con un servicio de pago de terceros | Datos contables fuera de control de Carlos. Copia cifrada antes de salir del servidor. |

---

## 5. A) Herramientas del auditor (`[back] src/auditing/`) — Fases 5 y 6

Quién la usa y la prueba: **las 2 contadoras de prueba** (decisión de Carlos). Ellas validan además las
plantillas de papeles de trabajo (**requisito que bloquea** la Fase 5).

### 5.1 Modelo de datos (tablas nuevas)
Prefijo `Audit` para distinguirlas de `AuditLog`. Todas con `companyId`. `AuditEngagement` declara
`@@unique([id, companyId])` y cada hija se relaciona por **la pareja** `(engagementId, companyId)` (y los
procedimientos por `(workpaperId, companyId)`): la base de datos impide mezclar empresas. Solo
`AuditEngagement` se relaciona con `Company` (1 línea en `Company`).

**`AuditEngagement`** — encargo: `id, companyId, name (≤120), periodStart, periodEnd, objective?, scope?
(≤5.000), auditorFirm? (≤200), overallConclusion? (≤10.000), status (EngagementStatus: PLANNED,
IN_PROGRESS, IN_REVIEW, CLOSED), nextFindingNumber (1), createdById, closedById?, closedAt?,
reopenReason?, createdAt, updatedAt`. Únicos: `(companyId, periodStart, periodEnd)`, `(id, companyId)`.
Índice `(companyId, status)`.

**`AuditWorkpaper`** — papel de trabajo (área): `id, companyId, engagementId, area (AuditArea:
CASH_AND_BANKS, RECEIVABLES, PAYABLES, REVENUE, EXPENSES, TAXES, EQUITY, FIXED_ASSETS, INVENTORY, OTHER),
reference (≤20, "A", "B"...), title (≤120), objective, conclusion (≤5.000), status (WorkpaperStatus:
PENDING, IN_PROGRESS, DONE), preparedById/At, reviewedById/At, sortOrder`. Único `(engagementId, reference)`.

**`AuditProcedure`** — pasos: `id, companyId, workpaperId, description (≤1.000), done, result? (≤2.000),
doneById, doneAt, sortOrder`.

**`AuditCheckmark`** — marca de revisión: `id, companyId, engagementId, workpaperId?, entityType
(AuditEntityType: JOURNAL_ENTRY, INVOICE, PAYMENT, BANK_RECONCILIATION), entityId (sin llave foránea; el
servicio verifica existencia y empresa), mark (AuditMark: VERIFIED, VOUCHED, RECALCULATED, CONFIRMED,
EXCEPTION), note? (≤2.000), createdById, createdAt, updatedAt`. Único `(engagementId, entityType, entityId)`.

**`AuditFinding`** — notas y hallazgos: `id, companyId, engagementId, workpaperId?, number, kind
(FindingKind: FINDING, NOTE), title (≤200), condition (obligatoria), criteria?, cause?, effect?,
recommendation (≤5.000 c/u), severity? (FindingSeverity: LOW, MEDIUM, HIGH, CRITICAL), managementResponse?,
actionPlan?, responsible? (≤120), dueDate?, respondedById?, respondedAt?, status (FindingStatus: DRAFT,
COMMUNICATED, RESPONDED, RESOLVED, RISK_ACCEPTED), includeInReport (sí), amount? decimal(19,4),
createdById, createdAt, updatedAt`. Único `(engagementId, number)`.

**`AuditFile`** — soportes: `id, companyId, engagementId, workpaperId? / findingId? (exactamente uno),
fileName, fileUrl, mimeType, sizeBytes, uploadedById, uploadedAt`. Clave `${companyId}/auditing/${uuid}`
en `UPLOADS_DIR`. Máximo 50 por papel o hallazgo.

**Migraciones** (todas aditivas, generadas con `prisma migrate dev --create-only` y revisadas a mano):
1. `<fecha>_user_role_auditor/` — **solo** `ALTER TYPE "UserRole" ADD VALUE 'AUDITOR';` (en Postgres un valor
   nuevo de enum no puede usarse en la misma transacción en que se crea; aislarlo además facilita la unión
   con el socio).
2. `<fecha>_auditing/` — enums nuevos, tablas e índices de encargos, papeles, procedimientos y hallazgos (Fase 5).
3. `<fecha>_auditing_marks_files/` — marcas y archivos (Fase 6).

### 5.2 Plantilla de áreas y procedimientos
`src/auditing/audit-templates.ts`: por área, título, objetivo y 3–6 procedimientos en español (p. ej. Caja y
bancos: "Comparar el saldo de cada banco en libros con la conciliación al cierre"; "Revisar partidas en
tránsito de más de 30 días"; "Confirmar saldos con los bancos"). Al crear el encargo se eligen las áreas y se
precargan; todo editable. **Las contadoras validan los textos antes de la Fase 5 (bloquea).**

### 5.3 Endpoints (`@Controller('auditing')`, `JwtAuthGuard + RolesGuard`; AUD = AUDITOR, ADM = ADMIN)

| Método y ruta | Roles | Qué hace |
|---|---|---|
| GET `/auditing/engagements` | ADM, AUD | Lista con conteos por gravedad |
| POST `/auditing/engagements` | ADM, AUD | Crea el encargo y sus papeles desde la plantilla |
| GET `/auditing/engagements/:id` | ADM, AUD | Encabezado + resumen (avance, partidas marcadas, hallazgos) + **avisos de la cuenta auditora** (5.6) |
| PATCH `/auditing/engagements/:id` | AUD | Nombre, objetivo, alcance, firma, conclusión |
| POST `/auditing/engagements/:id/status` | **AUD** | Cambios de estado, incluido **reabrir con motivo**. El ADMIN **no** puede reabrir |
| DELETE `/auditing/engagements/:id` | ADM, AUD | Solo en PLANNED y vacío |
| GET `/auditing/engagements/:id/workpapers` | AUD | Papeles con procedimientos |
| POST `/auditing/engagements/:id/workpapers` | AUD | Área adicional |
| PATCH `/auditing/workpapers/:id` | AUD | Título, objetivo, conclusión, estado |
| POST `/auditing/workpapers/:id/sign-off` | AUD | `{ step: 'PREPARED' \| 'REVIEWED' }`; avisa si revisa quien preparó |
| POST `/auditing/workpapers/:id/procedures` | AUD | Agrega un paso |
| PATCH / DELETE `/auditing/procedures/:id` | AUD | Edita / borra |
| GET `/auditing/engagements/:id/items` | AUD | Partidas del período por tipo, búsqueda, revisadas/pendientes, paginación (≤100), marca y aviso O2 |
| PUT `/auditing/engagements/:id/marks` | AUD | Pone o cambia la marca; 404 si es de otra empresa; 422 si está fuera del período |
| DELETE `/auditing/marks/:id` | AUD | Quita la marca |
| GET `/auditing/history?entityType=&entityId=` | AUD | **O1**: historial de un solo documento desde `AuditLog` |
| GET `/auditing/engagements/:id/findings` | ADM, AUD | ADM no ve DRAFT |
| POST `/auditing/engagements/:id/findings` | AUD | Número correlativo en la misma transacción |
| PATCH `/auditing/findings/:id` | AUD | No en RESOLVED/RISK_ACCEPTED |
| POST `/auditing/findings/:id/communicate` | AUD | DRAFT → COMMUNICATED |
| POST `/auditing/findings/:id/response` | ADM | Respuesta de la gerencia, plan, responsable, fecha → RESPONDED (D4) |
| POST `/auditing/findings/:id/close` | AUD | → RESOLVED o RISK_ACCEPTED con nota |
| DELETE `/auditing/findings/:id` | AUD | Solo DRAFT |
| POST `/auditing/files` | AUD | multipart `file` + `workpaperId` o `findingId` |
| GET `/auditing/files`, GET `/auditing/files/:id/download` | AUD (ADM: solo archivos de hallazgos comunicados) | Lista / descarga con cabeceras de adjuntos |
| DELETE `/auditing/files/:id` | AUD | |
| GET `/auditing/engagements/:id/report?format=pdf\|xlsx` | ADM, AUD | Informe (5.5) |

Reglas: encargo **CLOSED ⇒ todo de solo lectura** (422); cada escritura con `writeAudit`; lecturas con
`@Roles` (ACCOUNTANT, APPROVER y VIEWER reciben 403); nombres de usuarios resueltos en **una** consulta
filtrada por `companyId`.

### 5.4 Estados
```
Encargo:  PLANNED → IN_PROGRESS → IN_REVIEW → CLOSED
                        ↑______________|          |
                        (reabrir con motivo, solo AUDITOR; queda en la bitácora)
Cerrar exige: áreas DONE y ningún hallazgo en DRAFT.
Hallazgo: DRAFT → COMMUNICATED → RESPONDED → RESOLVED | RISK_ACCEPTED
          (la gerencia lo ve y responde desde COMMUNICATED)
```

### 5.5 Informe (PDF y Excel)
`src/auditing/auditing-report.builder.ts` arma un `TableDoc` y llama a `renderPdf/renderXlsx` importados.
Secciones: **Resumen** (empresa, RNC, período, firma, fechas, estado, hallazgos por gravedad; objetivo,
alcance y conclusión como `notes`); **Alcance por área** (avance, partidas revisadas, preparado/revisado;
conclusiones como `notes`); **Hallazgos** (tabla corta + detalle de cada uno en `notes`); **Partidas
revisadas** (conteos; detalle `xlsxOnly`); **Control de la cuenta auditora** (5.6). Sin cerrar: subtítulo
**"BORRADOR — no es el informe final"**. Título "Informe de revisión" (no dictamen, D8). Sin símbolos fuera
del alfabeto latino.

### 5.6 Riesgo: el ADMIN restablece la clave de la auditora (mitigación barata)
Riesgo: el ADMIN de la empresa auditada puede restablecer la clave del usuario AUDITOR (o cambiarle el correo
o el rol) y actuar en su nombre. **Mitigación elegida (sin tocar código del socio):**
1. El restablecimiento **ya** queda en `AuditLog` y **ya** cierra todas las sesiones de la auditora.
2. Al entrar al módulo y en cada encargo, la auditora ve un aviso destacado: "La clave de tu usuario fue
   restablecida por {nombre} el {fecha}. Si no lo pediste, no confíes en lo registrado desde entonces y
   avísalo." Igual para cambios de correo o de rol de su usuario (todo eso ya se registra en `users.service.ts`).
3. Esos eventos salen **siempre** en la sección "Control de la cuenta auditora" del informe: no se pueden
   ocultar (la bitácora no se puede editar desde la aplicación).
Alternativa más fuerte (no elegida porque toca `users.service.ts` del socio): impedir que un ADMIN restablezca
la clave o cambie el correo de un usuario AUDITOR. Se le propone al socio como mejora en su repo.

### 5.7 Opcionales aprobados (D6)
- **O1** — historial de un documento (quién lo creó, aprobó, anuló) desde la lista de partidas.
- **O2** — aviso "cambió después de revisado": si un documento con marca tiene en `AuditLog` un cambio
  posterior a la marca, la lista lo destaca.

---

## 6. B) Análisis financiero (`[back] src/financial-analysis/`) — Fase 3

El módulo importa `ReportsModule` (que exporta los generadores) sin modificarlo.

### 6.1 Modelo de datos
**`RatioThreshold`**: `id, companyId (1 línea en Company), ratioKey, greenAt, redAt (decimal 19,4),
enabled, updatedById, updatedAt`; único `(companyId, ratioKey)`. Sin fila ⇒ valor por defecto del código.
Dirección ("más es mejor" / "menos es mejor") fija en el código.

### 6.2 Semáforo
"Más es mejor": verde si valor ≥ verde; rojo si < rojo; amarillo entre ambos (al revés si "menos es mejor").
Sin valor ⇒ **gris "sin dato"** con la nota del generador. ROA y ROE se evalúan **anualizados** si el período
es menor de 360 días (× 365/días), rotulado. Siempre **icono + color + texto** ("Bien", "Atención", "Riesgo").

Valores por defecto (reglas generales para pymes; **las contadoras los validan antes de la Fase 3: bloquea, D5**):

| Razón | Dirección | Verde | Amarillo | Rojo | Por qué |
|---|---|---|---|---|---|
| Razón corriente | más | ≥ 1,5 | 1,0–1,5 | < 1,0 | Bajo 1 el activo corriente no cubre la deuda de corto plazo |
| Prueba ácida | más | ≥ 1,0 | 0,7–1,0 | < 0,7 | Sin inventario, ≥1 cubre lo inmediato |
| Razón de efectivo | más | ≥ 0,3 | 0,1–0,3 | < 0,1 | Menos de 10 centavos por peso adeudado es tenso |
| Capital de trabajo | más | > 0 | — | ≤ 0 | Negativo = deudas cortas mayores que lo disponible |
| Endeudamiento | menos | ≤ 50 % | 50–70 % | > 70 % | Más de 70 % financiado por terceros |
| Deuda / patrimonio | menos | ≤ 1,0 | 1,0–2,0 | > 2,0 | Coherente con la anterior |
| Apalancamiento | menos | ≤ 2,0 | 2,0–3,0 | > 3,0 | Ídem |
| Cobertura de intereses | más | ≥ 3,0 | 1,5–3,0 | < 1,5 | Poco margen para pagar intereses |
| Margen bruto | más | ≥ 30 % | 15–30 % | < 15 % | **Muy dependiente del sector** (aviso en pantalla) |
| Margen operativo | más | ≥ 10 % | 3–10 % | < 3 % | |
| Margen neto | más | ≥ 5 % | 0–5 % | < 0 % | Rojo = pérdidas |
| Margen EBITDA | más | ≥ 15 % | 5–15 % | < 5 % | El EBITDA ya lo calcula el generador |
| ROA (anualizado) | más | ≥ 5 % | 0–5 % | < 0 % | |
| ROE (anualizado) | más | ≥ 12 % | 0–12 % | < 0 % | |
| Días de cobro | menos | ≤ 45 | 45–75 | > 75 | Crédito usual de 30 días + holgura |
| Días de pago, días de inventario, ciclo de conversión, rotaciones | — | sin semáforo por defecto | | | Depende del sector; activable por empresa |

Interpretación: `src/financial-analysis/ratio-interpretations.ts`, una frase por razón y color, con el valor,
escrita **para el dueño** (p. ej. razón corriente verde: "Por cada peso que la empresa debe a corto plazo,
tiene 2,42 pesos que puede convertir en efectivo en menos de un año. Puede pagar sus deudas inmediatas con
holgura."). En el backend para que salga igual en pantalla y en PDF.

### 6.3 Tendencia, comparación e indicadores
- **Tendencia**: mensual/trimestral/anual, **máximo 24 puntos**, 4 cálculos a la vez con
  `FinancialRatiosGenerator.generate` por punto.
- **Comparar**: período A vs. B (por defecto el mismo del año anterior): ambos valores, diferencia, %, color y
  si mejoró.
- **Indicadores del Panel (6)**, con nombre para el dueño y el técnico debajo: "¿Puedo pagar lo que debo
  pronto?" (razón corriente), "Sin contar inventario" (prueba ácida), "Cuánto de la empresa es deuda"
  (endeudamiento), "De cada peso vendido, cuánto me queda" (margen neto), "En cuántos días me pagan" (días de
  cobro), "Ganancia de la operación" (EBITDA). Desde el 1 de enero hasta hoy, comparado con el mismo tramo del
  año anterior. Los nombres los valida Carlos (perfil dueño) y las contadoras.

### 6.4 Endpoints (`@Controller('financial-analysis')`; lecturas para todos los roles, como `/reports`)
| Método y ruta | Roles |
|---|---|
| GET `/financial-analysis/health?from&to` | todos |
| GET `/financial-analysis/trend?from=AAAA-MM&to=AAAA-MM&granularity=MONTH\|QUARTER\|YEAR&keys=` | todos |
| GET `/financial-analysis/compare?from&to&compareFrom&compareTo` | todos |
| GET `/financial-analysis/kpis` | todos |
| GET `/financial-analysis/thresholds` | todos |
| PUT `/financial-analysis/thresholds` | ADMIN, ACCOUNTANT |
| DELETE `/financial-analysis/thresholds/:ratioKey` | ADMIN, ACCOUNTANT |
| GET `/financial-analysis/export/health\|compare?format=` | todos |

Rendimiento: 24 puntos ≈ 150 consultas agregadas; qa mide con ≈20.000 asientos. Si pasa de 5 s: 12 puntos por
defecto; solo si no basta, fotos de períodos **cerrados** invalidadas al reabrir.

### 6.5 Anexo B — diseñado para la v0.3 (después de 2FA y exportación completa)
Se conserva el diseño para no perderlo; **no se construye en la v0.2**.
- **DuPont (3 factores)** con las mismas bases del generador (ingresos totales, promedios) para que coincida con
  el ROE (prueba: T1 2030 = 24,1758 % × 0,4118 × 1,9910 = 19,8198 %).
- **Punto de equilibrio**: costos variables por categoría (Costo de ventas 100 %; gastos operativos,
  depreciación y financieros 0 %; otros gastos e ISR fuera) ajustables por cuenta en una tabla
  `AccountCostBehavior (companyId, accountId, variablePct 0–100)`. Prueba: equilibrio 36.428,57; con gastos
  operativos al 50 %, 27.500.
- **Análisis vertical y horizontal** de balance y resultados por cuenta y categoría.

---

## 7. C) Crear sin salir y textos — Fase 1

Solo frontend: `POST /partners` y `PATCH /partners/:id` ya devuelven el tercero completo y exigen ADMIN o
ACCOUNTANT.

### C1. Crear, editar e ir a clientes/proveedores desde la factura y desde cobros/pagos
1. **Componente nuevo** `[front] features/catalog/partner-dialog.ts` con **el mismo** `<app-modal>` y formulario
   de `partners.ts` (campos, validaciones, textos, `clean(...)`). Entradas: `open`, `partner` (editar),
   `defaultType`; salidas: `saved` (tercero devuelto por la API) y `closed`; al guardar,
   `lookups.ensurePartners(true)`.
2. **`partners.ts` lo usa** (se quitan su modal y su lógica de formulario; tabla, filtros y activar/desactivar
   igual). Comportamiento idéntico, verificado por qa.
3. **Factura**: junto al selector, botones del kit (`btn btn-ghost btn-sm`) visibles solo con
   `auth.has('ADMIN', 'ACCOUNTANT')`:
   - **"Crear"**: tipo según `side()` (ventas ⇒ Cliente, compras ⇒ Proveedor, sin tipo ⇒ Cliente); al guardar,
     `partnerId.setValue(nuevo.id)`; el resto del formulario **no se toca**.
   - **"Editar"** (deshabilitado sin selección): la factura toma los datos nuevos (el "NCF según el cliente"
     ya se calcula leyendo `lookups.partners()`). Si el tipo deja de corresponder, se quita la selección con
     aviso.
   - **"Ir a clientes y proveedores"**: `/partners` **en otra pestaña** (`target="_blank" rel="noopener"`,
     D12); la sesión se comparte. Un enlace "Actualizar lista" refresca al volver.
4. **Cobros y pagos** (`payment-form.ts`, selector en la línea ≈33): mismo patrón; cobro ⇒ Cliente, pago ⇒ Proveedor.
5. Botones con texto visible; el diálogo es el `<dialog>` nativo del kit.

### C2. "Tercero" → "cliente / proveedor" (D10: **solo en lo que se toca**)
Reglas: "cliente" o "proveedor" cuando el contexto lo sabe; si no, "cliente / proveedor" ("Nuevo cliente /
proveedor", "Cliente / proveedor creado."). Solo textos visibles; no cambian variables, rutas ni API.
Archivos: `partner-dialog.ts`, `partners.ts`, `invoice-form.*`, `payment-form.ts`, `nav.ts` (Fase 1) y, en
la Fase 4, los que se tocan por la adopción guiada. Lo demás, cuando se toque.

### C3. Menú
"Clientes y proveedores" pasa a "Ventas y compras". **El cambio de menú completo está en un solo lugar: 9.4.**

---

## 8. D) Ayuda integrada — Fases 1 a 6

### 8.1 Qué ve el usuario
- **"Ayuda"** en el menú → `/help` (índice) y `/help/:seccion`, con buscador por título.
- **Botón "?"** en la barra superior de **todas** las pantallas: abre un **panel lateral** con la sección de
  esa pantalla, sin perder lo escrito. "Abrir el manual completo" lleva a `/help` en otra pestaña.

### 8.2 Organización, para dos audiencias (P3)
Cada sección tiene tres bloques: **"En pocas palabras"** (para el dueño, lenguaje de negocio), **"Paso a
paso"** (para quien registra) y **"Detalle contable"** (para la contadora). Revisión obligatoria de cada
sección con la pregunta **"¿lo entiende un dueño?"** (Carlos) y "¿le sirve a una contadora?" (las contadoras).

| # | Sección (archivo) | Fase |
|---|---|---|
| 1 | Primeros pasos: entrar, cambiar la clave, el menú, el Panel, ocultar ayudas, enviar comentarios | 1 |
| 2 | Arranque: el asistente, los NCF, los datos de ejemplo | 2 |
| 3 | Clientes y proveedores (incluye crearlos desde la factura) | 1 |
| 4 | Facturas de venta y compra; notas de crédito y débito; anulación | 1 |
| 5 | Cobros y pagos; anticipos; lo que me deben y lo que debo | 1 |
| 6 | Asientos, aprobación, saldos iniciales, cierre de mes y de año | 2 (cierre guiado) y 4 |
| 7 | Bancos, cajas, extractos, reglas y conciliación | 4 |
| 8 | Reportes: estados financieros, razones, DGII 606/607/608, presupuestos | 3 y 4 |
| 9 | Usuarios y permisos (y el rol Auditor) | 4 y 5 |
| 10 | Preguntas frecuentes | 1, y crece con los comentarios recibidos |
| 11 | Semáforo y análisis financiero | 3 |
| 12 | Auditoría (para la auditora y para la gerencia) | 5 y 6 |

### 8.3 Cómo se guarda el contenido (sin tocar código)
```
[front] public/manual/
  ayuda.json            ← UN solo archivo de configuración (ver abajo)
  01-primeros-pasos.md ... 12-auditoria.md
  img/                  ← capturas con fecha en el nombre: factura-nueva-2026-10.png
  GUIA-DE-ESTILO.md     ← cómo escribir (no se publica)
```
`ayuda.json` reúne lo que en la v1.0 eran 4 archivos, con 4 claves:
- `secciones`: `{ slug, archivo, titulo }` en orden;
- `pantallas`: por ruta, `{ seccion, ancla, siguiente: { texto, ruta } }` (el "?" y el "siguiente paso");
- `campos`: ayudas de los campos difíciles por clave (`"factura.tipoNcf": "..."`);
- `errores`: patrón del mensaje → explicación → enlace a la solución.

**Verificación automática (qa, en cada fase)**: guion `[front] scripts/verificar-ayuda.mjs` (Node, sin
dependencias) que comprueba que `ayuda.json` es válido, que cada `.md` y cada ancla existen, que cada imagen
existe, y que **ninguna ruta de los `*.routes.ts` queda sin mapear** en `pantallas`. Se corre con
`npm run verificar-ayuda` (1 línea en `package.json`). Una fase no se cierra con rutas sin mapear.

CSP: los `.md`, `ayuda.json` e imágenes salen del mismo servidor (`'self'`); `marked` produce HTML sin scripts
ni estilos en línea y Angular lo limpia: **la CSP no cambia**. La guía de estilo prohíbe HTML incrustado e
imágenes de internet. Enlaces internos navegan con el router; externos (DGII) en otra pestaña.

nginx (`[front] deploy/nginx.conf`, 3 líneas): bloque `location /manual/ { try_files $uri =404;
Cache-Control "no-cache" }` con las cabeceras de seguridad. Por eso los archivos van en `/manual/` y la
pantalla en `/help/` (rutas distintas para no romper la recarga de `/help/...`).

### 8.4 Piezas
| Pieza | Archivo [front] |
|---|---|
| Área | `features/help/help.routes.ts` (`/help`, `/help/:slug`) |
| Servicio | `features/help/help-content.ts` (lee `ayuda.json` y los `.md`, memoria de sesión, "pantalla → sección") |
| Visor | `features/help/help-page.ts` (carga `marked` con `import()` dinámico) |
| Panel lateral | `features/help/help-drawer.ts` |
| Botón "?" | 1–2 líneas en `layout/shell.html` + import en `shell.ts` |

### 8.5 Documentador
Desde la **Fase 0**, en paralelo: guía de estilo, `ayuda.json` inicial y secciones 1, 3, 4, 5 y 10 sobre las
pantallas actuales. Luego cada sección **en la misma fase** que su función. Capturas solo del ambiente de
pruebas con datos ficticios, de preferencia con un guion de Playwright (ya instalado) para poder repetirlas.

---

## 9. E) Experiencia guiada — PRINCIPIO RECTOR (Guía P7, P2, P3)

### 9.1 Auditoría de usabilidad de las pantallas actuales
**Lo bueno**: todas las pantallas tienen `page-head` con título y propósito; acción principal casi siempre
arriba a la derecha con `btn-primary` (verde `#0c6b5e`); errores de negocio del backend en español;
`core/errors.ts` ya traduce nombres de la configuración contable; muchos `hint` (7 en la factura); 6 buenos
estados vacíos (Diarios, NCF, Años fiscales, Presupuestos, Movimientos bancarios, Panel).

| Prio. | Hallazgo | Mejora | Fase | Costo | Archivos del socio |
|---|---|---|---|---|---|
| P1 | Sin asistente ni pendientes; empresa vacía (Guía P2 en rojo) | Arranque guiado (9.3) | 2 | back 6 d, front 5 d | `dashboard.html` |
| P1 | Validación en inglés técnico (13 de 856 en español) | Traductor central (9.6) | 1 | front 1,5 d | `core/errors.ts` |
| P1 | Errores sin enlace a la solución | `app-error-notice` + `ayuda.json/errores` | 1 (factura, pago) y 4 (resto) | front 1 d + doc 1 d | ya tocados / Fase 4 |
| P1 | Sin migas ni siguiente paso | Automático en la barra superior | 1 | front 1 d | `shell.*` |
| P1 | No se crea el cliente desde la factura | C1 | 1 | front 2 d | `partners.ts`, `invoice-form.*`, `payment-form.ts` |
| P2 | Estados vacíos genéricos ("con esos filtros" aunque no haya ninguno) en 12 listas | `app-empty-state` | 4 | front 2 d | 12 |
| P2 | Campos difíciles sin explicación (606/607, retenciones, clasificación, agente de retención) | `app-field-help` | 1 (factura, pago, diálogo) y 4 | front 2 d + doc 1,5 d | 8–9 |
| P2 | Sin pasos en factura → cobro → conciliación ni en el cierre | `app-stepper` + cierre guiado | 2 | back 1,5 d, front 2 d | `invoice-detail.*`, `ledger.routes.ts` |
| P2 | Menú técnico ("Catálogos", "Diarios", "tercero") | Menú por intención (9.4) | 1 | front 0,5 d | `nav.ts` |
| P2 | Estados solo con color | Ícono en `StatusBadge` | 4 | front 0,5 d | `shared/ui/badge.ts` |
| P3 | Varios botones principales (3–4) en 5 pantallas | Uno solo | 4 | front 0,5 d | 5 |
| P3 | Formularios sin aviso previo ("no puedes facturar todavía") | `app-readiness-notice` | 2 | front 0,5 d | ya tocados |
| P3 | Revisar todas las pantallas a 375 px y con teclado (checklist de la Guía) | Ajustes puntuales | 4 | front 2 d | hasta ≈15 |

### 9.2 Componentes del kit (se construye cada uno **en la fase que lo usa**)
| Componente | Qué hace | Fase |
|---|---|---|
| `app-breadcrumbs` | Migas automáticas: grupo del menú › opción › `title` de la ruta. Las pantallas no pasan nada | 1 (en el `shell`) |
| `app-next-step` | "Siguiente paso: …" con enlace, desde `ayuda.json/pantallas` | 1 (en el `shell`) |
| `app-field-help` | "?" pequeño junto a la etiqueta con 1–3 frases y "Más en el manual"; textos en `ayuda.json/campos`; accesible con teclado, sin librerías | 1 |
| `app-error-notice` | Error traducido + "Cómo arreglarlo" + botón a la solución | 1 |
| `app-page-header` | Título, propósito, siguiente paso según el estado, acción principal a la derecha | 2 |
| `app-stepper` | Pasos hecho / actual / pendiente / con problema, con enlaces | 2 |
| `app-readiness-notice` | "Para facturar falta X → Configurar" | 2 |
| `app-empty-state` | Explicación + botón grande; variante "con filtros" con "Quitar filtros" | 4 |
Archivos nuevos en `shared/ui/` + 1 línea por componente en `shared/ui/index.ts`. Solo clases y variables
de `styles.css`; ningún color ni fuente nuevos.

### 9.3 Arranque guiado (Fase 2) — meta: **primera factura válida en menos de 15 minutos** (P2)

**Checklist de 5 grupos** (no 10 pasos), en el asistente `/setup` y en la tarjeta del Panel:
| Grupo | Qué incluye | Cómo se resuelve |
|---|---|---|
| 1. Tu empresa | Nombre, RNC, dirección; año fiscal en curso | Lleva a "Empresa" y vuelve; el año se crea con un botón (`POST /fiscal-years`) |
| 2. Tu contabilidad lista | Plan de cuentas base RD clasificado, cuentas automáticas, impuestos base, diarios estándar | **Un solo botón** "Preparar mi contabilidad" (`chart-template` + `POST /journals/defaults`) |
| 3. Tus comprobantes fiscales (NCF) | Al menos una secuencia vigente para vender | **Guía NCF** (abajo) |
| 4. Dónde entra el dinero | Una cuenta de banco o una caja | Formulario corto guiado |
| 5. Tu primera factura | Un cliente y una factura emitida | Diálogo de cliente (C1) y la factura nueva |
Cada grupo explica en 2 líneas qué es y por qué hace falta. **Todo se puede saltar** ("Saltar este paso",
"Ocultar la lista") — ver 9.5.

**Guía NCF** (lo que más se equivoca un usuario nuevo): pantalla guiada dentro del asistente
(`features/setup/ncf-guide.ts`, nueva; usa el endpoint existente `POST /ncf/sequences`, sin tocar `ncf.ts`):
1. Qué es un NCF en una frase y **cuál necesitas** con preguntas sencillas: "¿Le vendes a empresas que piden
   crédito fiscal?" ⇒ B01; "¿a consumidores finales?" ⇒ B02 (y E31/E32 si la empresa ya emite e-CF, con el
   aviso de que requiere proveedor).
2. **Dónde conseguirlo**: paso a paso de la solicitud en la Oficina Virtual de la DGII, con capturas, y qué
   datos copiar de la autorización.
3. Formulario con los campos **en el mismo orden que la autorización de la DGII** (tipo, desde, hasta,
   vencimiento), con ejemplo al lado y validaciones en vivo (rango coherente, fecha futura).
4. **Vista previa**: "Tus facturas saldrán con B0100000051, B0100000052…" y aviso de cuántos quedan.
5. Si existe la secuencia de los datos de ejemplo, pide borrarlos primero.

**Datos de ejemplo borrables con un clic** (Guía P2 y sección 4: dominicanos y realistas):
- Paso opcional al inicio: "¿Quieres ver primero cómo se ve con datos de ejemplo?". Carga, con los
  **servicios existentes** (facturación, pagos, tesorería; todos ya exportados): ≈5 clientes y 3 proveedores
  ficticios (p. ej. "Colmado La Esquina SRL", RNC de formato válido pero ficticios), ≈10 facturas de venta,
  5 de compra, 6 cobros/pagos, una cuenta de banco con movimientos para conciliar. Las ventas usan una
  secuencia NCF **de ejemplo** (marcada como tal).
- Cada registro creado se anota en una tabla nueva **`SampleRecord (companyId, entityType, entityId)`**.
- Mientras existan, una franja fija dice "Estás viendo datos de ejemplo — **Borrarlos**", y la pantalla de
  DGII avisa "Borra los datos de ejemplo antes de generar tu 606/607".
- **Borrar** (ADMIN): elimina **solo** los registros anotados, en orden, en una transacción, con
  `writeAudit` del total. Se niega con explicación si: algún documento **real** usa uno de ejemplo (p. ej. un
  cobro real aplicado a una factura de ejemplo) o un período con datos de ejemplo está cerrado.
- Solo se pueden cargar en una empresa **sin documentos** y con la contabilidad base preparada (grupo 2).
- Es el único lugar del sistema que borra documentos contabilizados: lo revisa seguridad y tiene pruebas
  propias (16.4).

**Backend nuevo `[back] src/guidance/`**:
| Método y ruta | Roles | Qué hace |
|---|---|---|
| GET `/guidance/setup-status` | todos | Los 5 grupos con estado, motivo y ruta |
| POST `/guidance/chart-template` | ADMIN | Plan de cuentas base RD clasificado + cuentas automáticas + impuestos base; solo si no hay cuentas (si no, 409); una transacción, `writeAudit` |
| POST `/guidance/sample-data` | ADMIN | Carga los datos de ejemplo (condiciones arriba) |
| DELETE `/guidance/sample-data` | ADMIN | Los borra (condiciones arriba) |
| GET `/guidance/invoice-flow/:id` | todos | creada → emitida → cobrada → conciliada |
| GET `/guidance/period-close?periodId=` | todos | Chequeos antes de cerrar el mes (asientos pendientes, facturas en borrador, bancos sin conciliar, balanza, avisos 606/607 vía `DgiiService`) |
El plan de cuentas base vive en `src/guidance/templates/plan-cuentas-rd.ts`. **Las contadoras lo validan
antes de programarlo (bloquea, D14).** Migración nueva `<fecha>_guidance_sample_records/`.

**Pantallas nuevas**: `/setup` (asistente con `app-stepper`, botones grandes, regreso desde pantallas
existentes); tarjeta "Pendientes (2 de 5)" en el Panel (`setup-checklist.ts`, +1 línea en `dashboard.html`);
`app-stepper` en el detalle de factura; **"Cierre de mes guiado"** (`features/ledger/period-close.ts`, +1
ruta en `ledger.routes.ts`); `app-readiness-notice` en factura y pago.

### 9.4 Menú por intención — **definición única** (se aplica una vez, en la Fase 1)
| Grupo | Opciones |
|---|---|
| (sin título) | Panel · Configuración inicial (desde la Fase 2, mientras falten grupos y no se haya ocultado) |
| Ventas y compras | **Clientes y proveedores** · Facturas · Cobros y pagos · Lo que me deben y lo que debo (antes "Cuentas por cobrar y pagar") |
| Bancos y caja | Bancos y cajas · Conciliación bancaria |
| Contabilidad | Asientos · Plan de cuentas · Cierre de mes guiado (Fase 2) · Períodos fiscales · Años fiscales y cierre · Saldos iniciales |
| Reportes | Estados financieros · Semáforo financiero (Fase 3) · DGII 606 · 607 · 608 · Presupuestos |
| Auditoría | Encargos de auditoría (ADMIN y AUDITOR, Fase 5) |
| Configuración (antes "Catálogos" y "Administración") | Empresa · Usuarios · Impuestos · Comprobantes fiscales (NCF) · Clasificación de cuentas para reportes · Cuentas automáticas · Libros diarios · Numeración de facturas y pagos |
| Ayuda | Manual de usuario · Comentarios recibidos (ADMIN) |
Las rutas no cambian. Revisión con la pregunta **"¿lo entiende un dueño?"** (Carlos) antes de cerrar la Fase 1;
las contadoras confirman que no falta nada. Las entradas marcadas con fase se agregan en esa fase (1 línea).

### 9.5 Todo lo guiado se puede saltar u ocultar (P7)
- Interruptor **"Ocultar ayudas"** en el menú del usuario (barra superior): oculta la línea de "siguiente
  paso", la tarjeta de pendientes, los avisos previos y los íconos de ayuda de campos. **No** oculta el botón
  "?", las migas ni las explicaciones de errores. Se guarda en el navegador por usuario (alternativa
  descartada en 4.3); se puede volver a activar en el mismo lugar.
- **"Saltar este paso"** en cada grupo del asistente y **"Ocultar la lista"** en la tarjeta del Panel (se puede
  reabrir desde Ayuda → "Configuración inicial").

### 9.6 Errores que explican y llevan a la solución
- **Traductor central** `[front] core/error-text.ts` (nuevo): convierte los mensajes estándar en inglés
  ("must be a UUID", "should not be empty", "must not be greater than", "property X should not exist"...) a
  español con el nombre del campo en lenguaje de negocio. `errorMessage()` lo llama (2–3 líneas en
  `core/errors.ts`): **todas las pantallas mejoran sin tocarlas**. Si no reconoce el mensaje, muestra el original.
- **"Cómo arreglarlo"**: dev-backend lista los mensajes de negocio del backend (solo lectura); el documentador
  escribe los ≈30 más frecuentes en `ayuda.json/errores` con enlace; `app-error-notice` los muestra. Los
  mensajes técnicos del backend ("Indica exactamente uno: invoiceId, paymentId…") se reescriben ahí, sin
  tocar el backend.

### 9.7 Prueba de "usuario nuevo sin capacitación" (qa organiza)
**Quiénes** (decisión de Carlos): **Carlos (perfil dueño, no contador)**, **el socio**, **las 2 contadoras** y
cualquiera que tenga usuario. Cada flujo lo prueba al menos una persona **con perfil dueño** y una contadora.
Flujos: arranque desde cero hasta la primera factura; cliente + factura de venta; cobro; compra con retención;
conciliar el banco del mes; cierre de mes; leer el semáforo (Fase 3); encargo de auditoría (Fases 5–6).
1. **Tarjeta de tarea** con solo el objetivo ("Tu empresa vendió RD$ 11.800 a Ferretería X con comprobante de
   crédito fiscal; regístralo"), sin instrucciones.
2. **Recorrido de qa** con Playwright, avanzando solo con lo que dice la pantalla: anota cada punto donde el
   siguiente paso no es obvio, cada error sin solución y cada término técnico; cuenta los clics de las tareas
   frecuentes (línea base de P8).
3. **Prueba cronometrada de arranque (P2)**: empresa nueva, desde el **primer login** hasta la **primera
   factura válida emitida** (NCF real de prueba configurado, cliente con RNC válido, ITBIS correcto). Meta:
   **menos de 15 minutos** con Carlos y con una contadora. Si no se cumple, la Fase 2 no se cierra: qa entrega
   la lista de dónde se fue el tiempo.
4. Las observaciones se recogen con "Enviar comentario" (sección 10) y se convierten en tareas.

### 9.8 Validación
**dev-frontend** es responsable del diseño y del checklist de la Guía; **revisor-critico** lo revisa en cada
entrega; **qa** hace las pruebas de 9.7; **Carlos** aprueba.

---

## 10. F) "Enviar comentario" — Fase 1

### 10.1 Qué ve el usuario
Botón **"Enviar comentario"** en la barra superior (y en el panel de Ayuda). Abre un diálogo corto:
- **¿Qué pasó?** (una opción): "No entendí algo" · "Algo no funciona" · "Tengo una idea".
- **Cuéntanos** (texto, hasta 2.000 caracteres) con ejemplo: "Quería crear un cliente y no encontré dónde".
- Se adjunta solo, sin que lo escriba: la pantalla (ruta), fecha y hora, su rol y el navegador.
- Al enviar: "Gracias. Lo revisamos cada semana; verás la respuesta en Ayuda → Mis comentarios."

### 10.2 Backend `[back] src/feedback/`
Tabla **`Feedback`**: `id, companyId, userId, kind (FeedbackKind: CONFUSING, BROKEN, IDEA), message (≤2.000),
route (≤200), userAgent, status (FeedbackStatus: NEW, PLANNED, DONE, WONT_DO, DUPLICATE), response? (≤1.000),
taskRef? (≤100, p. ej. el número del issue), createdAt, updatedAt`. Migración `<fecha>_feedback/`.
| Método y ruta | Roles |
|---|---|
| POST `/feedback` | ADMIN, ACCOUNTANT, APPROVER, VIEWER, AUDITOR (todos explícitos) — máximo 20 por usuario por hora |
| GET `/feedback/mine` | todos (solo los propios) |
| GET `/feedback` | ADMIN (los de su empresa) |
| PATCH `/feedback/:id` | ADMIN (estado, respuesta, referencia de tarea) |
Pantallas: "Mis comentarios" en Ayuda (todos) y "Comentarios recibidos" (ADMIN) con filtros por estado y tipo.
El texto se muestra siempre escapado.

### 10.3 Cómo se convierten en tareas
1. **Cada semana** (o al cierre de cada fase), devops exporta los comentarios nuevos de todas las empresas del
   ambiente de pruebas con un guion de solo lectura (`deploy/feedback-export.sh` → CSV).
2. **Triaje** (arquitecto + coordinador, 30 min): cada comentario se clasifica:
   - "Algo no funciona" → qa lo reproduce → tarea para dev-backend/dev-frontend con prioridad por gravedad;
   - "No entendí" → tarea de **P7** para dev-frontend o el documentador (pantalla, texto, ayuda o pregunta frecuente);
   - "Idea" → lista de ideas para que **Carlos** decida (versión y prioridad);
   - repetido → se une al existente.
3. La tarea se registra como **issue** con la etiqueta `comentario` y la de la fase: en el tablero de la
   organización (Plan A) o en `modulo-financiero` (Plan B).
4. El ADMIN (o el equipo) marca el comentario con el estado, la respuesta y el número de tarea; quien lo envió
   lo ve en "Mis comentarios" ("Resuelto en la versión 0.2-fase 2").

---

## 11. G) Confianza: respaldos y regla de datos reales — Fase 0 (P10)

### 11.1 Regla
> **Sin datos reales hasta tener respaldos probados, 2FA y exportación completa.**
Consecuencia: la v0.2 entrega los respaldos; 2FA y la exportación completa van en la v0.3. **Hasta entonces el
sistema solo se usa con datos ficticios** (como hoy en finanzas.biodesch.com). seguridad verifica la regla en
cada release; ninguna fase puede pedir datos reales a las contadoras.

### 11.2 Diseño del respaldo (devops, 1–2 días)

> **Estado al 2026-10-10: la base YA está hecha** (commit `2672217`, docs/OPERACION-BACKUPS.md). Se hizo con
> `scripts/backup.sh` y `scripts/restore-test.sh` y con el crontab del usuario `claude` (respaldo diario a las 2:30,
> prueba de restauración los domingos a las 4:00), con 14 diarios y 8 semanales en
> `proyectos/Software/financiero-backups/`. La restauración se ensayó con resultado OK. **Faltan:**
> - el cifrado con frase secreta (D18);
> - la copia fuera del servidor (D17; gancho `OFFSITE_CMD` listo);
> - el aviso de fallo;
> - la verificación de la balanza y de un adjunto en la prueba de restauración.
>
> El diseño de abajo con un contenedor queda como alternativa. Solo se migra a él si el cron del usuario
> deja de servir, por ejemplo al salir de claude-docker.

- Archivo nuevo **`deploy/docker-compose.backup.yml`** (en el repo de despliegue, sección 12) que agrega un
  servicio `backup` al proyecto `financiero-pruebas`, sin tocar `docker-compose.prod.yml`. Imagen propia
  `deploy/backup/Dockerfile` basada en `postgres:18-alpine` (trae `pg_dump`) + `gnupg` + `rclone`.
- **Cada día a las 02:00**: `pg_dump -Fc` de la base + copia de la carpeta de adjuntos (volumen `uploads`
  montado solo lectura) → un archivo con fecha, **cifrado** con una frase secreta que **Carlos guarda fuera del
  servidor** (gestor de claves o papel). Si se pierde la frase, los respaldos no sirven.
- **Conservación local**: 14 diarios + 8 semanales en una carpeta del servidor **fuera** de los volúmenes de Docker.
- **Copia fuera del servidor**: `rclone` sube cada respaldo cifrado a un destino que Carlos elige (D17; p. ej.
  otro servidor suyo por SFTP o un almacenamiento de respaldo). Lo que sale ya va cifrado.
- **Aviso de fallo**: el servicio deja un archivo de estado; el healthcheck falla si el último respaldo tiene más
  de 26 horas; devops revisa semanalmente (alertas por correo, en la v0.3).
- **Restauración ensayada** (`deploy/backup/restore.sh` + procedimiento escrito): restaurar el último respaldo en
  una base y carpeta **temporales**, y comprobar: cantidad de filas por tabla, que la balanza de comprobación
  cuadra por empresa, y que un adjunto al azar abre. Se mide cuánto tarda. Se repite **una vez por fase**.
- Lo que Carlos deba hacer (guardar la frase, elegir y dar acceso al destino) se le da **paso a paso**.

---

## 12. H) Repositorios y forma de trabajar con el socio — Fase 0 y cada fase

Carlos propondrá al socio el **Plan A (organización compartida)**. Si el socio no lo acepta, se usa el
**Plan B (forks)**. El resto del plan sirve igual con cualquiera de los dos: lo que cambia es dónde vive el código
y cómo se aprueba cada entrega. Antes de decidir, el código actual del socio se compara archivo por archivo con
lo que tenemos (`b552cfe`, 9-oct), porque él pudo avanzar desde entonces.

### 12.1 Plan A (preferido por Carlos) — organización de GitHub compartida

**Qué es**: una **organización** de GitHub (nombre por definir; D20) donde **Carlos y el socio son dueños
(owners) por igual**. El socio **transfiere** sus dos repos a la organización: conservan todo su historial,
issues y PRs, y GitHub redirige las direcciones viejas.

| Repo en la organización | Contenido |
|---|---|
| `finanzas_run` | Backend (transferido por el socio, con historial) |
| `finanzas_run_frontend` | Frontend (transferido por el socio, con historial) |
| `finanzas_docs` (recomendado) | `carlosjfriast-sketch/modulo-financiero` **transferido y renombrado**, solo con `CLAUDE.md`, `docs/` (guía, planes, normativa DGII) y `deploy/` (compose de pruebas, respaldos, guiones) |

**Qué hacer con `modulo-financiero`** — recomendación: los **commits de código** propios (lock regenerado,
body 6 MB, seguridad nginx/CSP) entran a `finanzas_run` y `finanzas_run_frontend` como **PR 0**; el repo
**no se archiva**: se queda solo con docs y despliegue y se **transfiere a la organización** como
`finanzas_docs`, porque la guía de producto, los planes y el despliegue del ambiente de pruebas son de los dos
socios. Archivarlo dejaría la guía y el plan fuera de la vista del socio.

**Reglas de los repos de código** (en *Settings → Rules / Branches*):
- Rama `main` protegida: **se exige PR** y **1 aprobación de una persona dueña distinta de quien lo pidió**;
  **prohibido el push directo** (también para los dueños) y prohibido borrarla o reescribirla.
- Archivo `CODEOWNERS` con Carlos y el socio, y la opción "exigir revisión de los dueños del código": así la
  aprobación **siempre** es de una persona, nunca de la cuenta de Claude.
- Quién aprueba: lo que pide Carlos (y hace Claude) lo aprueba **el socio**; lo que hace el socio lo aprueba
  **Carlos** (Claude le prepara un resumen en lenguaje sencillo de qué cambia y qué riesgo tiene).
- **Una rama por tarea o por fase** (`v0.2/fase-1`, `v0.2/fase-1-dialogo-clientes`...). Fases grandes (la 4)
  en varias ramas y PRs por área.
- **Costo** (D21): en repos **privados**, las reglas de protección de ramas exigen el plan **GitHub Team**
  (≈4 USD por usuario al mes; con Carlos, el socio y la cuenta de Claude son 3 puestos, ≈12 USD/mes). Con el plan
  gratuito las reglas no se pueden activar en privados: no se recomienda.

**Tablero (GitHub Projects de la organización)** con el plan v0.2:
- **Cada tarea de la sección 15 es un issue** (en el repo que corresponda: backend, frontend o `finanzas_docs`),
  con etiqueta de fase y asignado a **Carlos**, **el socio** o **Claude** (la cuenta máquina).
- Columnas: **Pendiente · En curso · En revisión · Terminado**. Campos: Fase, Repo, Agente (dev-backend,
  dev-frontend, qa...).
- Cada PR se enlaza a sus issues ("Cierra #12"); al unirse el PR, el issue pasa solo a Terminado.
- Los comentarios de los usuarios (sección 10) que se convierten en tareas entran también como issues, con la
  etiqueta `comentario`.
- Claude crea y mueve los issues; Carlos y el socio ven el avance sin preguntar.

**Cómo entra Claude (el servidor)** — dos opciones:
| | Deploy keys con escritura, una por repo | **Usuario máquina** (recomendado) |
|---|---|---|
| Qué es | Una llave SSH por repo | Una cuenta de GitHub aparte (p. ej. `biodesch-claude`), miembro de la organización con rol **Write** (no dueño) |
| Subir ramas | Sí | Sí |
| Abrir PRs, crear y mover issues, usar el tablero | **No** (las llaves solo sirven para git) | **Sí** |
| Puede saltarse la protección de `main` | No | No (no es dueño; y `CODEOWNERS` exige aprobación humana) |
| Si se compromete | Afecta solo a ese repo | Se le quita de la organización en un clic; acceso acotado por su rol y por un token con permisos mínimos y vencimiento |
| Costo | 0 | 1 puesto del plan Team |
**Recomendación: usuario máquina**, porque el Plan A necesita que Claude abra PRs y mantenga el tablero; con
deploy keys, Carlos tendría que abrir cada PR y mover cada tarea a mano. GitHub permite una cuenta máquina por
persona. Credenciales en el servidor: una llave SSH para git y un token *fine-grained* limitado a los repos de la
organización (contenido, PRs, issues, proyectos), con vencimiento de 90 días y renovación anotada en el tablero.

**Pasos del Plan A — quién hace qué**
| # | Quién | Dónde | Paso |
|---|---|---|---|
| 1 | Carlos | Web de GitHub | Crear la organización: avatar → **Your organizations → New organization** → plan **Team** → nombre (D20) → correo de contacto |
| 2 | Carlos | Web | Invitar al socio como **Owner**: *People → Invite member → rol Owner* |
| 3 | Socio | Correo / web | Aceptar la invitación |
| 4 | Socio | Web, en cada uno de sus 2 repos | *Settings → General → Danger Zone → Transfer ownership* → elegir la organización → confirmar escribiendo el nombre del repo |
| 5 | Carlos | Web, en `modulo-financiero` | Mismo paso de transferencia hacia la organización; luego *Settings → General → Repository name* → `finanzas_docs` |
| 6 | Claude (devops) | Servidor | Crear la llave SSH de la cuenta máquina y preparar los textos de configuración (reglas, `CODEOWNERS`, etiquetas) |
| 7 | Carlos | Web | Crear la cuenta máquina (correo propio de Carlos, p. ej. con `+claude`), activarle 2FA, y en la organización invitarla con rol **Member** y luego darle **Write** en los 3 repos (*Settings → Collaborators and teams*) |
| 8 | Carlos | Web, con la sesión de la cuenta máquina | Pegar la llave SSH (*Settings → SSH and GPG keys*) y crear el token *fine-grained* (*Settings → Developer settings*) con los permisos que indica devops; entregárselo a devops por el canal que acuerden (nunca por correo en texto) |
| 9 | Carlos o socio | Web, en `finanzas_run` y `finanzas_run_frontend` | *Settings → Rules → New branch ruleset* para `main`: exigir PR, 1 aprobación, revisión de `CODEOWNERS`, bloquear push directo y borrado (devops pasa la lista exacta de casillas) |
| 10 | Claude | Repos | PR con `CODEOWNERS` en cada repo (lo aprueba el socio) |
| 11 | Carlos | Web | Crear el tablero: organización → **Projects → New project → Board**, nombre "Plan v0.2"; dar acceso de escritura a la cuenta máquina |
| 12 | Claude | Tablero | Crear columnas, campos, etiquetas y **un issue por tarea** de la sección 15, asignados |
| 13 | Claude (devops) | Servidor | Clonar los 3 repos en la carpeta de trabajo (12.3), reconstruir el ambiente de pruebas desde ellos y verificar (qa) |
| 14 | Claude | Repos | **PR 0** con los commits propios (12.3); los aprueba el socio |
| 15 | Socio | Web | Revisar y aprobar los PRs que le toquen; Carlos aprueba los del socio |

### 12.2 Plan B (si el socio no acepta la organización) — forks

| Repo | Contenido | Quién escribe |
|---|---|---|
| `shadowhunt87/finanzas_run` y `shadowhunt87/finanzas_run_frontend` | Repos del socio | Solo el socio; nosotros le enviamos PRs (no da permiso de escritura) |
| **`carlosjfriast-sketch/finanzas_run`** y **`.../finanzas_run_frontend`** (forks) | Copias con historial compartido; una rama por fase | Nuestro equipo |
| `carlosjfriast-sketch/modulo-financiero` | `CLAUDE.md`, `docs/`, `deploy/`, issues de tareas | Nuestro equipo |

Forma de trabajo: antes de cada fase, sincronizar `main` de cada fork con el del socio y crear `v0.2/fase-N`; al
aprobar Carlos la fase, **un PR por repo** hacia el socio, pequeño y en español (qué cambia, archivos suyos
tocados según la sección 17, migraciones, cómo probar). Si el socio pide cambios, se hacen en la misma rama; si
tarda, la fase siguiente parte de nuestra rama y se dice en el PR. Acceso del servidor: **una deploy key con
escritura por fork** (en el Plan B no hace falta usuario máquina: Carlos abre cada PR desde la web).

**Pasos del Plan B — quién hace qué**
| # | Quién | Dónde | Paso |
|---|---|---|---|
| 1 | Socio | Web | Dar a Carlos acceso de **solo lectura** a sus 2 repos si son privados, y permitir forks |
| 2 | Carlos | Web | En cada repo del socio: **Fork** → *Owner* `carlosjfriast-sketch` → mismo nombre → **Create fork** |
| 3 | Claude (devops) | Servidor | Crear dos llaves SSH (una por fork) y pasarle los textos a Carlos |
| 4 | Carlos | Web, en cada fork | *Settings → Deploy keys → Add deploy key* → título `servidor-contabo` → pegar → **Allow write access** → **Add key** |
| 5 | Claude (devops) | Servidor | Clonar, traer los commits propios (12.3), reconstruir el ambiente de pruebas y verificar |
| 6 | Carlos | Web, cada fase | En el fork: **Compare & pull request** → de `v0.2/fase-N` hacia `shadowhunt87/...:main` → pegar título y descripción que prepara el documentador → **Create pull request** |
| 7 | Socio | Web | Revisar y unir los PRs |
| 8 | Carlos (opcional) | Web | Activar Issues en `modulo-financiero` para las tareas |

### 12.3 Migración inicial (devops, Fase 0, ≈1 día, igual en ambos planes)
1. Comparar `modulo-financiero` (`b552cfe`) con el `main` actual de cada repo del socio, archivo por archivo.
2. Carpeta de trabajo en el servidor: **una sola** (`proyectos/Software/financial-backend`, regla de separación
   de proyectos). Es el repo de docs y despliegue; dentro se clonan los de código en `backend/` y `frontend/`
   (ignorados por su `.gitignore`). El compose de pruebas pasa a construir desde `./backend` y `./frontend`.
3. Traer **nuestros 4 commits propios**, conservando autor y fecha y ajustando rutas (`git format-patch` +
   `git am --directory`):
   | Commit | Va a | Contenido |
   |---|---|---|
   | `c5efa7c` (parte) | backend | `package-lock.json` regenerado (`npm ci` fallaba) |
   | `f9a4715` (parte) | backend | `src/app.setup.ts`: body 6 MB |
   | `f9a4715` (parte) | frontend | `Dockerfile`, `deploy/nginx.conf`, `deploy/security-headers.conf` (CSP y cabeceras) |
   | `c5efa7c` (parte) y `a1d21cf` | repo de docs y despliegue | `docker-compose.pruebas.yml` (a `deploy/`), `.gitignore`, `CLAUDE.md`, `docs/` |
   Toda otra diferencia del paso 1 se lista y se decide con el coordinador.
4. En el repo de docs, sacar de la raíz el código viejo (queda en su historial).
5. Respaldo de la base de pruebas → reconstruir el ambiente desde los repos nuevos → qa: suite e2e completa y
   recorrido rápido de pantallas.
6. **PR 0** a cada repo de código con lo del paso 3 (no bloquea las fases).

### 12.4 Cómo se entrega cada fase (ambos planes)
Rama por fase (y por área en la Fase 4) → desarrollo, qa, seguridad y documentador sobre esa rama → despliegue
en pruebas desde ella → Carlos aprueba la fase → PR con descripción en español y enlace a los issues → aprobación
del otro socio (Plan A) o unión por el socio (Plan B). Los pasos detallados para Carlos se le dan con capturas
cuando llegue el momento, sin asumir conocimientos previos.

---

## 13. Permisos y aislamiento

### 13.1 Matriz
| Acción | ADMIN | ACCOUNTANT | APPROVER | VIEWER | AUDITOR |
|---|---|---|---|---|---|
| Leer contabilidad, reportes, exportaciones, semáforo, Panel | Sí | Sí | Sí | Sí | Sí |
| Escribir en contabilidad | según hoy | según hoy | según hoy | No | **No** |
| Límites del semáforo | Sí | Sí | No | No | No |
| Asistente: preparar contabilidad, datos de ejemplo (cargar/borrar) | Sí | No | No | No | No |
| Enviar comentario / ver los propios | Sí | Sí | Sí | Sí | Sí |
| Ver y gestionar comentarios de la empresa | Sí | No | No | No | No |
| Crear encargo | Sí | No | No | No | Sí |
| Papeles, procedimientos, marcas, archivos, hallazgos | Solo hallazgos comunicados, informe y sus archivos (D3) | No | No | No | Sí |
| Comunicar/cerrar hallazgos, cerrar **y reabrir** encargo | **No** | No | No | No | Sí |
| Responder hallazgos | Sí (comunicados) | No | No | No | No |
| Crear usuarios Auditor | Sí | No | No | No | No |

D3 (se aplica la recomendación): **lo que la auditora todavía está trabajando no lo ve la gerencia hasta que ella
lo comunica**; la gerencia ve los hallazgos comunicados, responde y descarga el informe.

### 13.2 Aislamiento
`companyId` siempre del token; lecturas con `where: { companyId }`; `update/delete` por id con `companyId`
(test de regresión existente); llaves compuestas en auditoría; marcas: el documento se busca con
`{ id, companyId }` (404 si no); archivos con clave generada por el servidor; datos de ejemplo: solo los
registros anotados de la propia empresa; comentarios: cada usuario solo los suyos, el ADMIN los de su empresa.

---

## 14. Pantallas y rutas nuevas (frontend)
Todas con el kit, `OnPush`, signals, etiquetas en `labels.ts`, checklist de la Guía.

| Ruta / pieza | Archivo [front] | Fase |
|---|---|---|
| Diálogo cliente/proveedor | `features/catalog/partner-dialog.ts` | 1 |
| Ayuda | `features/help/*` (`/help`, `/help/:slug`, panel lateral) | 1 |
| Enviar comentario, Mis comentarios, Comentarios recibidos | `features/help/feedback-*.ts` (rutas `/help/comments`, `/help/comments/received`) | 1 |
| Migas, siguiente paso, ayuda de campo, aviso de error, "Ocultar ayudas" | `shared/ui/*` nuevos + `layout/shell.*` | 1 |
| Asistente | `features/setup/setup-wizard.ts`, `ncf-guide.ts`, `sample-data-banner.ts` (`/setup`) | 2 |
| Pendientes en el Panel | `features/dashboard/setup-checklist.ts` | 2 |
| Pasos de la factura | `app-stepper` en `invoice-detail.html` | 2 |
| Cierre de mes guiado | `features/ledger/period-close.ts` (`/period-close`) | 2 |
| Semáforo financiero | `features/reporting/analysis.ts/.html` (`/analysis`: Semáforo, Tendencia, Comparar, Configuración), `analysis-light.ts`, `analysis-types.ts` | 3 |
| Indicadores en el Panel | `features/dashboard/kpi-strip.ts` | 3 |
| Auditoría | `features/audit/*` (`/audit`, `/audit/:id` con Resumen, Áreas, Partidas, Hallazgos, Informe; `/audit/:id/areas/:wpId`; `/audit/:id/findings/:fId`), `audit-files.ts` (mismo diseño que `shared/ui/attachments.ts`) | 5–6 |
La auditoría usa `app-stepper` para el estado del encargo y el aviso de 5.6 en un `notice warn`.

---

## 15. Fases

Flujo de agentes en **cada fase** (según `CLAUDE.md`): arquitecto → revisor-critico → **Carlos aprueba** →
dev-backend / dev-frontend → qa → seguridad → documentador (que además trabaja en paralelo desde la Fase 0) →
**revisor-critico final** → despliegue en pruebas (devops, con autorización de Carlos, respaldo previo) →
prueba de usuarios nuevos (9.7) → **PR** con aprobación del otro socio (Plan A) o PR al socio (Plan B) (12.4).
En el Plan A, cada tarea de esta sección es un issue del tablero, asignado y movido por columnas.
Tamaños: **S** = horas · **M** ≈ 1 día · **L** = 2–3 días.

### Fase 0 — Preparación, repositorios y respaldos · P10 · efectivo ≈1 sem · calendario ≈1,5 sem
| # | Agente | Tarea | Tam. |
|---|---|---|---|
| 0.1 | Carlos (+ socio) | Proponer el Plan A al socio; hacer los pasos de 12.1 (o de 12.2 si es el Plan B); elegir destino de la copia externa (D17) | — |
| 0.2 | devops | Migración inicial (12.3), con respaldo previo del ambiente de pruebas; en el Plan A, reglas de `main`, `CODEOWNERS` y cuenta máquina | M |
| 0.2b | devops | Plan A: tablero con un issue por tarea de la sección 15, asignado, con fase y agente | S |
| 0.3 | devops | **Respaldos** (11.2): servicio, cifrado, copia externa, **restauración ensayada** y procedimiento escrito | L |
| 0.4 | seguridad | Revisión de respaldos (cifrado, permisos de la carpeta, frase fuera del servidor) | S |
| 0.5 | qa | Línea base: suite e2e completa en verde desde los repos nuevos; tiempos | S |
| 0.6 | documentador | Guía de estilo, `ayuda.json` inicial; secciones 1, 3, 4, 5 y 10 | M |
| 0.7 | documentador + contadoras | Borradores a validar: plan de cuentas base RD e impuestos (D14), límites del semáforo (D5), plantillas de auditoría | M |

### Fase 1 — Crear sin salir, Ayuda, base guiada y comentarios · P1: "sin tener que ser contador" · efectivo ≈1,5 sem · calendario ≈2 sem
**Entregable:** C1–C3; menú por intención (9.4); migas y siguiente paso en todas las pantallas; errores de
validación en español; ayudas de campo y errores con enlace en factura, pago y diálogo; "Ocultar ayudas"; Ayuda
con secciones 1, 3, 4, 5 y 10; "Enviar comentario".
| # | Agente | Tarea | Tam. |
|---|---|---|---|
| 1.1 | dev-frontend | `partner-dialog.ts`; `partners.ts` lo usa sin cambiar comportamiento | M |
| 1.2 | dev-frontend | Factura y cobro/pago: Crear / Editar / Ir a…; textos C2 | M |
| 1.3 | dev-frontend | `app-breadcrumbs`, `app-next-step`, "Ocultar ayudas" en `shell`; menú 9.4 | M |
| 1.4 | dev-frontend | Traductor de errores + `app-error-notice` + `app-field-help` (factura, pago, diálogo) | M |
| 1.5 | dev-frontend | Ayuda: área, servicio, visor con `marked`, panel, "?"; `scripts/verificar-ayuda.mjs` | L |
| 1.6 | dev-backend | `src/feedback/` + migración + e2e (16.5); lista de mensajes de error de negocio | M |
| 1.7 | dev-frontend | Enviar comentario, Mis comentarios, Comentarios recibidos | M |
| 1.8 | devops | Bloque `/manual/` en nginx; guion `feedback-export.sh` | S |
| 1.9 | documentador | Secciones 1, 3, 4, 5, 10 publicadas; `ayuda.json` completo para las rutas existentes | M |
| 1.10 | qa | Suite completa; 16.6; `verificar-ayuda`; usuario nuevo: "cliente + factura" y "cobro" (9.7) | M |
| 1.11 | seguridad | Contenido del manual, CSP sin cambios, comentarios (límite, escape, roles) | S |

### Fase 2 — Arranque guiado, datos de ejemplo, NCF y flujos · P1: "en orden" y "al día con la DGII" sin ser contador · efectivo ≈2,5 sem · calendario ≈3–3,5 sem
**Requisito que bloquea:** plan de cuentas base RD validado por las contadoras (D14).
**Entregable:** asistente de 5 grupos con guía NCF; datos de ejemplo borrables; pendientes en el Panel; pasos
de la factura; cierre de mes guiado; **prueba cronometrada < 15 min aprobada**.
| # | Agente | Tarea | Tam. |
|---|---|---|---|
| 2.1 | dev-backend | `src/guidance/` + registro; `setup-status` (5 grupos) | M |
| 2.2 | dev-backend | `chart-template` (plan base RD, cuentas automáticas, impuestos) | L |
| 2.3 | dev-backend | Datos de ejemplo: `SampleRecord` + migración, carga con servicios existentes, borrado seguro | L |
| 2.4 | dev-backend | `invoice-flow`, `period-close` | M |
| 2.5 | dev-backend | e2e `test/guidance.e2e-spec.ts` (16.4) | M |
| 2.6 | dev-frontend | `app-page-header`, `app-stepper`, `app-readiness-notice` | M |
| 2.7 | dev-frontend | Asistente `/setup`, guía NCF, franja de datos de ejemplo, "Saltar" | L |
| 2.8 | dev-frontend | Pendientes en el Panel (con "Ocultar"), pasos en la factura, cierre de mes guiado | L |
| 2.9 | documentador | Sección 2 (arranque y NCF con capturas de la Oficina Virtual), cierre en la 6; `ayuda.json` | M |
| 2.10 | qa | Suite completa; **prueba cronometrada** (9.7.3) con Carlos y una contadora; usuario nuevo "cierre de mes" | M |
| 2.11 | seguridad | `chart-template` y datos de ejemplo (borrado limitado a lo anotado, solo ADMIN, aislamiento) | M |

### Fase 3 — Semáforo, comparación y Panel · P1: "en orden", entendido por el dueño · efectivo ≈1,5 sem · calendario ≈2 sem
**Requisito que bloquea:** límites por defecto validados por las contadoras (D5).
| # | Agente | Tarea | Tam. |
|---|---|---|---|
| 3.1 | dev-backend | `src/financial-analysis/` + registro; `RatioThreshold` + migración; defaults | M |
| 3.2 | dev-backend | `health` (color, anualización, interpretaciones) y `thresholds` | L |
| 3.3 | dev-backend | `trend`, `compare`, `kpis`; exportaciones | L |
| 3.4 | dev-backend | e2e `test/financial-analysis.e2e-spec.ts` (16.1) | M |
| 3.5 | dev-frontend | `/analysis`: Semáforo y Configuración | L |
| 3.6 | dev-frontend | Tendencia, Comparar; `kpi-strip` en el Panel | L |
| 3.7 | documentador | Sección 11; reportes en la 8 | M |
| 3.8 | qa | Suite completa; cifras a mano; tiempo de la tendencia; usuario nuevo "leer el semáforo" (dueño) | M |
| 3.9 | seguridad | Roles en PUT/DELETE, aislamiento | S |

### Fase 4 — Pantallas existentes guiadas (las hacemos nosotros) · P1: "sin tener que ser contador" en todo el sistema · efectivo ≈1,5 sem · calendario ≈2 sem
**Entregable:** las pantallas del socio cumplen el checklist de la Guía (9.1, P2–P3). Es la fase que más archivos
del socio toca (≈30): su PR se arma **por áreas** (ventas, contabilidad, bancos, configuración, reportes) para que
él lo revise por partes.
| # | Agente | Tarea | Tam. |
|---|---|---|---|
| 4.1 | dev-frontend | `app-empty-state` en las 12 listas | L |
| 4.2 | dev-frontend | `app-field-help` en los formularios restantes; `app-error-notice` en asiento, conciliación y períodos | M |
| 4.3 | dev-frontend | Ícono en `StatusBadge`; un solo botón principal; ajustes a 375 px y teclado | L |
| 4.4 | documentador | Secciones 6, 7, 8 y 9 completas; `ayuda.json` (campos y errores) completo | M |
| 4.5 | qa | Checklist de la Guía pantalla por pantalla; usuario nuevo "compra con retención" y "conciliar el banco" | M |
| 4.6 | revisor-critico | Cambios mínimos y todos en la lista de la sección 17 | S |

### Fase 5 — Auditoría I: rol, encargos, papeles y hallazgos · P1: "con tu contador trabajando en el mismo lugar" · efectivo ≈2 sem · calendario ≈2,5 sem
**Requisito que bloquea:** plantillas de papeles de trabajo validadas por las contadoras.
| # | Agente | Tarea | Tam. |
|---|---|---|---|
| 5.1 | dev-backend | Migración propia del enum `AUDITOR`; modelos y migración de encargos, papeles, procedimientos, hallazgos; plantillas | M |
| 5.2 | dev-backend | Encargos (estados; reabrir solo AUDITOR; bloqueo de cerrado); avisos de la cuenta auditora (5.6) | L |
| 5.3 | dev-backend | Papeles, procedimientos, firmas | M |
| 5.4 | dev-backend | Hallazgos (numeración, estados, respuesta de gerencia, visibilidad) | L |
| 5.5 | dev-backend | Lista de lecturas restringidas en `security.e2e-spec.ts`; e2e 16.2 | M |
| 5.6 | dev-frontend | `Role` + etiquetas + rutas + menú; lista y alta de encargos | M |
| 5.7 | dev-frontend | Encargo, papel de trabajo, hallazgo y respuesta de la gerencia; aviso 5.6 | L |
| 5.8 | documentador | Sección 12 (auditora y gerencia); rol Auditor en la 9 | S |
| 5.9 | qa | Suite completa; recorrido con cada rol; usuario nuevo "encargo de auditoría" con las contadoras | M |
| 5.10 | seguridad | Rol nuevo, rutas, aislamiento, riesgo 5.6 | M |

### Fase 6 — Auditoría II: marcas, archivos e informe · P1: "con tu contador trabajando en el mismo lugar" · efectivo ≈2 sem · calendario ≈2,5 sem
| # | Agente | Tarea | Tam. |
|---|---|---|---|
| 6.1 | dev-backend | Marcas y archivos + migración | S |
| 6.2 | dev-backend | `items`, `marks`, O1, O2 | L |
| 6.3 | dev-backend | Archivos reutilizando almacenamiento y validación | M |
| 6.4 | dev-backend | Informe (incluye "Control de la cuenta auditora") | L |
| 6.5 | dev-backend | e2e 16.3 | M |
| 6.6 | dev-frontend | Partidas con marcas, historial, aviso O2; `audit-files.ts`; Informe | L |
| 6.7 | documentador | Completar la sección 12 | S |
| 6.8 | qa | Suite completa; informe revisado por una contadora | M |
| 6.9 | seguridad | Archivos y marcas sobre documentos ajenos | S |

### Fase 7 — Cierre de la v0.2 · efectivo ≈0,5 sem · calendario ≈0,5–1 sem
| # | Agente | Tarea | Tam. |
|---|---|---|---|
| 7.1 | qa | Suite completa sobre una base **nueva** con todas las migraciones; restauración de respaldo ensayada otra vez | S |
| 7.2 | revisor-critico | Revisión final contra la Guía y este plan | M |
| 7.3 | documentador | Notas de versión dentro del sistema (P10: "nunca cambiar sin avisar"); estado de los PRs al socio | S |
| 7.4 | seguridad | Auditoría del release y verificación de la regla de datos reales | S |

---

## 16. Pruebas que debe hacer qa (e2e con vitest, patrón `test/*.e2e-spec.ts`)
Esqueleto de `test/financial-ratios.e2e-spec.ts`. Antes de cada fase y al final, **toda** la suite en verde.

### 16.1 `test/financial-analysis.e2e-spec.ts` (Fase 3)
Datos del T1 2030 de `financial-ratios.e2e-spec.ts` (utilidad neta 22.000; ingresos totales 91.000; activo
200.000 → 242.000; patrimonio 100.000 → 122.000).
- Razón corriente 2,4167 ⇒ verde; endeudamiento 49,5868 % ⇒ verde (límite 50 %); límite movido a 49,5868 ⇒
  sigue verde, a 49,58 ⇒ amarillo; denominador cero ⇒ gris con nota.
- ROA del T1 = 9,9548 % evaluado como 40,3722 % (× 365/90) con marca "anualizado".
- Límites: PUT de ADMIN y ACCOUNTANT; 403 para APPROVER, VIEWER y AUDITOR; incoherentes ⇒ 400; clave
  inexistente ⇒ 400; A no afecta a B; DELETE restaura; `AuditLog`.
- Tendencia enero–marzo 2030 = 3 puntos a mano; > 24 puntos ⇒ 400; `from > to` ⇒ 400.
- Comparar T1 2030 vs. T1 2029; indicadores (6 claves, cualquier rol, solo su empresa); exportaciones
  (`%PDF`; Excel con "Razón corriente").

### 16.2 `test/auditing.e2e-spec.ts` y `test/auditor-role.e2e-spec.ts` (Fase 5)
- Con la enumeración de rutas de "Política de rutas": AUDITOR recibe **403 en toda escritura fuera de
  `/auditing`**, con una sola excepción explícita (`POST /feedback`); 200 en lecturas de muestra.
- `/auditing` da 403 a ACCOUNTANT, APPROVER y VIEWER; `security.e2e-spec.ts` lista exactamente las lecturas
  restringidas diseñadas.
- **El ADMIN recibe 403 al reabrir un encargo**; el AUDITOR reabre con motivo (sin motivo ⇒ 400).
- Restablecer la clave del AUDITOR (como ADMIN, con el endpoint existente) ⇒ sus tokens dejan de servir y el
  encargo muestra el aviso con el nombre del ADMIN y la fecha; el informe lo incluye.
- La migración del enum está sola en su carpeta (comprobación sobre `prisma/migrations`).
- Aislamiento (404 en todo lo de otra empresa); encargo duplicado ⇒ 409; fechas invertidas ⇒ 400;
  precarga de áreas; cerrar con pendientes ⇒ 422; cerrado ⇒ escrituras 422.
- Hallazgos: 10 altas en paralelo sin huecos ni repetidos; ADMIN no ve DRAFT; responde solo COMMUNICATED;
  AUDITOR no responde (403); borrar solo DRAFT; `AuditLog` en cada escritura.

### 16.3 Fase 6 (en `auditing.e2e-spec.ts`)
Marcas en los 4 tipos; documento ajeno ⇒ 404; fuera del período ⇒ 422; reemplazo; filtros y paginación; O1
devuelve solo filas del documento pedido; O2: anular una factura marcada ⇒ aviso. Archivos: PDF válido ok;
ejecutable renombrado ⇒ rechazado; ajeno ⇒ 404; encargo cerrado ⇒ bloqueado; tope 50. Informe: `%PDF`, Excel
con H-001, título y respuesta; "BORRADOR" si no está cerrado; VIEWER ⇒ 403.

### 16.4 `test/guidance.e2e-spec.ts` (Fase 2)
- Empresa nueva: los 5 grupos pendientes con su ruta; cada acción los va completando.
- `chart-template`: solo ADMIN (403 a los demás, incluido AUDITOR); cuentas todas clasificadas y cuentas
  automáticas completas; impuestos ligados a cuentas de la misma empresa; **segunda llamada ⇒ 409** sin
  cambios; empresa B intacta; `AuditLog`.
- Tras la plantilla y una secuencia NCF, emitir una factura de venta funciona sin más configuración.
- **Datos de ejemplo**: solo en empresa sin documentos (si no, 422); carga y anota todo; el balance cuadra;
  **borrar** deja la empresa sin un solo registro de ejemplo y sin tocar nada real ni de otra empresa; se niega
  si un cobro **real** está aplicado a una factura de ejemplo o si un período con ejemplos está cerrado; solo
  ADMIN; `AuditLog`.
- `invoice-flow` (borrador → emitida → cobro parcial → cobrada → conciliada; ajena ⇒ 404) y `period-close`
  (chequeos fallidos con enlace; al resolverlos, todo en verde).

### 16.5 `test/feedback.e2e-spec.ts` (Fase 1)
POST de cada uno de los 5 roles; > 2.000 caracteres ⇒ 400; límite por hora ⇒ 429; `mine` solo los propios;
listado y PATCH solo ADMIN y solo de su empresa; `security.e2e-spec.ts` sigue pasando (escritura con roles
explícitos).

### 16.6 Pruebas manuales de la Fase 1 (qa)
- Factura a medio llenar (3 líneas, fechas, moneda) → Crear cliente → queda elegido y **todo lo escrito sigue
  igual**; igual en compra (Proveedor), nota de crédito, cobro y pago.
- Editar el NCF por defecto del cliente ⇒ la factura muestra el nuevo; cambiar el tipo a Proveedor en una venta
  ⇒ se quita la selección con aviso; error del servidor dentro del diálogo; Cancelar no cambia nada.
- "Ir a clientes y proveedores" abre otra pestaña con sesión; `/partners` se comporta igual que antes.
- APPROVER y VIEWER no ven Crear ni Editar.
- Ayuda: cada "?" abre la sección y el ancla correctas; `verificar-ayuda` sin rutas sin mapear; el panel no
  borra lo escrito; recargar `/help/04-facturas` funciona; archivo inexistente ⇒ "sección no encontrada"; la
  consola **no** muestra bloqueos de CSP.
- "Ocultar ayudas" oculta lo definido en 9.5 y no lo demás; se recuerda al volver a entrar.
- Un mensaje de validación provocado a propósito sale en español con el nombre del campo.
- Enviar comentario desde 3 pantallas distintas: la ruta queda bien registrada.

### 16.7 En todas las fases con pantallas
Checklist de la Guía (sección 6) y prueba de usuario nuevo (9.7). Su resultado es parte del veredicto de qa.

---

## 17. Archivos existentes del socio que se modifican (para coordinar)

Lo demás son **archivos nuevos**. Conteo real por fase (un archivo cuenta una vez, en la primera fase que lo toca).

**Repo backend (`finanzas_run`)**
| # | Archivo | Cambio | Fase | Riesgo |
|---|---|---|---|---|
| B1 | `package-lock.json` | Regenerado (PR 0) | 0 | Medio (los lockfiles chocan fácil) |
| B2 | `src/app.setup.ts` | Body 6 MB (PR 0, ya hecho en el ambiente de pruebas) | 0 | Bajo |
| B3 | `prisma/schema.prisma` | `Feedback` (1); `SampleRecord` (2); `RatioThreshold` (3); `AUDITOR` + modelos de auditoría (5–6); en `Company` 4 líneas de relación (`feedbacks`, `sampleRecords`, `ratioThresholds`, `auditEngagements`); bloques nuevos **al final** | 1–6 | **Medio**: lo que más toca el socio |
| B4 | `src/app.module.ts` | Imports de `FeedbackModule` (1), `GuidanceModule` (2), `FinancialAnalysisModule` (3), `AuditingModule` (5) | 1–5 | Bajo |
| B5 | `test/security.e2e-spec.ts` | Lecturas restringidas: `/feedback` (1) y `/auditing/...` (5) | 1, 5 | Bajo |
Más carpetas nuevas en `prisma/migrations/` (ninguna existente se modifica). **Total backend: 5 archivos.**

**Repo frontend (`finanzas_run_frontend`)**
| # | Archivo | Cambio | Fase | Riesgo |
|---|---|---|---|---|
| F1 | `Dockerfile` | Seguridad (PR 0) | 0 | Bajo |
| F2 | `deploy/nginx.conf` | Seguridad (PR 0) + bloque `/manual/` (1) | 0, 1 | Bajo |
| F3 | `deploy/security-headers.conf` | CSP y cabeceras (PR 0) | 0 | Bajo |
| F4 | `package.json` | `marked`; script `verificar-ayuda` | 1 | Bajo |
| F5 | `package-lock.json` | Por `marked` | 1 | Medio (se regenera al unir) |
| F6 | `src/app/app.routes.ts` | `help` (1), `setup` (2), `audit` (5) + comentario de áreas | 1, 2, 5 | Bajo |
| F7 | `src/app/layout/nav.ts` | Menú 9.4 (1) + entradas por fase (2, 3, 5) | 1–5 | Bajo-medio |
| F8 | `src/app/layout/shell.html` | "?", migas, siguiente paso, Enviar comentario, Ocultar ayudas, franja de ejemplos (2) | 1, 2 | Bajo-medio |
| F9 | `src/app/layout/shell.ts` | Imports | 1, 2 | Bajo |
| F10 | `src/app/shared/ui/index.ts` | 1 línea por componente nuevo | 1, 2, 4 | Bajo |
| F11 | `src/app/core/errors.ts` | 2–3 líneas: traductor | 1 | Bajo |
| F12 | `src/app/shared/labels.ts` | Etiquetas nuevas al final; `AUDITOR` en `ROLE` (5); casos en `tone()` | 1–6 | Medio-bajo |
| F13 | `src/app/features/catalog/partners.ts` | Modal y formulario pasan a `partner-dialog.ts`; textos | 1 | **Alto** (≈70 líneas en su pantalla de referencia) |
| F14 | `src/app/features/sales/invoice-form.html` | Botones, diálogo, ayudas, aviso previo (2), textos | 1, 2 | Medio |
| F15 | `src/app/features/sales/invoice-form.ts` | Lógica de selección, imports | 1, 2 | Medio |
| F16 | `src/app/features/sales/payment-form.ts` | Igual que la factura | 1, 2 | Medio |
| F17 | `src/app/features/dashboard/dashboard.html` | Pendientes (2), indicadores (3) | 2, 3 | Bajo |
| F18 | `src/app/features/dashboard/dashboard.ts` | Imports | 2, 3 | Bajo |
| F19 | `src/app/features/sales/invoice-detail.html` | Pasos de la factura | 2 | Bajo |
| F20 | `src/app/features/sales/invoice-detail.ts` | Import | 2 | Bajo |
| F21 | `src/app/features/ledger/ledger.routes.ts` | Ruta `period-close` | 2 | Bajo |
| F22 | `src/app/features/reporting/reporting.routes.ts` | Ruta `analysis` | 3 | Bajo |
| F23 | `src/app/core/auth.ts` | `'AUDITOR'` en `Role` | 5 | Bajo |
| F24–F35 | `admin/users.ts`, `catalog/account-classification.ts`, `catalog/accounts.ts`, `catalog/document-sequences.ts`, `catalog/tax-rates.ts`, `ledger/entries.ts`, `reporting/budgets.ts`, `sales/invoices.ts`, `sales/payments.ts`, `treasury/reconciliations.ts`, `sales/receivables.ts`, `reporting/dgii.html` | Estados vacíos (+ textos C2 donde se toquen) | 4 | Medio por cantidad |
| F36–F41 | `catalog/accounting-settings.ts`, `catalog/ncf.ts`, `ledger/opening-balances.ts`, `ledger/entry-form.ts`, `treasury/reconciliation-detail.ts`, `ledger/fiscal-periods.ts` | Ayudas de campo / errores con enlace / enlace al cierre guiado | 4 | Medio |
| F42–F44 | `treasury/reconciliation-detail.html`, `reporting/budget-detail.html`, `treasury/bank-account-detail.html` | Un solo botón principal | 4 | Bajo |
| F45 | `src/app/shared/ui/badge.ts` | Ícono en los estados | 4 | Bajo (afecta a todas las pantallas a la vez) |
| F46–F57 | Hasta 12 pantallas más por ajustes de 375 px / teclado (`company.ts`, `profile.ts`, `journals.ts`, `entry-detail.ts`, `fiscal-years.html`, `payment-detail.ts`, `bank-accounts-tab.ts`, `bank-rules-tab.ts`, `cash-registers-tab.ts`, `transfers-tab.ts`, `reports.html`, `styles.css`) | Ajustes puntuales, solo si qa los encuentra | 4 | Medio |

**Resumen del conteo**
| | Backend | Frontend | Total |
|---|---|---|---|
| Fase 0 (PR 0) | 2 | 3 | 5 |
| Fases 1–3 | 3 | 20 | 23 |
| Fase 4 (adopción guiada) | 0 | 22 seguros + hasta 12 posibles | 22–34 |
| Fases 5–6 | 0 nuevos (B3–B5 ya contados) | 1 nuevo (F23) | 1 |
| **Total** | **5** | **46 a 58** | **≈51 seguros, ≈63 en el peor caso** |
Lo más delicado: `partners.ts` (F13), `schema.prisma` (B3) y la Fase 4 por cantidad. Por eso cada fase va en
su propio PR y la Fase 4 se divide por áreas.

---

## 18. Decisiones

### 18.1 Tomadas por Carlos (2026-10-10)
| # | Decisión |
|---|---|
| D1 | Rol **AUDITOR**, con restricciones: el ADMIN no reabre encargos; riesgo de clave mitigado (5.6); sin hablar de "independencia" |
| D2 | Un correo por empresa para auditoras con varias empresas: **se acepta como deuda** (20.1) |
| D3 | Se aplica la recomendación: la gerencia ve hallazgos comunicados, responde y descarga el informe (13.1) |
| D4 | Solo el ADMIN responde hallazgos |
| D5 | Límites del semáforo validados por las contadoras: **requisito que bloquea la Fase 3** |
| D6 | O1 (historial de un documento) y O2 (cambió después de revisado): **sí** |
| D7 | Orden de fases de la sección 15 |
| D8 | Informe de revisión, **no** dictamen |
| D9 | Socio: **entrega pequeña por fase con historial compartido**. Plan A: organización compartida (Carlos la propone); Plan B: forks (12) |
| D10 | "Tercero" → "cliente / proveedor" **solo en lo que se toca** |
| D11 | `marked` aprobada |
| D12 | "Ir a clientes y proveedores" en **otra pestaña** |
| D13 | Las pantallas del socio (Fase 4) las adaptamos **nosotros** |
| D14 | Plan de cuentas base RD validado por las contadoras: **requisito que bloquea la Fase 2** |
| D15 | Paleta Ctrl+K: **a la v0.3** |
| D16 | Prueba de usuario nuevo: Carlos (perfil dueño), el socio, las 2 contadoras y quien tenga usuario |
| — | Auditoría **se queda** en la v0.2 (la usan y prueban las contadoras, que validan las plantillas) |
| — | DuPont, punto de equilibrio y vertical/horizontal **a la v0.3** |

### 18.2 Pendientes (en lenguaje sencillo)
| # | Pregunta | Recomendación |
|---|---|---|
| D17 | ¿**Dónde** guardamos la copia de los respaldos fuera del servidor? | Otro servidor o almacenamiento tuyo, con acceso solo para esto; el respaldo sale cifrado. Te damos las opciones con precio y el paso a paso |
| D18 | ¿Quién guarda la **frase secreta** de los respaldos? | Tú, en un gestor de claves y en papel en un lugar seguro. Sin ella, los respaldos no se pueden abrir |
| D19 | ¿Le pedimos al socio que impida que un administrador restablezca la clave de un usuario Auditor (5.6, alternativa fuerte)? | Proponérselo como mejora; no bloquea la v0.2 |
| D20 | Nombre de la organización de GitHub (Plan A) | Uno neutro que sirva para todo el producto, no solo Finanzas; lo eligen tú y tu socio |
| D21 | Plan **GitHub Team** para la organización (≈12 USD/mes con 3 puestos) | Sí: sin él no se puede proteger la rama principal en repos privados |
| D22 | Respuesta del socio al Plan A | Si no acepta, se aplica el Plan B sin cambiar el resto del plan |

---

## 19. Estimación: trabajo efectivo y calendario

**Trabajo efectivo** = días de los agentes. **Calendario** = además las esperas: revisión de cada PR por el
socio (≈2–3 días por fase, no bloquea empezar la siguiente salvo choques), validaciones de las contadoras que
**bloquean** (plan de cuentas antes de la Fase 2, límites antes de la 3, plantillas antes de la 5: ≈2–5 días cada
una si se piden en la Fase 0) y pruebas de usuarios nuevos (≈2 días por fase).

| Fase | Trabajo efectivo (días por agente) | Efectivo | Calendario con esperas |
|---|---|---|---|
| 0 Preparación, repos, respaldos | devops 3,5, seguridad 0,5, qa 0,5, doc 2 (+ Carlos en GitHub) | ≈1 sem | ≈1,5 sem |
| 1 Crear sin salir, Ayuda, base guiada, comentarios | front 8, back 1,5, devops 0,5, qa 2, seguridad 0,5, doc 3 | ≈1,5 sem | ≈2 sem |
| 2 Arranque guiado, ejemplos, NCF, flujos | back 8, front 7, qa 2,5, seguridad 1, doc 2 | ≈2,5 sem | ≈3–3,5 sem |
| 3 Semáforo, comparación, Panel | back 5, front 4, qa 1,5, seguridad 0,5, doc 1,5 | ≈1,5 sem | ≈2 sem |
| 4 Pantallas existentes guiadas | front 7, qa 2, doc 2, revisor 0,5 | ≈1,5 sem | ≈2 sem |
| 5 Auditoría I | back 6, front 5, qa 2, seguridad 1, doc 0,5 | ≈2 sem | ≈2,5 sem |
| 6 Auditoría II | back 6, front 3, qa 2, seguridad 0,5, doc 0,5 | ≈2 sem | ≈2,5 sem |
| 7 Cierre | qa 0,5, revisor 1, doc 0,5, seguridad 0,5 | ≈0,5 sem | ≈0,5–1 sem |
| **Total** | | **≈12,5 semanas** | **≈15,5 a 17 semanas** |

Backend y frontend avanzan en paralelo dentro de cada fase; las fases van en serie para que las contadoras
prueben cada una. Lo que más puede alargar el calendario: que las validaciones de las contadoras no se pidan
desde la Fase 0, y choques con el socio en la Fase 4.

---

## 20. Riesgos y avisos de deuda técnica

### 20.1 Deuda (para decidir con los ojos abiertos)
1. **`PLAN.md` v3.1 y la realidad se separaron** (Next.js en plataforma vs. Angular con login propio). Cada
   pantalla y rol nuevo encarece una migración futura a plataforma. Conviene que Carlos y el socio decidan si
   ese plan sigue en pie.
2. **Roles fijos**: AUDITOR es el quinto. Más perfiles ⇒ pasar a permisos por acción, no sumar roles.
3. **Usuario de una sola empresa** (D2): la auditora con varias empresas usa varios correos; el portal del
   contador (P9) lo resolverá.
4. **Duplicado menor**: archivos del auditor y `audit-files.ts` se parecen a adjuntos (≈1 día unificarlos).
5. **Preferencia "Ocultar ayudas" en el navegador**: no viaja entre equipos; pasar al servidor cuando haya
   preferencias de usuario.
6. **Guía NCF** con su propio formulario (además de `ncf.ts`): las validaciones deben mantenerse iguales a las del
   backend; qa lo comprueba.

### 20.2 Riesgos
| Riesgo | Impacto | Mitigación |
|---|---|---|
| Pérdida de datos (hoy no hay respaldos) | Gravísimo | Fase 0: respaldos diarios cifrados, copia externa, restauración ensayada por fase; regla de datos reales |
| Se pierde la frase de cifrado | Gravísimo (respaldos inútiles) | Carlos la guarda en dos lugares fuera del servidor (D18); prueba de restauración la usa |
| Datos reales antes de tiempo | Grave | Regla 11.1, verificada por seguridad en cada release |
| El auditor modifica contabilidad | Grave | Prueba que recorre todas las rutas; nunca `Object.values(UserRole)` |
| El ADMIN actúa como la auditora | Medio | 5.6: aviso visible e informe; alternativa fuerte propuesta al socio |
| Fuga entre empresas | Grave | `companyId` del token, llaves compuestas, 404, pruebas por ruta |
| Borrado de datos de ejemplo toca datos reales | Grave | Solo registros anotados; negativa si hay dependencias reales o períodos cerrados; pruebas y revisión de seguridad |
| Plan de cuentas base con errores | Alto | Validación escrita de las contadoras (bloquea); solo en empresas sin cuentas; editable |
| No se logra la primera factura en < 15 min | Medio | Prueba cronometrada como condición de cierre de la Fase 2; lista de dónde se va el tiempo |
| Choques con el socio | Medio | Historial compartido (organización o forks); PR pequeño por fase; Fase 4 dividida por áreas; lista exacta (17) |
| El socio tarda en revisar o aprobar | Medio (calendario) | La fase siguiente puede partir de nuestra rama; tablero visible para los dos; se dice en el PR |
| La cuenta máquina o su token se filtran (Plan A) | Medio | Rol Write sin ser dueño, `main` protegida con aprobación humana, token con permisos mínimos y vencimiento de 90 días, 2FA en la cuenta; se retira en un clic |
| La transferencia de repos sale mal | Bajo | GitHub conserva historial y redirecciones; se verifica clonando y comparando antes de seguir |
| Los repos del socio cambiaron desde el 9-oct | Medio | Comparación archivo por archivo en la migración (12.3) |
| La migración de repos rompe el ambiente de pruebas | Medio | Respaldo previo; reconstrucción verificada por qa antes de seguir |
| Mensaje sin "cómo arreglarlo" o ruta sin ayuda | Bajo-medio | `verificar-ayuda` en cada fase; traductor muestra el original si no reconoce |
| Exceso de guía molesta a expertos | Medio | "Ocultar ayudas", "Saltar", "Ocultar la lista" (9.5) |
| La experiencia guiada se vuelve un rediseño sin fin | Alto (calendario) | Checklist cerrado de la Guía; lista de pantallas cerrada (9.1, 17); lo nuevo, a la siguiente versión con decisión de Carlos |
| Comentarios con datos sensibles o abuso | Bajo | Límite por hora, longitud, texto escapado, solo dentro del servidor |
| Semáforo engañoso | Medio | Aviso de cuentas sin clasificar, anualización rotulada, límites validados y ajustables |
| Tendencia lenta | Bajo-medio | 24 puntos máx., medición, plan B |
| Informe confundido con dictamen | Medio | "Informe de revisión", "BORRADOR" mientras esté abierto |
| Despliegue rompe lo que usan las contadoras | Medio | Respaldo previo, suite en verde, migraciones aditivas |

---

## 21. Fuera de la v0.2

**A la v0.3** (Guía, sección 7): 2FA y exportación completa (condiciones para datos reales); paleta Ctrl+K y
atajos; DuPont, punto de equilibrio, análisis vertical y horizontal (anexo 6.5); conciliación de 2 columnas;
calendario fiscal e IT-1/IR-17; importadores de Excel; alertas de respaldo por correo; visor general de la
bitácora.
**Después**: portal del contador multiempresa, recibos por foto, IA, API pública y webhooks.
**No se hace**: dictamen formal, rediseño visual de pantallas existentes, recorridos animados, librerías de UI.

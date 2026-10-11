# Plan técnico v0.2 — Experiencia guiada, ayuda integrada, herramientas del auditor y análisis financiero

Fecha: 2026-10-10 · Autor: Arquitecto · Estado: **PROPUESTA** (pendiente de revisor-critico y de Carlos)
Plan anterior: `docs/PLAN.md` (v3.1). **No se reemplaza**; este documento solo cubre la v0.2.
El veredicto de calidad de cada fase es de `qa`; la aprobación de negocio, de Carlos.

---

## 0. Resumen para Carlos (una página)

**Principio rector de toda la v0.2: que cualquier persona pueda usar el sistema sin
capacitación.** Cada pantalla nueva o tocada debe decir dónde estás, para qué sirve y qué hacer
después; las tablas vacías explican y ofrecen crear el primero; los errores dicen cómo
arreglarlos; y una empresa nueva se configura con un asistente paso a paso (sección 6E).

**Qué se construye**
1. **Herramientas para la auditora externa**: un usuario nuevo "Auditor" que puede **ver toda** la
   contabilidad de la empresa y **escribir solo** en su módulo de auditoría. Ahí abre un
   **encargo** (empresa + período), trabaja por **áreas** (caja y bancos, cuentas por cobrar,
   impuestos...), con su objetivo, lista de pasos a revisar, conclusión y archivos; **marca con
   una tilde** los asientos, facturas, pagos y conciliaciones que revisó; registra **hallazgos**
   con su gravedad y recomendación; la gerencia responde; y al final saca un **informe en PDF y
   Excel**.
2. **Razones financieras más útiles**: **semáforo** verde/amarillo/rojo con una frase sencilla que
   explica qué significa cada número (los límites se ajustan por empresa); **comparación** mes a
   mes y contra el año anterior con gráficas; **6 indicadores clave** en el panel principal;
   y nuevos análisis: **EBITDA, DuPont, punto de equilibrio, análisis vertical y horizontal**.
3. **Arreglos que pidieron las pruebas**: en la factura y en los cobros/pagos, al lado del
   selector de cliente o proveedor, botones para **crearlo o editarlo sin salir** de la factura
   (y sin perder lo escrito), y un enlace a la lista completa. "Tercero" pasa a decir "cliente /
   proveedor" en pantalla, y "Clientes y proveedores" se mueve al grupo "Ventas y compras".
4. **Manual de usuario dentro del sistema**: una sección "Ayuda" en el menú, organizada por
   tareas y escrita para contadoras, y un botón **"?"** arriba en cada pantalla que abre la parte
   del manual que corresponde, en un panel lateral, sin salir de lo que se está haciendo. El
   documentador lo mantiene editando archivos de texto, sin tocar programación.
5. **Experiencia guiada**: migas de pan y "siguiente paso" en todas las pantallas; un
   **asistente de configuración inicial** (con un plan de cuentas base de RD para cargar con un
   clic) y una lista de "pendientes de configurar" en el Panel; indicador de pasos en
   factura → cobro → conciliación y un **cierre de mes guiado**; errores en español sencillo con
   enlace a la solución; ayudas en los campos contables difíciles. Incluye una **auditoría de
   usabilidad** de las pantallas actuales con su costo (6E.1).

**Cómo, sin estorbar al socio**: casi todo va en **módulos y archivos nuevos**. Las 20 razones
que ya existen **no se tocan**: los análisis nuevos las reutilizan. Se tocan **unos 28 archivos
existentes** en las Fases 1A–4 (casi todos con 1 a 5 líneas; el único cambio grande es sacar el
formulario de clientes/proveedores a una pieza reutilizable) y ≈18 más si la Fase G2 la hacemos
nosotros (lista completa en la sección 11).

**Orden recomendado y qué podrán probar las contadoras**:
- **Fase 1A (≈1,5 semanas)**: crear y editar clientes/proveedores desde la factura y los pagos,
  textos y menú nuevos, migas y "siguiente paso" en todas las pantallas, errores en español, y la
  Ayuda con las primeras secciones del manual.
- **Fase G1 (≈2 semanas)**: asistente de configuración inicial, pendientes en el Panel, pasos de
  la factura y cierre de mes guiado.
- **Fase 1B (≈1,5 semanas)**: semáforo, comparación, indicadores del Panel y resto del manual.
- **Fase G2 (≈1,5 semanas)**: llevar la experiencia guiada a las pantallas existentes de tu
  socio (acordado con él).
- **Fases 2 y 3 (≈4 semanas)**: herramientas del auditor. **Fase 4 (≈2)**: razones adicionales.
  **Fase 5**: entrega al socio.

**Esfuerzo total**: **≈13 a 15 semanas** de calendario (detalle en la sección 13). Si se deja
la Fase G2 para que la haga tu socio con los componentes que le entregamos, ≈11,5 a 13,5.

**Lo que necesito que decidas** (detalle en la sección 12): rol nuevo "Auditor" (recomendado);
qué ve el administrador de la empresa auditada; si una auditora con varias empresas usa un
correo por empresa; que las contadoras validen los límites del semáforo; el orden de las fases;
hasta dónde cambiar la palabra "tercero"; aceptar una pieza pequeña de software libre para
mostrar el manual; que las contadoras validen el plan de cuentas base de RD; quién adapta las
pantallas del socio a la experiencia guiada; y hablar con tu socio **antes de
empezar** (la Fase 1A ya toca la pantalla de clientes/proveedores y el menú, que son suyos).

---

## 1. Punto de partida (verificado en el código el 2026-10-10)

| Tema | Estado real |
|---|---|
| Arquitectura en uso | Backend NestJS 11 + Prisma 7 + Postgres con **login propio y 4 roles fijos**, y pantallas Angular 22 en `frontend/`. Es **distinto** de lo que proponía `PLAN.md` v3.1 (pantallas en Next.js dentro de plataforma, pase firmado, permisos `fin.*`). La v0.2 se construye **sobre lo que existe hoy**. Ver aviso de deuda en 14.1. |
| Razones | `src/reports/generators/financial-ratios.generator.ts`: 20 razones para un rango `[from, to]`, más un "estado" con `ebitda`, `ebit`, ingresos, costos, y saldos de balance al inicio y al cierre. **El EBITDA ya se calcula** (no se muestra como indicador). Las de rentabilidad **no se anualizan** (lo avisa en `warnings`). |
| Fotos de razones | La tabla `FinancialRatioSnapshot` existe en el esquema pero **ningún código la usa**. La v0.2 tampoco la usa (ver 7.3). |
| Exportación | `src/exports`: todo reporte se convierte a un `TableDoc` (`table-doc.ts`) y de ahí salen el PDF (`pdf.renderer.ts`, pdfkit) y el Excel (`xlsx.renderer.ts`, exceljs). `renderPdf` y `renderXlsx` son **funciones sueltas que se pueden importar** sin tocar el módulo. En el PDF las celdas de tabla **se recortan con "..."** pero las `notes` de cada sección **sí se ajustan en varias líneas**: sirven para textos largos (hallazgos). Fuente Helvetica: solo caracteres latinos (letras con tilde y ñ sí; símbolos como "≥" salen como "?"). |
| Adjuntos | `src/attachments`: el "dueño" del archivo está fijo en 4 campos (factura, pago, asiento, conciliación) y subir está prohibido a VIEWER. El almacenamiento (`file-storage.ts`, `LocalFileStorage`) y la validación de tipo (`file-type.ts`: `detectFile`, `sanitizeFileName`, `contentDisposition`) son **reutilizables sin modificarlos**. |
| Bitácora | `AuditLog` + `writeAudit(tx, user, entidad, id, acción, cambios)` en `src/common/audit.ts`, dentro de la misma transacción. Se usa en 19 archivos. No tiene pantalla. |
| Roles | `UserRole` = ADMIN, ACCOUNTANT, APPROVER, VIEWER. `RolesGuard`: **sin `@Roles` no restringe**. Todas las escrituras actuales declaran roles explícitos (lo vigila `test/security.e2e-spec.ts`, "Política de rutas"). **Ninguna lista de `@Roles` incluiría un rol nuevo**: un rol nuevo nace con lectura total y cero escritura. |
| Prueba de rutas | `security.e2e-spec.ts` exige: toda ruta con `JwtAuthGuard`; toda escritura con `@Roles`; y que las **únicas lecturas restringidas** sean `/users/` y `/users/:id`. Si la v0.2 restringe lecturas de auditoría, **esa expectativa se actualiza** (archivo existente modificado). |
| Usuarios | Un usuario pertenece a **una sola** empresa y el correo es único en todo el sistema. Los usuarios no se borran, se desactivan. |
| Pantallas | Kit propio en `frontend/src/app/shared/ui` (`Modal`, `Pagination`, `StatusBadge`, `Combobox`, `ChartView` sobre chart.js, `ExportButtons`, `AttachmentsPanel`), estilos globales en `styles.css` (`.page`, `.panel`, `.figures/.figure`, `.tabs/.tab`, `.table`, `.badge` con tonos `pos/warn/neg`, `.notice`). **No hay Tailwind** en este proyecto: no se introduce. |
| Despliegue | El contenedor `migrate` corre `prisma migrate deploy` antes de la API: las migraciones nuevas se aplican solas al desplegar en pruebas. |
| Suelto | `test/budgets.e2e-spec (1).ts` es una copia vieja que **no se ejecuta** (el nombre no coincide con el patrón). No es nuestro: se avisa al socio. |

---

## 2. Convenciones del socio que se respetan

La v0.2 se le entrega al socio para que la una a su repositorio: **tiene que parecer escrita por
él**. Cada desarrollador **imita** estos ejemplos concretos; el revisor-critico y qa rechazan lo
que se aparte sin justificación escrita.

### 2.1 Backend

| Convención | Ejemplo existente a imitar | Regla para la v0.2 |
|---|---|---|
| Módulo por carpeta | `src/budgets/` = `budgets.controller.ts`, `budgets.service.ts`, `budgets.module.ts`, `dto/budget.dto.ts` | `src/auditing/` y `src/financial-analysis/` con la misma forma. Subcarpetas solo si ya hay precedente (`src/reports/generators/`). |
| Imports ESM con `.js` | `import { BudgetsService } from './budgets.service.js';` | Siempre con extensión `.js`. |
| Guards en la clase | `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Controller('budgets')` | Igual en cada controlador nuevo. |
| Roles por ruta | `@Post() @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)` | **Toda** escritura con `@Roles` explícito. Lecturas restringidas también con `@Roles`. Nunca `Object.values(UserRole)`. |
| Usuario actual | `@CurrentUser() user: AuthUser` y `companyId` sacado **solo** de `user.companyId` | Ningún DTO acepta `companyId`. |
| Validación | class-validator en DTOs (`CreateBudgetDto`: `@IsString() @MinLength(2) @MaxLength(120)`), `ValidationPipe` global con `whitelist` + `forbidNonWhitelisted` | Igual; textos largos con `@MaxLength` (p. ej. 5.000 caracteres). Ids con `ParseUUIDPipe`. Fechas con `@IsDateString()` como en `reports-queries.dto.ts`. |
| Auditoría en la misma transacción | `attachments.service.ts`: `this.prisma.$transaction(async (tx) => { ...create...; await writeAudit(tx, user, 'Attachment', row.id, AuditAction.CREATE, {...}); })` | Toda escritura del módulo de auditoría y de configuración de razones deja su `writeAudit`. Se usan las acciones existentes (CREATE, UPDATE, DELETE, CLOSE, APPROVE): **sin tocar el enum `AuditAction`**. |
| Filtro por empresa en escrituras | `tx.account.update({ where: { id: accountId, companyId: user.companyId }, ... })` (lo vigila el test "escrituras por id siempre con companyId") | Todo `update/delete` por id lleva `companyId`. |
| 404 si es de otra empresa | `findFirst({ where: { id, companyId } })` → `NotFoundException('... no encontrado')` | Igual: nunca 403 por documentos ajenos (no revelar que existen). |
| Bloqueo de lo cerrado | `assertNotLocked` en adjuntos: `UnprocessableEntityException('El período fiscal "X" está cerrado')` | Encargo cerrado ⇒ 422 con mensaje en español. |
| Duplicados | `isUniqueViolation(e)` de `src/common/audit.ts` → `ConflictException` | Igual. |
| Numeración correlativa | `Journal.nextNumber` incrementado dentro de la transacción | Numeración de hallazgos (H-001...) con un `nextFindingNumber` en el encargo, mismo patrón. |
| Dinero y decimales | `Prisma.Decimal`, `ZERO`, `dec()` de `reports/accounting-nature.utils.ts`; redondeo `toDecimalPlaces(4)`; `null` + `note` cuando el denominador es cero (`mk(...)` en el generador de razones) | Los análisis nuevos devuelven igual: valores decimales como texto, `null` con nota explicativa. |
| "Quién" sin relación | `FiscalYear.closedById String?` (sin relación a `User`) | Los campos "quién marcó / quién respondió" se guardan así, para **no tocar el modelo `User`**. |
| Generadores de reportes | `FinancialRatiosGenerator` inyecta `BalanceSheetGenerator` e `IncomeStatementGenerator` (exportados por `ReportsModule`) | Los análisis nuevos **inyectan** esos generadores; no copian su lógica. |
| Exportaciones | Builder que devuelve `Section[]` (`exports.builders.ts`, p. ej. `ratiosSections`) + `renderPdf/renderXlsx`; cabeceras de `ExportsController.send` (`Content-Disposition` saneado, `nosniff`, `no-store`) | Builders propios en cada módulo nuevo; se importan `renderPdf/renderXlsx` y se repiten las mismas cabeceras. |
| Comentarios | En español, explican el **porqué** (`// Sin historia previa (balance inicial en cero) un promedio con cero subestimaría los saldos`) | Igual. |
| Pruebas e2e | `test/financial-ratios.e2e-spec.ts`: `createApp({ silent: true })`, dos empresas con sufijo `Date.now().toString(36)`, usuarios creados con `bcrypt.hash(password, 4)`, `token[rol]`, helper `api(método, url, quién)`, montos **calculados a mano** en el comentario inicial, limpieza en `afterAll` en orden de llaves foráneas | Mismo esqueleto en cada archivo nuevo. |

### 2.2 Frontend

| Convención | Ejemplo existente a imitar | Regla para la v0.2 |
|---|---|---|
| Componentes | `dashboard.ts`: `standalone`, `changeDetection: ChangeDetectionStrategy.OnPush`, `imports: [RouterLink, ...UI]`, estado con `signal()` y `computed()`, `inject()` | Igual. Sin `NgModule`, sin zone, sin RxJS salvo `firstValueFrom` (como `users.ts`). |
| Rutas por área | `features/reporting/reporting.routes.ts` con `loadComponent`; el área se carga en `app.routes.ts` con `loadChildren` | Área nueva `features/audit/audit.routes.ts`. El análisis financiero va en el área existente `reporting`. |
| Menú | `layout/nav.ts`, `NavItem.roles` | Entradas nuevas con `roles` donde aplique. |
| Guardas | `roleGuard(...roles)` de `core/guards.ts` | Rutas de auditoría con `roleGuard('ADMIN', 'AUDITOR')`. |
| Etiquetas | `shared/labels.ts`: `ROLE`, `INVOICE_STATUS`... + `tone()` para el color + `opts` para selectores | Todas las etiquetas nuevas ahí (agregadas **al final** para reducir choques). |
| API | `Api.getP<T>(ruta, query)`, `api.download(...)`; errores con `errorMessage(e)` y `Notify` | Igual. |
| Gráficas | `<app-chart [config]="chart()" height="250px" />` con `ChartConfiguration` en un `computed` (`dashboard.ts`) | Igual. Colores: los ya usados (`#0c6b5e`, `#e0a526`) y variables CSS. |
| Exportar | `<app-export-buttons [path]="..." [query]="..." name="..." />` | Se reutiliza tal cual apuntando a las rutas nuevas. |
| Dinero | `decimal.js` vía `shared/format.ts` (`dec`, `sumDec`) y pipes `money`, `fdate`, `lbl`, `signClass` | Igual. Nunca `Number()` para sumar dinero. |
| Estilos | Clases globales de `styles.css`; estilos locales cortos en `styles:` del componente | **Ningún estilo nuevo suelto** fuera de lo imprescindible del componente; nada de librerías de UI. |
| Botones según rol | `@if (auth.has('ADMIN', 'ACCOUNTANT')) { ... }` | Igual; la API valida de todas formas. |

### 2.3 Librerías nuevas

**Backend: ninguna.** Todo se resuelve con lo instalado (NestJS, Prisma, class-validator, pdfkit,
exceljs).

**Frontend: una sola, propuesta para la Ayuda integrada: `marked`** (convierte Markdown en HTML).
Justificación, según los criterios del equipo:
- **Mantenimiento**: activo desde 2011, versiones frecuentes, una de las más usadas del
  ecosistema JavaScript. **Licencia MIT** (compatible). **Cero dependencias** propias.
- **Sin navegador externo ni CDN**: se instala con npm, se empaqueta con la app y se carga **solo
  al abrir la Ayuda** (pieza separada, no pesa en el resto de pantallas).
- **Por qué no escribir un convertidor propio**: un subconjunto de Markdown (títulos, listas,
  negritas, enlaces, imágenes, tablas, avisos) son ≈150–200 líneas que habría que probar y
  mantener, con casos raros (listas anidadas, tablas) que `marked` ya resuelve.
- **Seguridad**: el HTML resultante se inserta con `[innerHTML]`, que en Angular pasa
  **siempre** por su limpiador (quita scripts y atributos de eventos); además la CSP actual
  prohíbe scripts en línea. El contenido es nuestro y se sirve desde el mismo servidor.
- **Alternativa si Carlos no la aprueba (D11)**: convertidor propio limitado al subconjunto
  documentado en la guía de estilo del manual (+1,5 días de dev-frontend).

Si algún desarrollador cree necesitar otra librería, se detiene y lo consulta al arquitecto con
justificación escrita.

---

## 3. Recomendación (en lenguaje de negocio)

**A) Auditoría** — un módulo nuevo, separado de la contabilidad. La auditora entra con un usuario
de tipo **Auditor**: ve todo como un usuario de solo lectura, pero además puede trabajar en su
módulo. Lo que escribe la auditora **nunca** modifica asientos, facturas ni pagos: sus marcas,
notas y archivos se guardan aparte. Así la empresa auditada no corre ningún riesgo y la auditora
tiene evidencia de su trabajo.

**B) Análisis financiero** — una pantalla nueva "Análisis financiero" con pestañas (Semáforo,
Tendencia, Comparar períodos, EBITDA y DuPont, Punto de equilibrio, Vertical y horizontal,
Configuración), más una franja de 6 indicadores en el Panel. Todo se calcula con los mismos
números que ya muestran el balance y el estado de resultados: **no puede haber dos versiones de
la verdad**.

**C) Usabilidad** — arreglos pequeños que pidieron las pruebas, sin tocar el backend (6C).

**D) Ayuda integrada** — manual en archivos de texto (Markdown) que el documentador mantiene, una
pantalla "Ayuda" y un botón "?" en la barra superior que abre la sección de la pantalla actual
(6D).

**E) Experiencia guiada** — criterio de aceptación de toda pantalla; primero mecanismos globales
(barra superior, traductor de errores), luego pantallas nuevas (asistente, flujos), y al final la
adopción en pantallas existentes con componentes del kit, sin rediseñar nada (6E).

### 3.1 ¿VIEWER o rol nuevo AUDITOR? → **Rol nuevo AUDITOR** (recomendado)

| | Usar VIEWER | Rol nuevo AUDITOR |
|---|---|---|
| Leer toda la contabilidad | Sí | Sí (automático: las lecturas no tienen roles) |
| Escribir en auditoría | Habría que dar permiso de escritura en auditoría a **todo** VIEWER: cualquier empleado de solo lectura podría crear hallazgos o borrar papeles de trabajo | Solo el auditor |
| Escribir en la contabilidad | No | No: ninguna lista de `@Roles` lo incluye, y una prueba automática lo garantiza (también para rutas que el socio agregue después) |
| Separación de funciones (lo que mira un auditor de verdad) | Mezcla al personal de la empresa con el auditor externo | Clara |
| Costo | 0 | Una línea en el esquema, una migración que agrega un valor, 2 archivos de pantalla con 1 línea cada uno |
| Choque con el socio | Ninguno | Bajo, **si se le avisa antes**: si él también agrega un rol, hay que coordinar el orden |

---

## 4. Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Ampliar `Attachment` con campos `auditWorkpaperId`/`auditFindingId` | Toca el modelo, el servicio y los DTOs de adjuntos del socio, y subir archivos hoy está cerrado a VIEWER/AUDITOR. En su lugar: tabla propia `AuditFile` que **reutiliza** `LocalFileStorage`, `detectFile` y `sanitizeFileName` sin modificarlos. Costo: ≈80 líneas de servicio parecidas a las de adjuntos (se anota como deuda menor para unificar con el socio más adelante). |
| Agregar columna `costBehavior` a `Account` para costos fijos/variables | Toca el modelo más usado del sistema. En su lugar: tabla `AccountCostBehavior` con solo el porcentaje variable de las cuentas que el usuario quiera ajustar; el resto toma un valor por defecto según su categoría. |
| Modificar `FinancialRatiosGenerator` para agregarle semáforo, DuPont, etc. | Es el archivo con más riesgo de choque y ya tiene pruebas con montos a mano. Se **envuelve** desde el módulo nuevo; cero cambios. |
| Relaciones Prisma desde las tablas nuevas a `User` (creado por, revisado por...) | Cada relación obliga a agregar una línea en `User`; serían 6–8 líneas en el modelo más sensible. Se sigue el precedente del socio (`FiscalYear.closedById` sin relación). |
| Marcas de revisión con una columna por tipo de documento (`journalEntryId`, `invoiceId`...) | Obliga a agregar relaciones inversas en 4 modelos existentes. Se usa `entityType + entityId` (mismo patrón que `AuditLog`), validando en el servicio que el documento exista y sea de la empresa. |
| Guardar "fotos" de razones (`FinancialRatioSnapshot`) para la tendencia | Si alguien reabre un período, la foto queda vieja y el semáforo mentiría. Se calcula en vivo; se mide el tiempo y solo si hace falta se piensa en fotos (7.3). |
| Diseñador de informes de auditoría / plantillas Word | Fuera de alcance; el informe usa el mismo formato PDF/Excel de los demás reportes. |
| Dictamen de auditoría formal (opinión según NIA 700) | Es un documento profesional y legal del auditor, no del sistema. La v0.2 genera un **informe de revisión con hallazgos** (tipo "carta a la gerencia"). Ver decisión D8. |
| Visor general de la bitácora, revisión automática de errores, historial de accesos | Carlos no los eligió. Solo se propone lo mínimo opcional (O1 y O2 en 5.6). |
| Librería de gráficas o de UI nueva | chart.js y el kit propio alcanzan. |
| Copiar el formulario de cliente/proveedor dentro de la factura y del pago | Tres copias del mismo formulario que se desincronizan. Se extrae a un componente y `partners.ts` lo usa (6C). |
| "Ir a clientes y proveedores" en la misma pestaña con aviso de "perderás lo escrito" | Obliga a agregar un guardián de salida a pantallas del socio y aun así se pierde el trabajo si la contadora acepta. Otra pestaña no pierde nada. |
| Manual como páginas Angular, o en un sitio aparte (p. ej. un generador de documentación) | Páginas Angular: cada cambio de texto pasa por un programador. Sitio aparte: otra pieza que desplegar, sin ayuda contextual. |
| Manual en HTML estático en `public/` | Funciona y no necesita librería, pero escribir y revisar HTML a mano es más difícil para el documentador y las contadoras. Queda como plan B si no se aprueba `marked` (D11). |
| Un botón "?" dentro de cada pantalla | Tocaría ≈40 archivos del socio. Un solo botón en la barra superior, con un mapa pantalla → sección, logra lo mismo. |
| Rediseñar todas las pantallas para la experiencia guiada | Semanas de trabajo y choque seguro con el socio. Se logra con mecanismos globales + componentes pequeños que se insertan (6E.2). |
| Traducir los mensajes de validación en los 856 decoradores del backend, o con un `exceptionFactory` global | Lo primero toca casi todos los DTOs del socio; lo segundo cambia respuestas que sus pruebas verifican. Se traduce en un solo archivo del frontend (6E.4). |
| Librería de "tours" guiados o de tooltips | Dependencia nueva para algo que resuelven `app-field-help` y `app-stepper` con el kit. |
| Asistente que duplica dentro de sí los formularios de empresa, NCF, banco... | Copias de formularios que se desincronizan. El asistente hace las acciones simples con botones y, para el resto, lleva a la pantalla existente y vuelve. |

---

## 5. Diseño — A) Herramientas del auditor (`src/auditing/`)

### 5.1 Modelo de datos (tablas nuevas, migración aditiva)

Nombres en inglés como el resto del esquema; prefijo `Audit` para distinguirlas de `AuditLog`
(la bitácora). Todas llevan `companyId` (preparadas para la RLS que planea `PLAN.md`).

**Integridad entre empresas:** `AuditEngagement` declara `@@unique([id, companyId])` y cada tabla
hija se relaciona con el encargo por **la pareja** `(engagementId, companyId)`. Así la base de
datos **impide** que un papel de trabajo de la empresa A cuelgue de un encargo de la empresa B,
y solo `AuditEngagement` necesita relación con `Company` (1 línea en `Company`).

**`AuditEngagement`** — el encargo
| Campo | Tipo | Nota |
|---|---|---|
| id, companyId | uuid | relación a `Company` |
| name | texto ≤120 | "Auditoría 2027" |
| periodStart, periodEnd | fecha | período auditado; `periodStart ≤ periodEnd` |
| objective, scope | texto ≤5.000, opcionales | objetivo y alcance (salen en el informe) |
| auditorFirm | texto ≤200, opcional | firma o nombre profesional que firma el informe |
| overallConclusion | texto ≤10.000, opcional | conclusión general |
| status | enum `EngagementStatus`: PLANNED, IN_PROGRESS, IN_REVIEW, CLOSED | |
| nextFindingNumber | entero, por defecto 1 | numeración H-001, H-002... |
| createdById, closedById, closedAt | uuid/fecha sin relación | precedente `FiscalYear.closedById` |
| reopenReason | texto, opcional | obligatorio al reabrir |
| createdAt, updatedAt | | |
Restricciones: `@@unique([companyId, periodStart, periodEnd])` (un encargo por empresa y período),
`@@unique([id, companyId])`, `@@index([companyId, status])`.

**`AuditWorkpaper`** — papel de trabajo (un área)
| Campo | Tipo | Nota |
|---|---|---|
| id, companyId, engagementId | | relación compuesta al encargo |
| area | enum `AuditArea`: CASH_AND_BANKS, RECEIVABLES, PAYABLES, REVENUE, EXPENSES, TAXES, EQUITY, FIXED_ASSETS, INVENTORY, OTHER | |
| reference | texto ≤20 | "A", "B"... (referencia cruzada clásica) |
| title | texto ≤120 | por defecto la etiqueta del área |
| objective, conclusion | texto ≤5.000 | se precarga el objetivo desde la plantilla |
| status | enum `WorkpaperStatus`: PENDING, IN_PROGRESS, DONE | |
| preparedById/At, reviewedById/At | sin relación | "preparado por / revisado por" |
| sortOrder | entero | |
`@@unique([engagementId, reference])`.

**`AuditProcedure`** — pasos de revisión de cada área
| Campo | Tipo | Nota |
|---|---|---|
| id, companyId, workpaperId | | relación compuesta `(workpaperId, companyId)` (el papel declara `@@unique([id, companyId])`) |
| description | texto ≤1.000 | precargado desde la plantilla, editable |
| done | sí/no | |
| result | texto ≤2.000, opcional | lo que se encontró |
| doneById, doneAt | | |
| sortOrder | entero | |

**`AuditCheckmark`** — tilde sobre una partida revisada
| Campo | Tipo | Nota |
|---|---|---|
| id, companyId, engagementId | | |
| workpaperId | opcional | a qué área corresponde |
| entityType | enum `AuditEntityType`: JOURNAL_ENTRY, INVOICE, PAYMENT, BANK_RECONCILIATION | |
| entityId | uuid | sin llave foránea (patrón `AuditLog`); el servicio verifica existencia y empresa |
| mark | enum `AuditMark`: VERIFIED (verificado), VOUCHED (cotejado con soporte), RECALCULATED (recalculado), CONFIRMED (confirmado con terceros), EXCEPTION (con observación) | |
| note | texto ≤2.000, opcional | |
| createdById, createdAt, updatedAt | | |
`@@unique([engagementId, entityType, entityId])` (una tilde por partida y encargo; se puede cambiar).

**`AuditFinding`** — notas y hallazgos
| Campo | Tipo | Nota |
|---|---|---|
| id, companyId, engagementId, workpaperId? | | |
| number | entero | se muestra como H-001 |
| kind | enum `FindingKind`: FINDING, NOTE | las notas no llevan gravedad ni respuesta |
| title | texto ≤200 | |
| condition, criteria, cause, effect | texto ≤5.000 | "condición, criterio, causa y efecto": la estructura que usa cualquier auditor; solo `condition` es obligatoria |
| severity | enum `FindingSeverity`: LOW, MEDIUM, HIGH, CRITICAL (opcional si es NOTE) | |
| recommendation | texto ≤5.000 | |
| managementResponse, actionPlan | texto ≤5.000 | los escribe la gerencia |
| responsible | texto ≤120 | persona encargada de corregir |
| dueDate | fecha, opcional | |
| respondedById, respondedAt | | |
| status | enum `FindingStatus`: DRAFT, COMMUNICATED, RESPONDED, RESOLVED, RISK_ACCEPTED | |
| includeInReport | sí/no, por defecto sí | |
| amount | decimal(19,4), opcional | monto involucrado |
| createdById, createdAt, updatedAt | | |
`@@unique([engagementId, number])`.

**`AuditFile`** — archivos de soporte del auditor
| Campo | Tipo | Nota |
|---|---|---|
| id, companyId, engagementId | | |
| workpaperId? / findingId? | | exactamente uno |
| fileName, fileUrl, mimeType, sizeBytes | | mismo significado que `Attachment` |
| uploadedById, uploadedAt | | |
Clave de almacenamiento: `${companyId}/auditing/${uuid}` (misma carpeta `UPLOADS_DIR`, sin
configuración nueva). Máximo 50 archivos por papel o hallazgo (mismo tope que adjuntos).

**Cambios a modelos existentes en `schema.prisma`:** solo `AUDITOR` en el enum `UserRole` y
una línea `auditEngagements AuditEngagement[]` en `Company`. Todo lo demás va en un bloque nuevo
al **final** del archivo, con su encabezado de comentario como los demás bloques.

**Migración** `prisma/migrations/2026XXXXXXXXXX_auditing/`: `ALTER TYPE "UserRole" ADD VALUE
'AUDITOR'`, `CREATE TYPE` de los enums nuevos, `CREATE TABLE` e índices. Nada se borra ni se
altera. Se genera con `prisma migrate dev --create-only`, se revisa a mano que solo contenga
operaciones aditivas, y qa lo verifica (ver 9).

### 5.2 Plantilla de áreas y procedimientos

Archivo `src/auditing/audit-templates.ts`: por cada área, título, objetivo y 3–6 procedimientos
de partida en español (p. ej. Caja y bancos: "Comparar el saldo de cada banco en libros con la
conciliación al cierre", "Revisar partidas en tránsito de más de 30 días", "Confirmar saldos con
los bancos"). Al crear el encargo, el auditor elige las áreas (por defecto todas) y se precargan;
todo es editable. **Los textos los revisan las dos contadoras** antes de la Fase 2 (tarea 0.4).

### 5.3 Endpoints

Controlador `@Controller('auditing')` con `@UseGuards(JwtAuthGuard, RolesGuard)`.
"AUD" = AUDITOR, "ADM" = ADMIN.

| Método y ruta | Roles | Qué hace |
|---|---|---|
| GET `/auditing/engagements` | ADM, AUD | Lista (filtro por estado) con conteos por gravedad |
| POST `/auditing/engagements` | ADM, AUD | Crea el encargo y sus papeles desde la plantilla (`areas[]` opcional) |
| GET `/auditing/engagements/:id` | ADM, AUD | Encabezado + resumen (avance por área, partidas marcadas, hallazgos por gravedad) |
| PATCH `/auditing/engagements/:id` | AUD | Nombre, objetivo, alcance, firma, conclusión general |
| POST `/auditing/engagements/:id/status` | AUD (cerrar); ADM, AUD (reabrir con motivo) | Cambios de estado (5.4) |
| DELETE `/auditing/engagements/:id` | ADM, AUD | Solo en PLANNED y sin marcas, hallazgos ni archivos |
| GET `/auditing/engagements/:id/workpapers` | AUD (ADM según D3) | Papeles con sus procedimientos |
| POST `/auditing/engagements/:id/workpapers` | AUD | Agrega un área (p. ej. OTHER con título propio) |
| PATCH `/auditing/workpapers/:id` | AUD | Título, objetivo, conclusión, estado |
| POST `/auditing/workpapers/:id/sign-off` | AUD | `{ step: 'PREPARED' \| 'REVIEWED' }`; avisa (no bloquea) si quien revisa es quien preparó |
| POST `/auditing/workpapers/:id/procedures` | AUD | Agrega un paso |
| PATCH `/auditing/procedures/:id` | AUD | Texto, hecho/no hecho, resultado |
| DELETE `/auditing/procedures/:id` | AUD | |
| GET `/auditing/engagements/:id/items` | AUD | **Partidas para revisar**: documentos del período del encargo de un tipo (`entityType`), con búsqueda, filtro "revisadas / pendientes", paginación (límite 100) y la tilde de cada una si existe |
| PUT `/auditing/engagements/:id/marks` | AUD | Pone o cambia la tilde `{ entityType, entityId, mark, note?, workpaperId? }`. 404 si el documento no es de la empresa; 422 si está fuera del período del encargo |
| DELETE `/auditing/marks/:id` | AUD | Quita la tilde |
| GET `/auditing/engagements/:id/findings` | ADM, AUD | ADM solo ve los que **no** están en DRAFT (D3) |
| POST `/auditing/engagements/:id/findings` | AUD | Crea (número correlativo en la misma transacción) |
| PATCH `/auditing/findings/:id` | AUD | Edita (no en RESOLVED/RISK_ACCEPTED) |
| POST `/auditing/findings/:id/communicate` | AUD | DRAFT → COMMUNICATED |
| POST `/auditing/findings/:id/response` | ADM | Respuesta de la gerencia, plan de acción, responsable, fecha → RESPONDED |
| POST `/auditing/findings/:id/close` | AUD | → RESOLVED o RISK_ACCEPTED con nota |
| DELETE `/auditing/findings/:id` | AUD | Solo en DRAFT |
| POST `/auditing/files` | AUD | multipart `file` + `workpaperId` o `findingId` |
| GET `/auditing/files` | AUD (ADM para archivos de hallazgos comunicados) | Lista |
| GET `/auditing/files/:id/download` | igual que arriba | Descarga con las cabeceras de adjuntos |
| DELETE `/auditing/files/:id` | AUD | |
| GET `/auditing/engagements/:id/report?format=pdf\|xlsx` | ADM, AUD | Informe (5.5) |

Reglas transversales:
- **Encargo CLOSED ⇒ todo es de solo lectura** (422 "El encargo está cerrado"), incluidas tildes,
  archivos y respuestas.
- Cada escritura: `writeAudit` en la misma transacción (`'AuditEngagement'`, `'AuditFinding'`...).
- Las lecturas de auditoría llevan `@Roles` ⇒ ACCOUNTANT, APPROVER y VIEWER reciben 403.
- El dato "quién" se devuelve con nombre: el servicio resuelve los ids en **una** consulta a
  `User` filtrada por `companyId`.

### 5.4 Estados

```
Encargo:   PLANNED → IN_PROGRESS → IN_REVIEW → CLOSED
                         ↑______________|          |
                         (reabrir con motivo) ←────┘   (ADMIN o AUDITOR, queda en la bitácora)
Cerrar exige: todas las áreas DONE y ningún hallazgo en DRAFT (si hay borradores, se comunican o se borran).

Hallazgo:  DRAFT → COMMUNICATED → RESPONDED → RESOLVED | RISK_ACCEPTED
           (la gerencia solo ve y responde desde COMMUNICATED)
```

### 5.5 Informe final (PDF y Excel)

Se construye un `TableDoc` en `src/auditing/auditing-report.builder.ts` y se llama a
`renderPdf`/`renderXlsx` **importándolos** de `src/exports/` (sin tocar ese módulo). Secciones:
1. **Resumen**: empresa, RNC, período, firma auditora, fechas, estado; tabla de hallazgos por
   gravedad y estado; objetivo, alcance y conclusión general como `notes` (se ajustan en líneas).
2. **Alcance por área**: referencia, área, estado, procedimientos hechos/total, partidas
   revisadas, preparado/revisado por; conclusiones de cada área como `notes`.
3. **Hallazgos**: tabla corta (H-001, título, gravedad, estado, responsable, fecha compromiso) y,
   por cada hallazgo, una sección con su detalle (condición, criterio, causa, efecto,
   recomendación, respuesta de la gerencia) en `notes`.
4. **Partidas revisadas**: conteo por tipo y por marca; en Excel, el detalle completo
   (columnas `xlsxOnly`).
Si el encargo no está cerrado, el subtítulo dice **"BORRADOR — no es el informe final"**.
Textos sin símbolos fuera del alfabeto latino (Helvetica los cambiaría por "?").

### 5.6 Opcionales mínimos de bitácora (propuestos, Carlos decide — D6)

- **O1 — Historial de un documento** (≈0,5 día backend + 0,5 frontend): desde la lista de
  partidas, "ver historial" muestra las filas de `AuditLog` **de ese único documento** (quién lo
  creó, aprobó, anuló y cuándo). `GET /auditing/history?entityType=&entityId=` (AUD). No es un
  visor general. **Por qué**: una auditora siempre pregunta "¿quién aprobó esto?"; hoy no tiene
  cómo verlo.
- **O2 — Aviso "cambió después de revisado"** (≈0,5 día): si un documento con tilde tiene en
  `AuditLog` un cambio posterior a la tilde (anulación, aprobación, edición), la lista lo marca
  en amarillo. **Por qué**: sin esto, una tilde puede dar por bueno algo que se anuló después; es
  el error más grave que puede tener esta función. **Recomendado.**

---

## 6. Diseño — B) Análisis financiero (`src/financial-analysis/`)

El módulo importa `ReportsModule` (que ya exporta los generadores) y no modifica nada de él.

### 6.1 Modelo de datos (migración aditiva aparte, Fase 1B y Fase 4)

**`RatioThreshold`** (Fase 1B) — límites del semáforo que la empresa cambió (si no hay fila, se usa
el valor por defecto del código)
| Campo | Tipo | Nota |
|---|---|---|
| id, companyId | | relación a `Company` (1 línea en `Company`) |
| ratioKey | texto | una de las claves existentes (`currentRatio`...) o de las nuevas (`ebitdaMargin`) |
| greenAt, redAt | decimal(19,4) | dirección fija en el código ("más es mejor" o "menos es mejor"); se valida coherencia |
| enabled | sí/no | apagar el semáforo de una razón (p. ej. inventario en una empresa de servicios) |
| updatedById, updatedAt | | |
`@@unique([companyId, ratioKey])`.

**`AccountCostBehavior`** (Fase 4) — para el punto de equilibrio
| Campo | Tipo | Nota |
|---|---|---|
| id, companyId, accountId | | relación a `Account` (1 línea en `Account`) y a `Company` (1 línea) |
| variablePct | decimal(5,2) 0–100 | 0 = fijo, 100 = variable, intermedio = mixto (p. ej. electricidad 30 %) |
| updatedById, updatedAt | | |
`@@unique([accountId])`, `@@index([companyId])`.

### 6.2 Semáforo: reglas y valores por defecto

Regla: si "más es mejor": **verde** si valor ≥ verde; **rojo** si valor < rojo; amarillo entre
ambos. Si "menos es mejor", al revés. Sin valor (denominador cero) ⇒ **gris "sin dato"** con la
nota que ya da el generador. Las razones de rentabilidad sobre activos/patrimonio se evalúan
**anualizadas** cuando el período es menor de 360 días (valor × 365 / días) y se rotula
"anualizado"; márgenes, liquidez, endeudamiento y días no cambian con la duración del período.
Siempre se muestra **texto además del color** ("Bien", "Atención", "Riesgo") para quien no
distingue colores.

Valores por defecto (reglas generales de análisis financiero para pymes, de manuales clásicos de
finanzas corporativas; son **punto de partida** y las contadoras deben validarlos — D5):

| Razón | Dirección | Verde | Amarillo | Rojo | Justificación breve |
|---|---|---|---|---|---|
| Razón corriente | más | ≥ 1,5 | 1,0–1,5 | < 1,0 | Por debajo de 1 no alcanza el activo corriente para la deuda de corto plazo |
| Prueba ácida | más | ≥ 1,0 | 0,7–1,0 | < 0,7 | Sin contar inventario, ≥1 cubre deudas inmediatas |
| Razón de efectivo | más | ≥ 0,3 | 0,1–0,3 | < 0,1 | Menos de 10 centavos en caja por peso adeudado es tenso |
| Capital de trabajo | más | > 0 | — | ≤ 0 | Negativo = deudas de corto plazo mayores que lo disponible |
| Endeudamiento (pasivo/activo) | menos | ≤ 50 % | 50–70 % | > 70 % | Más de 70 % financiado por terceros es alto riesgo |
| Deuda sobre patrimonio | menos | ≤ 1,0 | 1,0–2,0 | > 2,0 | Coherente con la fila anterior |
| Apalancamiento (activo/patrimonio) | menos | ≤ 2,0 | 2,0–3,0 | > 3,0 | Ídem |
| Cobertura de intereses | más | ≥ 3,0 | 1,5–3,0 | < 1,5 | Menos de 1,5 veces deja poco margen para pagar intereses |
| Margen bruto | más | ≥ 30 % | 15–30 % | < 15 % | **Muy dependiente del sector**: se avisa en pantalla |
| Margen operativo | más | ≥ 10 % | 3–10 % | < 3 % | |
| Margen neto | más | ≥ 5 % | 0–5 % | < 0 % | Rojo = pérdidas |
| Margen EBITDA (nuevo) | más | ≥ 15 % | 5–15 % | < 5 % | |
| ROA (anualizado) | más | ≥ 5 % | 0–5 % | < 0 % | |
| ROE (anualizado) | más | ≥ 12 % | 0–12 % | < 0 % | Debe superar lo que rendiría el dinero sin riesgo |
| Días de cobro | menos | ≤ 45 | 45–75 | > 75 | Créditos usuales de 30 días + holgura |
| Días de pago, días de inventario, ciclo de conversión, rotaciones | — | sin semáforo por defecto | | | Depende del sector y "más" no siempre es mejor; la empresa puede activarlo |

**Interpretación sencilla**: archivo `src/financial-analysis/ratio-interpretations.ts` con una
frase por razón y por color, con el valor insertado. Ejemplo (razón corriente, verde): "Por cada
peso que la empresa debe a corto plazo, tiene 2,42 pesos que puede convertir en efectivo en menos
de un año. Puede pagar sus deudas inmediatas con holgura." La redacción la revisa el
documentador y la validan las contadoras. Vive en el backend para que salga igual en pantalla y
en PDF.

### 6.3 Razones adicionales (Fase 4)

- **EBITDA**: ya lo calcula el generador (`statement.ebitda`); se presenta como indicador con su
  margen (EBITDA / ingresos operativos). Aviso si no hay cuentas en "Depreciación y
  amortización" (el EBITDA sería igual al EBIT).
- **DuPont (3 factores)**: margen neto (utilidad neta / ingresos totales) × rotación de activos
  (ingresos totales / activo promedio) × multiplicador (activo promedio / patrimonio promedio)
  = ROE. Usa **las mismas bases** que el generador (ingresos totales, promedios) para que el
  resultado **coincida exactamente** con el ROE de la pestaña de razones; se muestra la
  comprobación. Nota: el "Apalancamiento" de las 20 razones usa saldos de cierre, el de DuPont
  promedios; se explica en pantalla.
- **Punto de equilibrio** — cómo separar costos fijos y variables con la clasificación existente:
  1. **Por defecto según la categoría** de la cuenta (`Clasificación de cuentas`): Costo de ventas
     = 100 % variable; Gastos operativos, Depreciación y amortización y Costos financieros = 0 %
     variable (fijos). Otros gastos e Impuesto sobre la renta **no entran** (no son de la
     operación normal). Gastos sin categoría: se tratan como fijos y se avisa (igual que hoy el
     generador avisa de cuentas sin clasificar).
  2. **Ajuste por cuenta**: en la pestaña "Costos fijos y variables" se lista cada cuenta de gasto
     con su porcentaje variable por defecto y se puede cambiar (p. ej. comisiones de venta 100 %,
     electricidad 30 %). Solo se guardan las que se cambian (`AccountCostBehavior`).
  3. Cálculo: costos variables = Σ monto × % variable; fijos = el resto; margen de contribución
     = (ingresos operativos − variables) / ingresos operativos; **ventas de equilibrio** = fijos /
     margen de contribución; **margen de seguridad** = (ventas − equilibrio) / ventas; y el
     equivalente por mes. Si el margen de contribución es ≤ 0: sin dato, con explicación.
- **Análisis vertical**: balance a una fecha (cada cuenta y cada categoría como % del activo
  total, o del pasivo + patrimonio) y estado de resultados de un período (cada línea como % de
  los ingresos operativos; si son cero, de los ingresos totales).
- **Análisis horizontal**: dos fechas (balance) o dos períodos (resultados): variación absoluta
  y porcentual por cuenta y por categoría; % sin dato cuando la base es cero.

### 6.4 Comparación, tendencia e indicadores clave

- **Tendencia**: puntos mensuales, trimestrales o anuales entre dos meses, **máximo 24 puntos**.
  Cada punto llama a `FinancialRatiosGenerator.generate` con el rango de ese mes/trimestre/año,
  con un máximo de 4 cálculos a la vez. Se devuelve el valor y el color de cada razón por punto.
- **Comparar períodos**: período A contra período B (por defecto, el mismo período del año
  anterior): valor de ambos, diferencia, % de cambio, color de ambos y si mejoró o empeoró
  (según la dirección de la razón).
- **Indicadores clave del Panel** (6): Razón corriente, Prueba ácida, Endeudamiento, Margen neto,
  Días de cobro y EBITDA del año. Período: desde el 1 de enero (como ya hace el Panel) hasta hoy,
  comparado con el mismo tramo del año anterior (flecha arriba/abajo). Visibles para todos los
  roles, como el resto del Panel.

### 6.5 Endpoints

Controlador `@Controller('financial-analysis')`, `@UseGuards(JwtAuthGuard, RolesGuard)`. Las
lecturas son para cualquier rol de la empresa (igual que `/reports`), así que **no cambian** la
lista de lecturas restringidas de `security.e2e-spec.ts`.

| Método y ruta | Roles | Fase |
|---|---|---|
| GET `/financial-analysis/health?from&to` | todos | 1B — razones existentes + color + interpretación + aviso de anualización |
| GET `/financial-analysis/trend?from=AAAA-MM&to=AAAA-MM&granularity=MONTH\|QUARTER\|YEAR&keys=` | todos | 1B |
| GET `/financial-analysis/compare?from&to&compareFrom&compareTo` | todos | 1B |
| GET `/financial-analysis/kpis` | todos | 1B |
| GET `/financial-analysis/thresholds` | todos | 1B — por defecto + cambios de la empresa |
| PUT `/financial-analysis/thresholds` | ADMIN, ACCOUNTANT | 1B — lista de `{ ratioKey, greenAt, redAt, enabled }` |
| DELETE `/financial-analysis/thresholds/:ratioKey` | ADMIN, ACCOUNTANT | 1B — volver al valor por defecto |
| GET `/financial-analysis/export/health\|compare?format=` | todos | 1B |
| GET `/financial-analysis/dupont?from&to` | todos | 4 |
| GET `/financial-analysis/break-even?from&to` | todos | 4 |
| GET `/financial-analysis/cost-behavior` | todos | 4 |
| PUT `/financial-analysis/cost-behavior` | ADMIN, ACCOUNTANT | 4 |
| GET `/financial-analysis/vertical?statement=BALANCE&asOf` / `?statement=INCOME&from&to` | todos | 4 |
| GET `/financial-analysis/horizontal?statement=...` (dos fechas o dos períodos) | todos | 4 |
| GET `/financial-analysis/export/dupont\|break-even\|vertical\|horizontal?format=` | todos | 4 |

---

## 6C. C) Observaciones de prueba — usabilidad (Fase 1A)

Vienen de las pruebas de Carlos y las contadoras. **Solo frontend**: la API de terceros ya hace
todo lo necesario (`POST /partners` y `PATCH /partners/:id` devuelven el tercero completo, y
exigen ADMIN o ACCOUNTANT). Cero cambios en el backend.

### C1. Crear, editar e ir a clientes/proveedores desde la factura (y desde cobros/pagos)

**Hoy**: `features/catalog/partners.ts` tiene el formulario del tercero **dentro** de su modal
(campos, validaciones, `save()`); la factura (`invoice-form.html`, campo `partnerId` con
`<app-combobox>`) y el cobro/pago (`payment-form.ts`, mismo selector) solo permiten elegir de la
lista. Si falta el cliente, hay que salir de la factura y se pierde lo escrito.

**Diseño**
1. **Componente reutilizable nuevo** `features/catalog/partner-dialog.ts` (`app-partner-dialog`):
   contiene **el mismo** `<app-modal>` y el mismo formulario reactivo que hoy está en
   `partners.ts` (mismos campos, validaciones, textos y llamada `clean(...)`). Interfaz:
   - entradas: `open`, `partner` (para editar; vacío = crear), `defaultType` (CUSTOMER,
     SUPPLIER o BOTH);
   - salidas: `saved` (devuelve el tercero que respondió la API) y `closed`;
   - al guardar llama a `lookups.ensurePartners(true)` como hoy y muestra el mismo aviso.
2. **`partners.ts` pasa a usar ese componente** (se borra su modal y su lógica de formulario; la
   tabla, filtros y "Activar/Desactivar" no cambian). Comportamiento idéntico: qa lo verifica.
3. **Factura** (`invoice-form.html` + `invoice-form.ts`): junto al selector, una fila de botones
   pequeños del kit (`btn btn-ghost btn-sm`), visibles solo si `auth.has('ADMIN', 'ACCOUNTANT')`
   (mismo criterio que `canEdit` en `partners.ts`):
   - **"Crear"** → abre `app-partner-dialog` con el tipo preseleccionado según `side()`:
     ventas ⇒ Cliente, compras ⇒ Proveedor, sin tipo aún ⇒ Cliente. Al guardar: refresca la
     lista y hace `form.controls.partnerId.setValue(nuevo.id)`. El resto del formulario **no se
     toca** (el modal vive dentro de la misma pantalla: nada se recarga ni se navega).
   - **"Editar"** (deshabilitado si no hay uno elegido) → abre el diálogo con el tercero actual.
     Al guardar, la lista se refresca y la factura toma los datos nuevos: el "NCF según el
     cliente" ya se calcula leyendo `lookups.partners()`, así que cambia solo. Caso borde: si al
     editar se le cambia el tipo y ya no corresponde (p. ej. pasa a "Proveedor" en una venta), se
     quita la selección y se avisa: "Este contacto ya no es cliente; elige otro."
   - **"Ir a clientes y proveedores"** → enlace a `/partners` que se abre **en otra pestaña**
     (`target="_blank" rel="noopener"`). Se recomienda esta opción frente a "avisar antes de
     salir" porque no se pierde nada y no exige agregar un guardián de salida a pantallas del
     socio. La sesión se comparte entre pestañas (el token está en el almacenamiento del
     navegador), así que la otra pestaña entra directo. Al volver, el botón "Crear/Editar" o un
     pequeño "Actualizar lista" (`lookups.ensurePartners(true)`) trae lo cambiado allá.
4. **Cobros y pagos** (`payment-form.ts`): **sí** tiene selector de tercero (línea ≈33). Mismo
   patrón, con el tipo preseleccionado según la dirección: cobro ⇒ Cliente, pago ⇒ Proveedor.
5. Accesibilidad: los botones con texto visible (no solo íconos); el diálogo es el `<dialog>`
   nativo del kit (foco atrapado y Esc ya resueltos).

### C2. "Tercero" → "cliente / proveedor" en pantalla

Hay ≈43 apariciones de "tercero" visibles al usuario en 16 archivos. Reglas de redacción:
- Cuando el contexto sabe el lado: "cliente" (ventas, cobros) o "proveedor" (compras, pagos).
- Cuando no: "cliente / proveedor" (p. ej. botón **"Nuevo cliente / proveedor"**, título
  "Editar cliente / proveedor", avisos "Cliente / proveedor creado.", "Elige el cliente o
  proveedor.").
- Solo textos visibles. **No** cambian nombres de variables, rutas (`/partners`) ni la API.

**Alcance recomendado (D10)**: en la Fase 1A, los archivos que igual se tocan por C1 y C3
(`partner-dialog.ts` nuevo, `partners.ts`, `invoice-form.html`, `invoice-form.ts`,
`payment-form.ts`, `nav.ts`) — cubre los textos que las contadoras ven al crear facturas y
pagos. El **barrido completo** de los otros ≈11 archivos (`invoices.ts`, `payments.ts`,
`receivables.ts`, `invoice-detail.*`, `payment-detail.ts`, `reports.*`, `opening-balances.ts`,
`entry-detail.ts`, `dashboard.html`, `combobox.ts`, `lookups.ts`) es fácil (≈medio día, solo
textos) pero suma 11 archivos del socio a la lista de posibles choques: se hace si Carlos lo
pide, idealmente **acordado con el socio**.

### C3. Mover "Clientes y proveedores" a "Ventas y compras"

**Recomendado**: es donde se usa (facturas, cobros, cuentas por cobrar y pagar) y es lo que
esperan las contadoras. Cambio de 2 líneas en `layout/nav.ts` (quitar de "Catálogos", poner
primero en "Ventas y compras"). La ruta `/partners` no cambia, así que los enlaces siguen
funcionando. `nav.ts` ya está en la lista de choques por otras razones.

---

## 6D. D) Ayuda integrada — manual de usuario dentro del sistema (Fases 1A y 1B, y crece con cada fase)

### D.1 Qué ve la contadora
- **"Ayuda"** en el menú (al final, visible para todos los roles) → pantalla `/help` con el
  índice del manual y cada sección en `/help/:seccion`, con buscador sencillo por título.
- **Botón "?"** en la barra superior de **todas** las pantallas: abre un **panel lateral** con la
  sección del manual que corresponde a la pantalla actual (p. ej. en una factura nueva, "Crear una
  factura de venta"). Es un panel, no una navegación: **no se pierde lo que se está escribiendo**.
  Desde el panel, "Abrir el manual completo" lleva a `/help` en otra pestaña.

### D.2 Organización del manual (por tareas, para contadoras)
| # | Sección (archivo) | Fase |
|---|---|---|
| 1 | Primeros pasos: entrar, cambiar la clave, el menú, el panel (`01-primeros-pasos.md`) | 1A |
| 2 | Configuración inicial: plan de cuentas y su clasificación, impuestos, NCF, diarios, numeración, años y períodos fiscales, configuración contable (`02-configuracion-inicial.md`) | 1B |
| 3 | Clientes y proveedores (incluye crearlos desde la factura) (`03-clientes-proveedores.md`) | 1A |
| 4 | Facturas de venta y compra; notas de crédito y débito; NCF; anulación (`04-facturas.md`) | 1A |
| 5 | Cobros y pagos; anticipos; cuentas por cobrar y por pagar; antigüedad (`05-cobros-pagos.md`) | 1A |
| 6 | Asientos, aprobación, saldos iniciales y cierre de período y de año (`06-asientos-cierre.md`) | 1B |
| 7 | Bancos, cajas, extractos, reglas y conciliación (`07-bancos-conciliacion.md`) | 1B |
| 8 | Reportes: estados financieros, razones (y semáforo), DGII 606/607/608, presupuestos (`08-reportes.md`) | 1B |
| 9 | Usuarios y permisos: qué puede hacer cada rol (`09-usuarios-permisos.md`) | 1B (se amplía con "Auditor" en la Fase 2) |
| 10 | Preguntas frecuentes (`10-preguntas-frecuentes.md`) | 1A (inicial) y se alimenta en cada fase con lo que pregunten las contadoras |
| 11 | Análisis financiero: semáforo, tendencia, comparación; luego EBITDA, DuPont, punto de equilibrio, vertical y horizontal (`11-analisis-financiero.md`) | 1B y 4 |
| 12 | Auditoría: para la auditora y para la gerencia (`12-auditoria.md`) | 2 y 3 |

### D.3 Cómo se guarda el contenido (para que el documentador lo mantenga sin tocar código)

**Recomendación: archivos Markdown en `frontend/public/manual/`** que la pantalla de Ayuda lee y
convierte a HTML en el navegador con `marked` (ver 2.3).

```
frontend/public/manual/
  indice.json                 ← orden, títulos y qué pantalla abre qué sección
  01-primeros-pasos.md ... 12-auditoria.md
  img/                        ← capturas, con fecha en el nombre: facturas-nueva-2026-10.png
  GUIA-DE-ESTILO.md           ← cómo escribir (no se publica en el índice)
```

- `indice.json` (lo edita el documentador): lista de secciones `{ slug, archivo, titulo }` y un
  mapa de **pantallas → sección y ancla**, por prefijo de ruta, p. ej.
  `"/invoices/new": "04-facturas#crear-una-factura"`, `"/partners": "03-clientes-proveedores"`,
  `"/analysis": "11-analisis-financiero"`. El botón "?" usa la regla más específica que coincida;
  si ninguna coincide, abre el índice. Agregar una sección o ligar una pantalla nueva = editar
  este archivo, **sin programar**.
- Por qué Markdown y no HTML estático: es texto casi normal (títulos con `#`, listas con `-`,
  negritas con `**`), fácil de revisar por Carlos y las contadoras y de comparar entre versiones.
  El HTML a mano es más propenso a errores y mezcla formato con contenido.
- Por qué no páginas Angular por sección: el documentador tendría que editar código y cada
  cambio de texto pasaría por los desarrolladores.
- **Compatibilidad con la CSP actual** (`default-src 'self'; script-src 'self' + hash;
  style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:`):
  - los `.md`, `indice.json` y las imágenes se piden al **mismo servidor** (`connect-src 'self'`,
    `img-src 'self'`) ⇒ permitido;
  - `marked` produce solo HTML (sin scripts ni estilos en línea); Angular lo limpia al
    insertarlo ⇒ nada que la CSP tenga que permitir. **La CSP no se cambia.**
  - Regla de la guía de estilo: nada de HTML incrustado en el Markdown ni imágenes de internet
    (además la CSP las bloquearía).
- Los enlaces dentro del manual a pantallas del sistema (p. ej. "abre [Facturas](/invoices)")
  se interceptan y navegan con el router; los enlaces externos (DGII) se abren en otra pestaña.

**Dos detalles del servidor web** (`frontend/deploy/nginx.conf`, archivo del socio — 3 líneas):
1. Hoy las imágenes `.png` se guardan en caché **un año** ("immutable"): si el documentador
   reemplaza una captura con el mismo nombre, las contadoras seguirían viendo la vieja. Y si se
   pide un `.md` que no existe, el servidor devuelve la página principal en vez de "no
   encontrado". Se agrega un bloque `location /manual/ { try_files $uri =404; Cache-Control
   "no-cache" }` (con las cabeceras de seguridad incluidas como en los demás bloques).
2. Por eso los archivos van en `/manual/...` y la pantalla en `/help/...`: rutas distintas para
   que la regla anterior no rompa la recarga de la pantalla de Ayuda.
   Aun sin el cambio de nginx funciona si las capturas llevan **fecha en el nombre** (regla de la
   guía de estilo, se aplica igual) y la pantalla detecta la respuesta HTML como "sección no
   encontrada".

### D.4 Piezas de frontend
| Pieza | Archivo | Nota |
|---|---|---|
| Área nueva | `features/help/help.routes.ts` | `/help` (índice) y `/help/:slug` |
| Servicio | `features/help/help-content.ts` | Lee `indice.json` y los `.md` (con `fetch`/`HttpClient` relativo a `/manual/`), los guarda en memoria durante la sesión, resuelve "pantalla → sección" |
| Visor | `features/help/help-page.ts` | Índice lateral + contenido; carga `marked` con `import()` dinámico (solo aquí) |
| Panel lateral | `features/help/help-drawer.ts` | Se abre desde el "?"; reutiliza el visor; cierra con Esc |
| Botón "?" | **1–2 líneas** en `layout/shell.html` (barra superior) + import en `layout/shell.ts` | Un solo punto para todas las pantallas: **no se tocan las ~40 pantallas** |
| Estilos | estilos locales del visor para títulos, listas, tablas e imágenes del manual, con las variables de `styles.css` | Sin estilos globales nuevos |

### D.5 Cuándo entra el documentador
- **Desde la Fase 0**, en paralelo con los desarrolladores: escribe la guía de estilo y las
  secciones 1, 3, 4, 5 y 10 **basándose en las pantallas actuales** del ambiente de pruebas (son
  las que ya usan las contadoras). No necesita que exista el visor: escribe Markdown.
- Fase 1A: se publica lo anterior + el mapa de pantallas; el texto de "crear cliente desde la
  factura" se escribe con la pantalla nueva.
- Fase 1B: secciones 2, 6, 7, 8, 9 y la primera parte de la 11.
- Fases 2–4: secciones 12 (auditoría) y resto de la 11, **en la misma fase** que la función.
- **Capturas**: con datos ficticios del ambiente de pruebas, nunca datos reales. Se recomienda
  tomarlas con Playwright (ya instalado en `frontend/` como herramienta de desarrollo) mediante un
  guion que recorre las pantallas, para poder **repetirlas** cuando cambie el diseño; si eso se
  complica, a mano. Los nombres llevan fecha.
- **Validación**: cada sección la leen las contadoras (¿se entiende?, ¿es correcto
  contablemente?) antes de publicarse; qa revisa que cada "?" abra la sección correcta.

---

## 6E. E) Experiencia guiada — PRINCIPIO RECTOR de toda la v0.2

> **"Que cualquier persona lo pueda usar sin capacitación."** Es el criterio más importante de
> la v0.2 (decisión de Carlos). Se aplica a **cada pantalla nueva o tocada** y es condición para
> dar una fase por terminada.

### E.0 Criterios de aceptación (definición de "terminado" de cada pantalla)
| # | Criterio | Cómo se comprueba |
|---|---|---|
| E1 | Se ve **dónde estoy** (migas: "Ventas y compras › Facturas › Nueva"), una línea de **para qué sirve** la pantalla y el **siguiente paso sugerido** | A simple vista, sin hacer clic |
| E2 | En procesos de varios pasos, un **indicador de pasos** (hechos, actual, pendientes) | Configuración inicial, factura → cobro → conciliación, cierre de mes |
| E3 | Una tabla vacía **explica** qué es y ofrece un **botón grande** para crear el primero, o un enlace a lo que falta configurar. Distingue "aún no hay ninguno" de "ninguno con estos filtros" (botón "Quitar filtros") | Probar con empresa nueva y con filtros sin resultado |
| E4 | La **acción principal** siempre arriba a la derecha, una sola por pantalla, con el botón principal verde del sistema (`btn-primary`, color `--primary`, que ya es verde); menú con **nombres de negocio**, agrupado por lo que el usuario quiere hacer; nada de "tercero" | Revisión visual |
| E5 | Todo error dice **qué pasó y cómo arreglarlo**, en español sencillo, con **enlace a la solución** cuando la hay. Nunca un mensaje técnico (nombres de campos en inglés, códigos) | Provocar los errores típicos de cada pantalla |
| E6 | Botón "?" (sección D) y **ayudas en los campos contables difíciles** (tipo de NCF, retenciones, tipo de gasto 606 / ingreso 607, clasificación de cuenta, tasa de cambio...) | Pasar el cursor o tocar el ícono en cada campo listado |

**Quién valida:** **dev-frontend** es responsable del diseño y de cumplir E1–E6 con el kit;
**revisor-critico** lo revisa en cada entrega de pantallas; **qa** hace la prueba de **"usuario
nuevo sin capacitación"** por flujo (E.6); **Carlos** da la aprobación final (él es el mejor
"usuario sin capacitación" contable que tenemos).

### E.1 Auditoría de usabilidad de las pantallas actuales (E7)

Revisadas las ≈33 pantallas de `frontend/src/app/features/`. **Lo bueno** (el socio ya hizo
buena parte): todas tienen encabezado `page-head` con título y una línea `sub` que dice para qué
sirven; la acción principal casi siempre está arriba a la derecha con `btn-primary` (verde
azulado `#0c6b5e`); los errores de reglas de negocio del backend ya vienen en español
("La conciliación está completada", "El período fiscal "X" está cerrado") y `core/errors.ts` ya
traduce nombres técnicos de la configuración contable; muchos formularios tienen textos `hint`
bajo los campos (la factura tiene 7); 6 pantallas tienen buenos estados vacíos (Diarios: "Usa
«Crear diarios estándar» para empezar", NCF, Años fiscales, Presupuestos, Movimientos bancarios,
Panel).

**Lo que falta**, priorizado:

| Prio. | Hallazgo | Evidencia | Mejora | Costo | Archivos del socio | Choque |
|---|---|---|---|---|---|---|
| **P1** | No hay **asistente de configuración** ni lista de pendientes: una empresa nueva no sabe por dónde empezar; si falta NCF, cuentas automáticas o año fiscal, la primera factura falla | No existe; tampoco un plan de cuentas base de RD (estaba previsto en `PLAN.md` Fase 8) | Asistente `/setup` + "pendientes de configurar" en el Panel + plan de cuentas base RD (E.3) | backend 4 d, frontend 4 d | `dashboard.html` (+1 línea) | Bajo |
| **P1** | **Mensajes de validación en inglés técnico**: 856 reglas de validación en los DTOs y solo 13 con mensaje en español; si el navegador deja pasar algo, llega "partnerId must be a UUID" o "property x should not exist" | `grep` en `src/**/dto` | Traductor central en el frontend (E.4) — no se tocan los 856 DTOs del socio | frontend 1,5 d | `core/errors.ts` (2–3 líneas) | Bajo |
| **P1** | Errores sin **enlace a la solución** ("No hay secuencia NCF..." no lleva a NCF) | Avisos `notice neg` con solo texto | Componente `app-error-notice` + tabla "mensaje → cómo arreglarlo → enlace" (E.4) | frontend 1 d + doc 1 d | se adopta en factura, pago, asiento (ya tocados o pocos) | Bajo-medio |
| **P1** | No hay **migas de pan** ni **siguiente paso** | Ninguna pantalla | En la barra superior, automático desde el menú y las rutas (E.2): **ninguna pantalla se toca** | frontend 1 d | `layout/shell.*` (ya en la lista) | Bajo |
| **P2** | **Estados vacíos genéricos**: "No hay facturas con esos filtros" aparece aunque no exista ninguna factura | 12 listas: usuarios, clasificación, cuentas, numeración, clientes/proveedores, impuestos, asientos, presupuestos, facturas, cobros y pagos, conciliaciones, CxC/CxP | `app-empty-state` con las dos variantes | frontend 2 d | 12 archivos (≈3–6 líneas cada uno) | **Medio** (muchos archivos) |
| **P2** | **Ayudas en campos difíciles** incompletas: hay `hint` en algunos, ninguno explica tipo de gasto 606, retenciones, clasificación de cuenta o "agente de retención" | `invoice-form`, `payment-form`, `account-classification`, `accounts`, `tax-rates`, `accounting-settings`, `ncf`, `opening-balances`, diálogo de clientes | `app-field-help` con textos en un archivo que mantiene el documentador | frontend 2 d + doc 1,5 d | 8–9 archivos (1 línea por campo) | Medio |
| **P2** | **Sin indicador de pasos** en factura → cobro → conciliación ni en el cierre de mes | `invoice-detail`, `fiscal-periods` | Stepper en el detalle de factura + pantalla nueva "Cierre de mes guiado" (E.3) | backend 1,5 d, frontend 2 d | `invoice-detail.html` (+1 línea), `fiscal-periods.ts` (+1 enlace, opcional) | Bajo |
| **P2** | **Nombres técnicos en el menú**: "Catálogos", "Diarios", "Numeración de documentos", "Clasificación de cuentas", "Configuración contable"; "tercero" en ≈43 textos | `layout/nav.ts`, 16 archivos | Menú reagrupado por intención (E.5) y barrido de "tercero" (D10) | frontend 0,5 d + barrido 0,5 d | `nav.ts` (ya en la lista) + 13 archivos solo de textos | Bajo / medio |
| **P3** | Pantallas con **varios botones principales** compitiendo (3–4 `btn-primary`) | `users`, `budget-detail`, `receivables`, `bank-account-detail`, `reconciliation-detail` | Dejar uno principal; los demás `btn` normales | frontend 0,5 d | 5 archivos (1–3 líneas) | Bajo |
| **P3** | Formularios sin aviso previo de "no puedes hacer esto todavía" (p. ej. facturar sin NCF) | `invoice-form`, `payment-form` (sin caja/banco) | `app-readiness-notice` con enlace a configurar (usa el estado de E.3) | frontend 0,5 d | ya tocados | Bajo |
| **P3 (opcional)** | No hay **buscador global / paleta de acciones** | — | `Ctrl+K` / botón "Buscar o hacer…" en la barra: acciones del menú ("crear factura") y búsqueda de clientes y facturas con los filtros `q` que ya existen | frontend 2,5 d | `shell.*` (ya en la lista) | Bajo |

**Dimensión del cambio sobre el código del socio**: hacer **todo** P1+P2+P3 toca **≈30
archivos suyos** (la mayoría con 1–6 líneas), además de los de C y D. Por eso se propone (D13):
1. **Primero lo global** (migas, siguiente paso, traductor de errores, Ayuda): logra mucho
   tocando solo 3 archivos (`shell.*`, `errors.ts`).
2. **Luego lo nuevo** (asistente, pendientes, flujos guiados): casi todo en archivos nuevos.
3. **Al final, la adopción pantalla por pantalla** (estados vacíos, ayudas de campo, un solo
   botón principal), en una fase propia (**Fase G2**) **acordada con el socio**: o la hacemos
   nosotros en un momento en que él no esté tocando esas pantallas, o le entregamos los
   componentes y una guía de adopción para que la haga él en su repositorio.

### E.2 Componentes reutilizables (nuevos, en `shared/ui/`, siguiendo el estilo del kit)

En vez de rediseñar pantallas, se agregan piezas pequeñas al kit (archivos nuevos + 1 línea cada
uno en `shared/ui/index.ts`, archivo del socio):

| Componente | Qué hace | Dónde se usa |
|---|---|---|
| `app-breadcrumbs` | Migas **automáticas**: grupo del menú (`NAV` en `nav.ts`) › opción › `title` de la ruta ("Nueva", "Factura B0100000012"). Las pantallas no pasan nada | En la barra superior del `shell` (todas las pantallas sin tocarlas) |
| `app-next-step` | Una línea "Siguiente paso: …" con enlace, leída de `public/manual/guia.json` (ruta → texto y enlace) que **mantiene el documentador** | En el `shell`, debajo de las migas |
| `app-page-header` | Título, descripción, siguiente paso según el estado (p. ej. "Esta factura está emitida: registra el cobro") y la acción principal siempre a la derecha | Pantallas nuevas; las existentes conservan su `page-head` (ya cumple) salvo que se toquen |
| `app-empty-state` | Ícono suave, título, explicación, botón grande de "crear el primero" o enlace a configurar; variante "con filtros" con "Quitar filtros" | Listas nuevas; adopción en las 12 existentes (G2) |
| `app-stepper` | Pasos con estado hecho / actual / pendiente / con problema, cada uno con enlace | Asistente, flujo de factura, cierre de mes, encargo de auditoría |
| `app-field-help` | Ícono "?" pequeño junto a la etiqueta; al tocarlo muestra 1–3 frases y "Más en el manual". Textos en `public/manual/ayudas-campos.json` (los mantiene el documentador, sin programar). Hecho con un botón y un panel propio (accesible con teclado, sin librerías, compatible con la CSP) | Campos difíciles (E.1, P2) |
| `app-error-notice` | Muestra el error traducido + "Cómo arreglarlo" + botón al lugar donde se arregla | Formularios principales |
| `app-help-button` | El "?" de la sección D, reutilizable también dentro de un panel | Barra superior; asistente |

Todo con las clases y variables de `styles.css` (`panel`, `notice`, `btn`, `--primary`,
`--pos`, `--text-dim`...). **Ningún color ni fuente nuevos.**

### E.3 Configuración inicial guiada y flujos (backend + pantallas nuevas)

**Módulo backend nuevo `src/guidance/`** (misma forma que los demás módulos):

| Método y ruta | Roles | Qué hace |
|---|---|---|
| GET `/guidance/setup-status` | todos | Lista de pasos con estado y motivo: datos de la empresa (RNC, nombre, dirección); plan de cuentas (hay cuentas; % clasificadas); cuentas automáticas (CxC, CxP, ingresos y gastos por defecto en `AccountingSettings`); impuestos (ITBIS de venta y compra); comprobantes (secuencia NCF activa y vigente para venta); diarios; año fiscal abierto que incluya hoy; banco o caja; al menos un cliente; primera factura emitida. Cada paso trae la ruta donde se resuelve |
| POST `/guidance/chart-template` | ADMIN | Carga el **plan de cuentas base de RD**: cuentas con su tipo, categoría, flujo de efectivo y auxiliar ya puestos; llena las **cuentas automáticas** y crea los **impuestos base** (ITBIS 18 %, 16 %, exento; retenciones habituales de ISR e ITBIS) ligados a sus cuentas. **Solo si la empresa no tiene cuentas** (si no, 409 "Ya tienes un plan de cuentas; puedes ajustarlo en Plan de cuentas"). Todo en una transacción con `writeAudit` |
| GET `/guidance/invoice-flow/:id` | todos | Pasos de una factura: creada → emitida → cobrada/pagada (total o parcial) → conciliada en el banco (si el cobro está enlazado a un movimiento bancario conciliado) |
| GET `/guidance/period-close?periodId=` | todos | Chequeos antes de cerrar un mes: asientos pendientes de aprobar, facturas en borrador con fecha del mes, cuentas bancarias sin conciliar al cierre del mes, balanza que cuadra, avisos del 606/607 del mes (reutiliza `DgiiService`, que su módulo ya exporta). Cada chequeo con enlace |

El plan de cuentas base vive en `src/guidance/templates/plan-cuentas-rd.ts`. **Su contenido lo
validan las dos contadoras** (cuentas, códigos, categorías, tasas e impuestos) **antes** de
programarlo (D14). Esto adelanta el "plan de cuentas base dominicano" que `PLAN.md` dejaba para su
Fase 8. Aunque las acciones las ejecuten los botones existentes (crear diarios estándar
`POST /journals/defaults`, crear año fiscal `POST /fiscal-years`, clasificar automático
`POST /account-classification/auto`), **ningún controlador existente cambia**.

**Pantallas nuevas**
- **`/setup` — "Configuración inicial"** (`features/setup/`): un `app-stepper` vertical con los
  pasos de `setup-status`. Cada paso explica en 2 líneas qué es y por qué hace falta, y tiene **un
  botón grande** que: hace la acción ahí mismo cuando se puede (cargar plan base, crear diarios
  estándar, crear el año fiscal en curso, crear el primer cliente con el diálogo de 6C), o abre la
  pantalla donde se hace (datos de la empresa, NCF —los rangos los da la DGII y no se pueden
  inventar—, banco). Al volver, el paso aparece hecho. Para ADMIN; los demás roles lo ven en modo
  lectura con "Pide a tu administrador que complete: …".
- **Panel**: tarjeta "Pendientes de configurar (3 de 10)" con los pasos que faltan y botón
  "Continuar configuración"; desaparece sola cuando todo está hecho (`setup-checklist.ts`, +1 línea
  en `dashboard.html`).
- **Detalle de factura**: `app-stepper` horizontal con creada → emitida → cobrada → conciliada y
  el botón del siguiente paso (+1 línea en `invoice-detail.html`).
- **`/period-close` — "Cierre de mes guiado"** (`features/ledger/period-close.ts`, archivo nuevo en
  el área existente; +1 ruta en `ledger.routes.ts`): elegir el mes, ver los chequeos con su estado
  y enlace, y al final el botón "Cerrar el mes" (usa el endpoint existente de cierre de período).
- Avisos previos `app-readiness-notice` en la factura y el pago ("Para facturar con comprobante
  fiscal falta configurar la secuencia NCF de tipo B01 → Configurar comprobantes").

### E.4 Errores que explican y llevan a la solución
- **Traductor central** (`core/error-text.ts`, nuevo) que reconoce los mensajes estándar de
  validación en inglés ("must be a UUID", "should not be empty", "must not be greater than",
  "property X should not exist"...) y los convierte a español con el nombre del campo en lenguaje
  de negocio (diccionario `partnerId` → "Cliente o proveedor", `issueDate` → "Fecha"...).
  `errorMessage()` de `core/errors.ts` lo llama (2–3 líneas): **todas las pantallas mejoran sin
  tocarlas**. Se elige el frontend y no un cambio global en el `ValidationPipe` del backend para no
  alterar respuestas que las pruebas e2e del socio ya verifican.
- **"Cómo arreglarlo"**: dev-backend saca la lista completa de mensajes de reglas de negocio
  (`throw new ...Exception('...')`) y el documentador escribe, para los ≈30 más frecuentes, la
  explicación y el lugar donde se arregla, en `public/manual/errores.json` (mensaje o patrón →
  explicación → enlace). `app-error-notice` lo usa. Los mensajes técnicos del backend (p. ej.
  "Indica exactamente uno: invoiceId, paymentId…") se reescriben ahí, **sin tocar el backend**.

### E.5 Menú por intención (`layout/nav.ts`, a validar con las contadoras)
| Grupo | Opciones |
|---|---|
| (sin título) | Panel · **Configuración inicial** (mientras falten pasos) |
| Ventas y compras | **Clientes y proveedores** · Facturas · Cobros y pagos · Cuentas por cobrar y pagar |
| Bancos y caja | Bancos y cajas · Conciliación bancaria |
| Contabilidad | Asientos · Plan de cuentas · **Cierre de mes guiado** · Períodos fiscales · Años fiscales y cierre · Saldos iniciales |
| Reportes | Estados financieros · **Análisis financiero** · DGII 606 · 607 · 608 · Presupuestos |
| Auditoría | Encargos de auditoría (ADMIN y AUDITOR) |
| Configuración (antes "Catálogos" y "Administración") | Empresa · Usuarios · Impuestos · Comprobantes fiscales (NCF) · **Clasificación de cuentas para reportes** · **Cuentas automáticas** (antes "Configuración contable") · **Libros diarios** (antes "Diarios") · **Numeración de facturas y pagos** (antes "Numeración de documentos") |
| Ayuda | Manual de usuario |
Las rutas no cambian: solo nombres y orden.

### E.6 Prueba de "usuario nuevo sin capacitación" (qa)
Por cada flujo: **configurar una empresa nueva**; **crear un cliente y su factura de venta**;
**registrar el cobro**; **registrar una compra con retención**; **conciliar el banco del mes**;
**cerrar el mes**; y en sus fases, **leer el semáforo** y **hacer un encargo de auditoría**.
1. qa escribe una **tarjeta de tarea** que solo dice el objetivo ("Tu empresa vendió RD$ 11.800
   a Ferretería X con comprobante de crédito fiscal; regístralo"), sin instrucciones.
2. **Recorrido de qa** (con Playwright, que ya está instalado como herramienta de desarrollo):
   avanza **solo con lo que dice la pantalla** y anota cada punto donde el siguiente paso no es
   obvio, cada error sin "cómo arreglarlo" y cada término técnico. Criterio: el flujo se completa
   sin salir de lo que la pantalla indica, sin callejones sin salida.
3. **Prueba con una persona real** al cierre de cada fase: Carlos o alguien de su equipo que
   **no** haya usado el sistema, 15–20 minutos por flujo, sin ayuda. qa toma notas de dónde se
   detiene. Lo que salga se corrige antes de cerrar la fase.

### E.7 Lo que cambia en las fases
- **Fase 1A** suma lo global (migas, siguiente paso, traductor de errores, componentes del kit) y
  aplica E1–E6 a todo lo que toca (factura, pago, diálogo de clientes, Ayuda).
- **Fase G1 (nueva)**: configuración inicial guiada y flujos (E.3).
- **Fase G2 (nueva)**: adopción en las pantallas existentes del socio (estados vacíos, ayudas de
  campo, errores con enlace, un solo botón principal, menú por intención), **acordada con el
  socio**; paleta de acciones si Carlos la aprueba.
- **Fases 1B, 2, 3 y 4**: toda pantalla nueva nace cumpliendo E1–E6 (el encargo de auditoría usa
  `app-stepper` para su estado; el semáforo usa `app-field-help` en cada razón).

---

## 7. Permisos y aislamiento

### 7.1 Matriz de permisos

| Acción | ADMIN | ACCOUNTANT | APPROVER | VIEWER | **AUDITOR** |
|---|---|---|---|---|---|
| Leer contabilidad, reportes, exportaciones | Sí | Sí | Sí | Sí | **Sí** |
| Escribir en contabilidad (asientos, facturas, pagos, maestros...) | según hoy | según hoy | según hoy | No | **No** |
| Ver análisis financiero e indicadores | Sí | Sí | Sí | Sí | Sí |
| Cambiar límites del semáforo y costos fijos/variables | Sí | Sí | No | No | No |
| Crear encargo | Sí | No | No | No | Sí |
| Papeles de trabajo, procedimientos, tildes, archivos, hallazgos | Ver según D3 | No | No | No | **Sí** |
| Comunicar / cerrar hallazgos, cerrar encargo | No | No | No | No | Sí |
| Responder hallazgos (gerencia) | Sí (solo comunicados) | No (D4) | No | No | No |
| Reabrir encargo cerrado (con motivo) | Sí | No | No | No | Sí |
| Informe final | Sí | No | No | No | Sí |
| Crear usuarios Auditor | Sí (pantalla de Usuarios existente) | No | No | No | No |

### 7.2 Aislamiento por empresa

- `companyId` siempre de `user.companyId`; nunca del navegador.
- Toda lectura con `where: { companyId }`; todo `update/delete` por id con `companyId` (lo vigila el
  test existente de regresión).
- Llaves compuestas `(engagementId, companyId)` y `(workpaperId, companyId)`: la base rechaza
  mezclar empresas aunque el programa se equivoque.
- Tildes: antes de guardar, el servicio busca el documento con `{ id, companyId }` (como
  `resolveParent` en adjuntos); si no existe ⇒ 404.
- `AccountCostBehavior`: se verifica que la cuenta sea de la empresa y sea de tipo gasto.
- Archivos: clave generada por el servidor bajo la carpeta de la empresa; descarga busca por
  `{ id, companyId }`.

### 7.3 Rendimiento

Una tendencia de 24 meses son ≈24 × 6 consultas agregadas. Con los datos de prueba debería
tardar 1–3 segundos. qa mide el tiempo con un volumen realista (p. ej. 20.000 asientos) en la
Fase 1B. Si pasa de 5 segundos: limitar a 12 puntos por defecto y, solo si no basta, evaluar las
fotos (`FinancialRatioSnapshot`) **únicamente para períodos cerrados**, invalidándolas al reabrir.

---

## 8. Pantallas y rutas (frontend)

Todas con el kit existente, `OnPush`, signals, etiquetas en `labels.ts`, sin estilos sueltos.

### 8.1 Análisis financiero (área `reporting`)

Ruta `/analysis` en `features/reporting/reporting.routes.ts`; componente
`features/reporting/analysis.ts` (+ `analysis.html`), con pestañas `.tabs/.tab` como
`reports.html` y enlace profundo `?tab=`:

| Pestaña | Contenido | Fase |
|---|---|---|
| Semáforo | Selector de período; tarjetas por grupo (liquidez, endeudamiento, rentabilidad, actividad) con valor, `StatusBadge`-tono verde/amarillo/rojo/gris + texto, interpretación y fórmula; aviso si hay cuentas sin clasificar (enlace a Clasificación de cuentas); Excel/PDF con `ExportButtons` | 1B |
| Tendencia | Elegir razones (máx. 4 a la vez) y granularidad; gráfica de líneas con `ChartView`, bandas de color de fondo opcionales; tabla debajo | 1B |
| Comparar períodos | Dos selectores de período (atajo "mismo período del año anterior"); tabla con A, B, diferencia, flecha mejoró/empeoró; gráfica de barras agrupadas | 1B |
| Configuración | Tabla de límites por razón: por defecto, valor de la empresa, activar/desactivar, "volver al valor por defecto". Solo editable para ADMIN y ACCOUNTANT | 1B |
| EBITDA y DuPont | Cascada de utilidad (ingresos → EBITDA → EBIT → neta) y el árbol DuPont con la comprobación del ROE | 4 |
| Punto de equilibrio | Cifras clave, gráfica clásica de ingresos vs. costos totales con el punto marcado; sub-pestaña "Costos fijos y variables" con la tabla editable | 4 |
| Vertical y horizontal | Selector balance/resultados y fechas; tabla por categoría con desplegable por cuenta; % y variaciones; exportar | 4 |

Componentes compartidos nuevos dentro de la carpeta del área (no en `shared/ui`, para no chocar):
`features/reporting/analysis-light.ts` (la pastilla de semáforo con texto) y
`features/reporting/analysis-types.ts` (tipos de respuesta).

En la pestaña "Razones financieras" existente, **opcional**: un enlace "Ver semáforo y tendencia"
(1 línea en `reports.html`).

### 8.2 Indicadores en el Panel

Componente nuevo `features/dashboard/kpi-strip.ts` (6 `.figure` con color, texto y flecha contra
el año anterior; clic lleva a `/analysis`). En `dashboard.html` se agrega **una línea**
`<app-kpi-strip />` debajo de las cifras, y en `dashboard.ts` el import. Carga independiente:
si falla, el resto del Panel sigue funcionando.

### 8.3 Auditoría (área nueva `audit`)

`features/audit/audit.routes.ts`, todas con `roleGuard('ADMIN', 'AUDITOR')`:

| Ruta | Pantalla | Fase |
|---|---|---|
| `/audit` | Lista de encargos (estado, período, avance, hallazgos por gravedad) y "Nuevo encargo" (modal con período y áreas) | 2 |
| `/audit/:id` | Encargo: encabezado y pestañas **Resumen** (avance, conclusión general, cambiar estado), **Áreas**, **Partidas**, **Hallazgos**, **Informe** | 2 (Partidas e Informe en 3) |
| `/audit/:id/areas/:wpId` | Papel de trabajo: objetivo, lista de procedimientos con casillas y resultado, conclusión, preparado/revisado, archivos (fase 3), hallazgos de esa área | 2 |
| `/audit/:id/items` (pestaña Partidas) | Selector de tipo (asientos, facturas, pagos, conciliaciones), búsqueda y filtro revisadas/pendientes; tabla con columna de tilde (menú con las 5 marcas + nota); enlace que abre el documento en su pantalla existente (`/entries/:id`, `/invoices/:id`...) en otra pestaña; aviso O2 y botón O1 si se aprueban | 3 |
| `/audit/:id/findings/:fId` | Hallazgo: campos, gravedad, estado, archivos; bloque "Respuesta de la gerencia" editable solo para ADMIN cuando está comunicado | 2 |

Vista del ADMIN: entra a `/audit`, ve los encargos de su empresa, los hallazgos comunicados y
responde; descarga el informe. No ve borradores ni (según D3) los papeles.

Archivos del auditor: componente nuevo `features/audit/audit-files.ts` siguiendo **el mismo
diseño** que `shared/ui/attachments.ts` (mismo HTML y clases), apuntando a `/auditing/files`.
Se copia en vez de modificar el compartido para no chocar con el socio (deuda menor anotada).

Menú (`layout/nav.ts`): en "Reportes" se agrega "Análisis financiero" (`/analysis`); grupo nuevo
"Auditoría" con "Encargos de auditoría" (`/audit`, roles ADMIN y AUDITOR).

Usuarios: la pantalla existente toma los roles de `opts.role`, así que al agregar `AUDITOR:
'Auditor'` en `ROLE` aparece sola en el selector. Sin otro cambio.

### 8.4 Impacto en diseño visual

Se usa **solo** el sistema existente: clases de `styles.css`, tonos `pos/warn/neg` de `.badge`
para verde/amarillo/rojo (más un gris con la clase `faint`), `ChartView` para todas las gráficas
y `ExportButtons` para descargar. Ningún color, fuente ni componente visual nuevo fuera de
estilos locales cortos de cada componente (como hace `dashboard.ts`). Los botones de "Crear /
Editar / Ir a..." junto al selector usan `btn btn-ghost btn-sm` como las acciones de las tablas;
el diálogo de cliente/proveedor es **el mismo** que ya existe; el panel de Ayuda usa `panel` y las
variables de color de `styles.css`. Los componentes de experiencia guiada (6E.2) son piezas
nuevas **del mismo kit** (`shared/ui`), con sus clases y variables; el botón principal sigue siendo
`btn-primary` (`--primary`, verde ya existente). qa revisa en pantalla de
portátil y de tableta que nada desentone.

---

## 9. Plan por fases

Flujo de agentes en **cada fase**:
1. **arquitecto** (este plan) → **revisor-critico** revisa el plan completo **una vez antes de
   empezar** y cada fase si cambia algo de fondo → **Carlos** aprueba las decisiones de la
   sección 12.
2. **dev-backend** (migración, servicio, controlador, pruebas e2e propias del módulo) →
   **dev-frontend** (puede empezar en paralelo contra el contrato de la API definido aquí).
3. **qa**: corre **toda** la suite e2e (las existentes + las nuevas), revisa pantallas con cada
   rol y emite el veredicto.
4. **seguridad**: en las fases que tocan permisos, datos o archivos (**2 y 3** completa; **1 y 4**
   revisión corta de roles en las rutas nuevas).
5. **documentador**: trabaja **en paralelo desde la Fase 0** escribiendo el manual (6D.5); al
   cerrar cada fase publica la sección de lo entregado y las notas para el socio.
6. **Despliegue en el ambiente de pruebas** (finanzas.biodesch.com) por devops con
   autorización de Carlos: `docker compose -p financiero-pruebas -f docker-compose.prod.yml -f
   docker-compose.pruebas.yml --env-file .env.production up -d --build` (las migraciones se
   aplican solas en el contenedor `migrate`). Antes: copia de la base de pruebas.
7. **Carlos y las contadoras** prueban; sus comentarios entran a la fase siguiente.

Además, en **toda** fase con pantallas: dev-frontend aplica los criterios E1–E6 (6E.0), el
revisor-critico los verifica y qa hace la prueba de "usuario nuevo sin capacitación" (6E.6).

**Orden de ejecución recomendado**: 0 → **1A** → **G1** → **1B** → **G2** → **2** → **3** → **4** → **5**.
(Los nombres de las fases se conservan para no confundir referencias; G = "guiada".)

Tamaños: **S** = horas · **M** ≈ 1 día · **L** = 2–3 días.

### Fase 0 — Preparación (≈1–2 días)
| # | Agente | Tarea | Tam. |
|---|---|---|---|
| 0.1 | revisor-critico | Revisión de este plan | S |
| 0.2 | Carlos | Decisiones D1–D16; **avisar al socio antes de empezar** (D9): la Fase 1A ya toca `partners.ts`, `invoice-form.*`, `payment-form.ts`, `nav.ts` y `shell.*` | — |
| 0.3 | qa | Línea base: toda la suite e2e en verde **antes** de tocar nada; anotar tiempos | S |
| 0.4 | documentador + contadoras | Revisar textos de la plantilla de áreas/procedimientos y los límites del semáforo (borrador del arquitecto en 5.2 y 6.2) | S |
| 0.5 | documentador | Guía de estilo del manual + `indice.json` inicial; empieza las secciones 1, 3, 4, 5 y 10 sobre las pantallas actuales | M |
| 0.6 | documentador + contadoras | Borrador del **plan de cuentas base RD** e impuestos base para que las contadoras lo validen (D14); borrador de `guia.json` (siguiente paso por pantalla) y de `errores.json` | M |

### Fase 1A — Usabilidad, Ayuda y base de la experiencia guiada (≈1,5 semanas) — **lo primero que prueban las contadoras**
**Entregable:** crear/editar cliente o proveedor desde la factura y desde cobros/pagos sin
perder lo escrito; enlace a la lista en otra pestaña; textos "cliente / proveedor"; menú
reordenado por intención; migas y "siguiente paso" en todas las pantallas; errores de validación
en español; pantalla "Ayuda" con las secciones 1, 3, 4, 5 y 10 y el botón "?" funcionando.
| # | Agente | Tarea | Tam. |
|---|---|---|---|
| 1A.1 | dev-frontend | Extraer `features/catalog/partner-dialog.ts` y hacer que `partners.ts` lo use, sin cambiar su comportamiento | M |
| 1A.2 | dev-frontend | Factura: botones Crear / Editar / Ir a clientes y proveedores, tipo según `side()`, caso "ya no corresponde el tipo" | M |
| 1A.3 | dev-frontend | Cobros y pagos: mismo patrón, tipo según dirección | S |
| 1A.4 | dev-frontend | C2 en los archivos tocados (y barrido completo si Carlos lo aprueba, D10); C3 en `nav.ts` | S |
| 1A.5 | dev-frontend | Ayuda: área `help`, servicio de contenido, visor con `marked` cargado bajo demanda, panel lateral, botón "?" en `shell`, entrada "Ayuda" en el menú | L |
| 1A.6 | devops | Bloque `location /manual/` en `frontend/deploy/nginx.conf` (sin caché larga, 404 real) | S |
| 1A.7 | documentador | Publicar secciones 1, 3, 4, 5 y 10 + mapa de pantallas; capturas con datos ficticios | M |
| 1A.8 | qa | Suite e2e completa (debe seguir igual: no hay cambios de backend); pruebas manuales 10.5 con cada rol | M |
| 1A.9 | seguridad | Revisión corta: contenido del manual insertado de forma segura, CSP sin cambios, enlaces externos | S |
| 1A.10 | dev-frontend | Componentes del kit: `app-breadcrumbs`, `app-next-step` (con `guia.json`), `app-page-header`, `app-empty-state`, `app-stepper`, `app-field-help`, `app-error-notice`; migas y siguiente paso en el `shell`; menú por intención (6E.5) | L |
| 1A.11 | dev-frontend | Traductor de errores `core/error-text.ts` + 2–3 líneas en `errors.ts`; `app-error-notice` y ayudas de campo en factura, pago y diálogo de clientes | M |
| 1A.12 | dev-backend | Lista de todos los mensajes de error de negocio del backend (para `errores.json`) — solo lectura del código | S |
| 1A.13 | qa | Prueba "usuario nuevo" de los flujos "crear cliente y factura" y "registrar el cobro" (6E.6) | M |

### Fase G1 — Configuración inicial y flujos guiados (≈2 semanas)
**Requisito previo:** plan de cuentas base RD validado por las contadoras (0.6, D14).
**Entregable:** una empresa nueva se configura sola con el asistente; el Panel muestra lo que
falta; la factura muestra sus pasos hasta la conciliación; el cierre de mes es guiado.
| # | Agente | Tarea | Tam. |
|---|---|---|---|
| G1.1 | dev-backend | Módulo `src/guidance/` + registro en `app.module.ts`; `setup-status` | M |
| G1.2 | dev-backend | `chart-template` con el plan base RD, cuentas automáticas e impuestos base (una transacción, `writeAudit`, 409 si ya hay cuentas) | L |
| G1.3 | dev-backend | `invoice-flow` y `period-close` | M |
| G1.4 | dev-backend | e2e `test/guidance.e2e-spec.ts` (10.6) | M |
| G1.5 | dev-frontend | Asistente `/setup` con `app-stepper`, acciones directas y regreso desde las pantallas existentes | L |
| G1.6 | dev-frontend | Pendientes en el Panel; stepper en el detalle de factura; avisos previos en factura y pago | M |
| G1.7 | dev-frontend | Pantalla "Cierre de mes guiado" | M |
| G1.8 | documentador | Sección 2 del manual reescrita alrededor del asistente; sección "Cierre de mes" en la 6; mapas `guia.json` | M |
| G1.9 | qa | Suite completa; prueba "usuario nuevo" de "configurar una empresa nueva" (empezando de cero) y "cerrar el mes"; verificar contra una contadora el plan cargado | M |
| G1.10 | seguridad | Revisión corta: solo ADMIN carga plantilla, aislamiento del estado | S |

### Fase 1B — Semáforo, comparación, Panel y resto del manual (≈1,5 semanas)
**Entregable:** pantalla "Análisis financiero" con Semáforo, Tendencia, Comparar y
Configuración; 6 indicadores en el Panel; exportar semáforo y comparación; secciones 2, 6, 7,
8, 9 y la primera parte de la 11 del manual.
| # | Agente | Tarea | Tam. |
|---|---|---|---|
| 1B.1 | dev-backend | Esqueleto `src/financial-analysis/` + registro en `app.module.ts`; modelo `RatioThreshold` + migración; valores por defecto y dirección en `ratio-thresholds.defaults.ts` | M |
| 1B.2 | dev-backend | `health` (color, anualización, interpretaciones en `ratio-interpretations.ts`) y `thresholds` GET/PUT/DELETE con validación y `writeAudit` | L |
| 1B.3 | dev-backend | `trend` (máx. 24 puntos, 4 a la vez), `compare`, `kpis`; exportaciones de semáforo y comparación | L |
| 1B.4 | dev-backend | e2e `test/financial-analysis.e2e-spec.ts` (sección 10.1) | M |
| 1B.5 | dev-frontend | Ruta, menú, etiquetas; pestañas Semáforo y Configuración | L |
| 1B.6 | dev-frontend | Pestañas Tendencia y Comparar con `ChartView`; `kpi-strip` en el Panel | L |
| 1B.7 | documentador | Secciones 2, 6, 7, 8, 9 y "Cómo leer el semáforo" (11); mapa de pantallas de `/analysis` | M |
| 1B.8 | qa | Suite completa; cifras contra cálculo a mano; prueba de tiempo de la tendencia; revisión visual por rol | M |
| 1B.9 | seguridad | Revisión corta: roles en PUT/DELETE, aislamiento de límites | S |

### Fase G2 — Pantallas existentes guiadas (≈1,5 semanas) — **acordada con el socio**
**Entregable:** las pantallas actuales cumplen E3–E6: estados vacíos útiles, ayudas en campos
difíciles, errores con enlace a la solución, un solo botón principal; barrido de "tercero" si
se aprobó (D10); paleta de acciones si se aprobó (D15).
| # | Agente | Tarea | Tam. |
|---|---|---|---|
| G2.1 | dev-frontend | `app-empty-state` en las 12 listas (6E.1, P2) | L |
| G2.2 | dev-frontend | `app-field-help` en los 8–9 formularios con campos difíciles | M |
| G2.3 | dev-frontend | `app-error-notice` en asiento, conciliación y períodos; un solo `btn-primary` en las 5 pantallas señaladas | M |
| G2.4 | dev-frontend | (Opcional, D15) Paleta "Buscar o hacer…" en la barra superior | L |
| G2.5 | documentador | `ayudas-campos.json` y `errores.json` completos; revisión de todo el manual | M |
| G2.6 | qa | Prueba "usuario nuevo" de "compra con retención" y "conciliar el banco"; repaso de E1–E6 pantalla por pantalla | M |
| G2.7 | revisor-critico | Verifica que cada cambio en archivos del socio sea mínimo y esté en la lista de la sección 11 | S |
Alternativa (D13): en vez de G2.1–G2.3, entregar al socio los componentes y una **guía de
adopción** con la lista exacta de pantallas, para que él lo haga en su repositorio.

### Fase 2 — Auditor: rol, encargos, papeles y hallazgos (≈2 semanas)
**Entregable:** el ADMIN crea un usuario Auditor; la auditora abre un encargo, trabaja las
áreas con sus procedimientos y registra hallazgos; la gerencia los responde.
| # | Agente | Tarea | Tam. |
|---|---|---|---|
| 2.1 | dev-backend | `AUDITOR` en `UserRole`; modelos Engagement/Workpaper/Procedure/Finding + migración aditiva; `audit-templates.ts` | M |
| 2.2 | dev-backend | Encargos (CRUD, estados, cierre/reapertura, bloqueo de cerrado) | L |
| 2.3 | dev-backend | Papeles y procedimientos; firmas preparado/revisado | M |
| 2.4 | dev-backend | Hallazgos (numeración, estados, respuesta de gerencia, visibilidad del ADMIN) | L |
| 2.5 | dev-backend | Actualizar la lista de lecturas restringidas en `security.e2e-spec.ts`; e2e `test/auditing.e2e-spec.ts` y `test/auditor-role.e2e-spec.ts` (10.2) | M |
| 2.6 | dev-frontend | `Role` + etiquetas + rutas + menú; lista de encargos y "Nuevo encargo" | M |
| 2.7 | dev-frontend | Pantalla del encargo (Resumen, Áreas, Hallazgos), papel de trabajo, hallazgo y respuesta de gerencia | L |
| 2.8 | qa | Suite completa; recorrido con AUDITOR, ADMIN, ACCOUNTANT y VIEWER; que el auditor no vea ningún botón de escritura contable (y si alguno aparece, que la API dé 403) | M |
| 2.9 | seguridad | Revisión completa: rol nuevo, rutas, aislamiento, bitácora | M |
| 2.10 | documentador | Sección 12 del manual "Auditoría paso a paso" (para la auditora y para la gerencia); ampliar la 9 con el rol Auditor; mapa de pantallas `/audit` | S |

### Fase 3 — Tildes, archivos e informe (≈2 semanas)
**Entregable:** la auditora marca partidas revisadas, sube soportes y descarga el informe en
PDF y Excel.
| # | Agente | Tarea | Tam. |
|---|---|---|---|
| 3.1 | dev-backend | Modelos `AuditCheckmark`, `AuditFile` + migración aditiva | S |
| 3.2 | dev-backend | `items` (consulta de documentos del período por tipo, con tilde) y `marks` | L |
| 3.3 | dev-backend | Archivos reutilizando `LocalFileStorage`, `detectFile`, `sanitizeFileName`, `contentDisposition` | M |
| 3.4 | dev-backend | Informe: `auditing-report.builder.ts` + `renderPdf/renderXlsx` | L |
| 3.5 | dev-backend | Opcionales O1/O2 si Carlos los aprueba | M |
| 3.6 | dev-backend | e2e (10.3) | M |
| 3.7 | dev-frontend | Pestaña Partidas con tildes; `audit-files.ts`; pestaña Informe con `ExportButtons` | L |
| 3.8 | qa | Suite completa; informe abierto en Excel y lector de PDF, revisado por una contadora | M |
| 3.9 | seguridad | Archivos (tipos, tamaños, rutas), tildes sobre documentos ajenos | S |
| 3.10 | documentador | Completar la sección 12 (tildes, archivos, informe) | S |

### Fase 4 — Razones adicionales (≈1,5–2 semanas)
**Entregable:** EBITDA y DuPont, punto de equilibrio con costos fijos/variables, análisis
vertical y horizontal, con exportación.
| # | Agente | Tarea | Tam. |
|---|---|---|---|
| 4.1 | dev-backend | `AccountCostBehavior` + migración; GET/PUT `cost-behavior` | M |
| 4.2 | dev-backend | `dupont`, `break-even` (+ margen EBITDA en el semáforo) | L |
| 4.3 | dev-backend | `vertical`, `horizontal`; exportaciones | L |
| 4.4 | dev-backend | e2e (10.4) | M |
| 4.5 | dev-frontend | Pestañas EBITDA y DuPont, Punto de equilibrio (con tabla de costos), Vertical y horizontal | L |
| 4.6 | qa | Cifras contra cálculo a mano; suite completa | M |
| 4.7 | seguridad | Revisión corta | S |
| 4.8 | documentador | Completar la sección 11: EBITDA, DuPont, "Punto de equilibrio: cómo marcar costos fijos y variables", vertical y horizontal | S |

### Fase 5 — Entrega al socio (≈3–4 días)
| # | Agente | Tarea | Tam. |
|---|---|---|---|
| 5.1 | qa | Suite completa final sobre una base de pruebas **nueva** (aplicando todas las migraciones desde cero) | S |
| 5.2 | revisor-critico | Revisión final: convenciones de la sección 2, archivos modificados = lista de la sección 11, nada fuera de alcance | M |
| 5.3 | documentador | Paquete para el socio: resumen de cambios, lista de archivos nuevos y modificados con el motivo de cada línea, orden de migraciones, cómo probar, notas sobre posibles choques | M |
| 5.4 | Carlos | Entrega al socio por el medio que acuerden (D9) | — |

---

## 10. Pruebas que debe hacer qa (e2e con vitest, patrón `test/*.e2e-spec.ts`)

Todas siguen el esqueleto de `test/financial-ratios.e2e-spec.ts` (dos empresas, usuarios por
rol, `token[...]`, montos a mano en el comentario inicial, limpieza en `afterAll` borrando
primero las tablas nuevas). Antes de cada fase y al final: **toda** la suite existente en verde.

### 10.1 `test/financial-analysis.e2e-spec.ts` (Fases 1B y 4)
Se reutiliza el mismo juego de asientos del T1 2030 de `financial-ratios.e2e-spec.ts`
(utilidad neta 22.000; ingresos totales 91.000; ventas 90.000; costo 48.000; gastos op. 12.000;
depreciación 3.000; intereses 2.000; activo 200.000 → 242.000; patrimonio 100.000 → 122.000).
- Semáforo: razón corriente 2,4167 ⇒ verde; endeudamiento 49,5868 % ⇒ verde (límite 50 %);
  **valores justo en el límite** (cambiar el límite a 49,5868 y comprobar que sigue verde; a
  49,58 ⇒ amarillo); denominador cero ⇒ gris con nota.
- Anualización: ROA del T1 = 22.000 / 221.000 = 9,9548 % y se evalúa como 40,3722 %
  (× 365/90) con la marca "anualizado".
- Límites: PUT por ADMIN y ACCOUNTANT; 403 para APPROVER, VIEWER y AUDITOR; verde/rojo
  incoherentes ⇒ 400; clave inexistente ⇒ 400; los límites de A no afectan a B; DELETE vuelve
  al valor por defecto; cada cambio deja una fila en `AuditLog`.
- Tendencia: enero–marzo 2030 mensual = 3 puntos con la utilidad de cada mes calculada a mano;
  más de 24 puntos ⇒ 400; `from > to` ⇒ 400.
- Comparar: T1 2030 contra T1 2029 (sin movimientos) ⇒ diferencias y "sin dato" donde
  corresponde.
- Indicadores: devuelve las 6 claves, para cualquier rol, solo con datos de su empresa.
- Exportaciones: PDF empieza con `%PDF`, Excel es un zip válido y contiene "Razón corriente".
- Fase 4 — DuPont: 24,1758 % × 0,4118 × 1,9910 = ROE 19,8198 % (= 22.000 / 111.000) e igual al
  `roe` del generador.
- Fase 4 — Punto de equilibrio por defecto: variables 48.000, fijos 17.000, margen de
  contribución 46,6667 %, **ventas de equilibrio 36.428,57**, margen de seguridad 59,5238 %.
  Con gastos operativos al 50 % variable: variables 54.000, fijos 11.000, margen 40 %,
  **equilibrio 27.500**. Cuenta de otra empresa ⇒ 404; cuenta que no es gasto ⇒ 422;
  porcentaje fuera de 0–100 ⇒ 400.
- Fase 4 — Vertical: caja 88.000 / 242.000 = 36,3636 %. Horizontal: activo total 200.000 →
  242.000 = +42.000 (+21 %); base cero ⇒ % sin dato.

### 10.2 `test/auditing.e2e-spec.ts` y `test/auditor-role.e2e-spec.ts` (Fase 2)
- **El auditor no escribe en la contabilidad**: reutilizando la enumeración de rutas de
  "Política de rutas", un usuario AUDITOR recibe **403 en toda ruta que modifica datos fuera de
  `/auditing`** (así cubre también las rutas que el socio agregue en el futuro). Además recibe 200
  en una muestra de lecturas (reportes, facturas, asientos).
- Las rutas de `/auditing` dan 403 a ACCOUNTANT, APPROVER y VIEWER.
- `security.e2e-spec.ts` actualizado: la lista de lecturas restringidas incluye exactamente las
  de `/auditing` que se diseñaron, ni una más.
- Aislamiento: el auditor de A no ve, edita ni borra nada de B (404 en cada caso).
- Encargo duplicado (misma empresa y período) ⇒ 409. `periodStart > periodEnd` ⇒ 400.
- Al crear un encargo se precargan las áreas elegidas con sus procedimientos.
- Estados: cerrar con áreas pendientes o hallazgos en borrador ⇒ 422; cerrado ⇒ cualquier
  escritura 422; reabrir sin motivo ⇒ 400; con motivo ⇒ queda en `AuditLog`.
- Hallazgos: numeración correlativa sin huecos ni repetidos con **10 altas en paralelo**; el
  ADMIN no ve los DRAFT; responde solo COMMUNICATED (otro estado ⇒ 422); el AUDITOR no puede
  responder (403); borrar solo en DRAFT.
- Cada escritura deja su fila en `AuditLog` con el usuario correcto.

### 10.3 Fase 3 (en `auditing.e2e-spec.ts`)
- Tildes: sobre asiento, factura, pago y conciliación de la empresa ⇒ ok; documento de otra
  empresa ⇒ 404; fuera del período ⇒ 422; segunda tilde sobre lo mismo la reemplaza; `items`
  filtra revisadas/pendientes y pagina.
- O2 (si se aprueba): anular una factura después de marcarla ⇒ `items` la devuelve con el aviso.
- Archivos: PDF válido ⇒ ok; ejecutable renombrado a `.pdf` ⇒ rechazado (mismas reglas que
  adjuntos); archivo de otra empresa ⇒ 404; encargo cerrado ⇒ no se sube ni se borra;
  tope de 50 por papel.
- Informe: PDF (`%PDF`) y Excel (zip); el Excel leído con exceljs contiene H-001, el título del
  hallazgo y la respuesta de la gerencia; sin cerrar dice "BORRADOR"; VIEWER ⇒ 403.

### 10.4b Usabilidad y Ayuda (Fase 1A) — pruebas manuales guiadas de qa
No hay cambios de backend, así que las e2e existentes deben pasar **sin cambios** (en especial
`masters.e2e-spec.ts`, que cubre `/partners`). El frontend no tiene hoy pruebas automáticas
propias; no se introducen en la v0.2. Lista de comprobación:
- Factura de venta a medio llenar (3 líneas, fechas, moneda) → "Crear" → guardar un cliente →
  queda seleccionado y **las 3 líneas y demás datos siguen intactos**. Igual en compra (tipo
  Proveedor preseleccionado), en nota de crédito, y en cobro y pago.
- "Editar" cambia el NCF por defecto del cliente → la factura muestra "Según el cliente (B01)"
  con el valor nuevo. Cambiar el tipo a Proveedor en una venta → se quita la selección con aviso.
- Error del servidor al guardar (p. ej. RNC repetido) → el mensaje aparece dentro del diálogo y
  la factura no se altera. Cancelar el diálogo no cambia nada.
- "Ir a clientes y proveedores" abre otra pestaña ya con sesión; la factura sigue intacta.
- Con APPROVER y VIEWER no aparecen "Crear" ni "Editar" (y la API respondería 403).
- La pantalla `/partners` se comporta **igual que antes** (crear, editar, activar/desactivar,
  filtros, paginación).
- No queda ningún "tercero" visible en las pantallas incluidas en el alcance decidido (D10).
- Ayuda: el "?" en cada pantalla del mapa abre la sección y el ancla correctas; pantallas sin
  mapa abren el índice; el panel no borra lo escrito en un formulario; enlaces internos navegan
  y los externos abren otra pestaña; imágenes visibles; recargar `/help/04-facturas` funciona;
  un archivo inexistente muestra "sección no encontrada"; la consola del navegador **no**
  muestra bloqueos de la CSP.

### 10.6 `test/guidance.e2e-spec.ts` (Fase G1)
- Empresa nueva: `setup-status` devuelve todos los pasos pendientes con su ruta; tras cada acción
  (cargar plan, crear diarios, año fiscal, banco, cliente, factura) el paso correspondiente pasa
  a hecho.
- `chart-template`: solo ADMIN (403 a los demás, incluido AUDITOR); carga N cuentas, todas
  clasificadas y con las cuentas automáticas completas; crea los impuestos base ligados a
  cuentas de la misma empresa; **segunda llamada ⇒ 409** sin cambiar nada; si la empresa ya
  tenía cuentas ⇒ 409; la empresa B no se ve afectada; deja su fila en `AuditLog`.
- Después de cargar la plantilla, crear y emitir una factura de venta funciona sin más
  configuración que la secuencia NCF (prueba de que la plantilla es usable de punta a punta).
- `invoice-flow`: borrador → emitida → cobrada parcial → cobrada → conciliada, con los datos de
  `treasury.e2e-spec.ts` como modelo; factura de otra empresa ⇒ 404.
- `period-close`: un asiento pendiente, una factura en borrador y un banco sin conciliar
  aparecen como chequeos fallidos con su enlace; al resolverlos, todo en verde.
- La enumeración de rutas de `security.e2e-spec.ts` sigue pasando (lecturas abiertas, escritura
  con `@Roles(ADMIN)`).

### 10.7 Experiencia guiada (todas las fases con pantallas)
Prueba de "usuario nuevo sin capacitación" según 6E.6 y lista E1–E6 de 6E.0 por cada pantalla
nueva o tocada. Su resultado forma parte del veredicto de qa.

### 10.4 Revisión manual de pantallas (qa)
Con cada rol (ADMIN, ACCOUNTANT, APPROVER, VIEWER, AUDITOR): menú correcto, sin botones que
lleven a un 403, mensajes en español, cifras con formato es-DO, gráficas legibles, portátil y
tableta.

---

## 11. Archivos existentes que se modifican (para coordinar con el socio)

Todo lo demás son **archivos nuevos** en `src/auditing/`, `src/financial-analysis/`,
`prisma/migrations/<nuevas carpetas>/`, `test/` (3 archivos nuevos), `frontend/src/app/features/audit/`,
`frontend/src/app/features/help/`, `frontend/public/manual/`, y archivos nuevos dentro de
`features/reporting/`, `features/dashboard/` y `features/catalog/` (`partner-dialog.ts`).

| # | Archivo | Cambio | Fase | Riesgo de choque |
|---|---|---|---|---|
| 1 | `prisma/schema.prisma` | `AUDITOR` en `UserRole` (1 línea); en `Company` 3 líneas de relación (`auditEngagements`, `ratioThresholds`, `accountCostBehaviors`); en `Account` 1 línea (`costBehavior`); bloque de modelos nuevos **al final** | 1–4 | **Medio**: es el archivo que más toca el socio. Las líneas son agregados, fáciles de unir a mano |
| 2 | `src/app.module.ts` | 2 imports + 2 entradas (`AuditingModule`, `FinancialAnalysisModule`) | 1B, 2 | Bajo |
| 3 | `test/security.e2e-spec.ts` | Agregar las rutas `/auditing/...` a la lista esperada de "lecturas restringidas" | 2 | Bajo (si el socio agrega lecturas restringidas, se suman ambas) |
| 4 | `frontend/src/app/core/auth.ts` | `'AUDITOR'` en el tipo `Role` | 2 | Bajo |
| 5 | `frontend/src/app/shared/labels.ts` | `AUDITOR: 'Auditor'` en `ROLE`; mapas nuevos al final (estados de encargo y hallazgo, gravedad, áreas, marcas, semáforo); casos nuevos en `tone()` | 1–4 | Medio-bajo |
| 6 | `frontend/src/app/app.routes.ts` | 1 `loadChildren` para `audit` + la línea del comentario de áreas | 2 | Bajo |
| 7 | `frontend/src/app/features/reporting/reporting.routes.ts` | 1 ruta `analysis` | 1B | Bajo |
| 8 | `frontend/src/app/layout/nav.ts` | 1 entrada en "Reportes" y 1 grupo "Auditoría" | 1B, 2 | Bajo |
| 9 | `frontend/src/app/features/dashboard/dashboard.html` | 1 línea `<app-kpi-strip />` | 1B | Bajo |
| 10 | `frontend/src/app/features/dashboard/dashboard.ts` | 1 import en `imports: [...]` | 1B | Bajo |
| 11 | `frontend/src/app/features/reporting/reports.html` | *(Opcional)* 1 enlace "Ver semáforo y tendencia" | 1B | Bajo |
| 13 | `frontend/src/app/features/catalog/partners.ts` | Su modal y su lógica de formulario pasan a `partner-dialog.ts` (nuevo); la pantalla lo usa. Textos "cliente / proveedor" | 1A | **Alto**: es un cambio de ≈70 líneas en la pantalla "de referencia" del socio. Si él la está modificando, conviene acordar el momento |
| 14 | `frontend/src/app/features/sales/invoice-form.html` y `invoice-form.ts` | Botones junto al selector, diálogo, lógica de selección tras crear/editar, textos | 1A | Medio (≈15–30 líneas) |
| 15 | `frontend/src/app/features/sales/payment-form.ts` | Igual que la factura | 1A | Medio (≈15–25 líneas) |
| 16 | `frontend/src/app/layout/nav.ts` | (además de lo de la fila 8) mover "Clientes y proveedores" a "Ventas y compras" (C3) y entrada "Ayuda" | 1A | Bajo |
| 17 | `frontend/src/app/layout/shell.html` y `shell.ts` | Botón "?" en la barra superior y el panel de Ayuda | 1A | Bajo (≈3–5 líneas) |
| 18 | `frontend/src/app/app.routes.ts` | (además de la fila 6) 1 `loadChildren` para `help` | 1A | Bajo |
| 19 | `frontend/package.json` y `package-lock.json` | Dependencia `marked` (si se aprueba, D11) | 1A | Bajo-medio (el lockfile choca fácil; se regenera al unir) |
| 20 | `frontend/deploy/nginx.conf` | Bloque `location /manual/` (3 líneas) | 1A | Bajo |
| 22 | `frontend/src/app/shared/ui/index.ts` | 1 línea por componente nuevo del kit (≈8) | 1A | Bajo |
| 23 | `frontend/src/app/core/errors.ts` | 2–3 líneas: llamar al traductor de mensajes de validación | 1A | Bajo |
| 24 | `frontend/src/app/features/sales/invoice-detail.html` (y `.ts`) | 1 línea del indicador de pasos + import | G1 | Bajo |
| 25 | `frontend/src/app/features/ledger/ledger.routes.ts` | 1 ruta `period-close` | G1 | Bajo |
| 26 | `frontend/src/app/features/ledger/fiscal-periods.ts` | *(Opcional)* 1 enlace "Cierre de mes guiado" | G1 | Bajo |
| 27 | `frontend/src/app/features/dashboard/dashboard.html` | (además de la fila 9) 1 línea para "Pendientes de configurar" | G1 | Bajo |
| 28 | **Fase G2** (si la hacemos nosotros, D13): `users.ts`, `account-classification.ts`, `accounts.ts`, `document-sequences.ts`, `tax-rates.ts`, `entries.ts`, `budgets.ts`, `invoices.ts`, `payments.ts`, `reconciliations.ts`, `receivables.ts` (estados vacíos); `accounting-settings.ts`, `ncf.ts`, `opening-balances.ts` (ayudas de campo); `entry-form.ts`, `reconciliation-detail.ts/.html` (errores); `budget-detail.html`, `bank-account-detail.html` (un solo botón principal) | 1–6 líneas cada uno | G2 | **Medio** por cantidad (≈18 archivos) |
| 29 | *(Solo si Carlos aprueba el barrido completo de C2, D10)* `invoices.ts`, `payments.ts`, `receivables.ts`, `invoice-detail.html/.ts`, `payment-detail.ts`, `reports.html/.ts`, `opening-balances.ts`, `entry-detail.ts`, `dashboard.html`, `shared/ui/combobox.ts`, `core/lookups.ts` | Solo textos visibles ("tercero" → "cliente / proveedor") | 1A | Bajo por archivo, pero son 13 archivos más |
| 12 | `prisma/migrations/` | **No se modifica ninguna existente**; se agregan 3 carpetas nuevas (auditoría Fase 2, archivos/tildes Fase 3; análisis Fases 1B y 4 — o una por fase). Riesgo: si el socio crea migraciones en paralelo, el orden por fecha debe revisarse al unir | 1–4 | Medio: se documenta en el paquete de entrega |

**No se tocan**: `financial-ratios.generator.ts` ni ningún otro generador, `reports.*`,
`exports.*`, `attachments.*`, `common/audit.ts`, `auth/*`, `users/*`, `masters/partners/*`,
servicios contables, la pantalla de Usuarios, `shared/ui/*` (salvo el barrido opcional de
textos), `styles.css`, `index.html` y la CSP (`frontend/deploy/security-headers.conf`).

---

## 12. Decisiones abiertas para Carlos (en lenguaje sencillo)

| # | Pregunta | Recomendación | Qué pasa si se elige lo otro |
|---|---|---|---|
| D1 | ¿Creamos un tipo de usuario nuevo **"Auditor"** o la auditora usa "Solo lectura"? | **Auditor**. | Con "Solo lectura", cualquier empleado de solo lectura podría escribir hallazgos o borrar el trabajo de la auditora. |
| D2 | Hoy cada usuario pertenece a una sola empresa y el correo no se puede repetir. Una auditora que revisa 3 empresas necesitaría **3 correos** (p. ej. `ana+empresa1@...`). ¿Te sirve por ahora? | Sí por ahora. Un usuario en varias empresas es un cambio grande del inicio de sesión (era tema del plan de plataforma). | Hacerlo ya suma ≈2 semanas y toca el login del socio. |
| D3 | ¿Qué ve el **administrador de la empresa auditada**? | Los encargos, los hallazgos **ya comunicados**, para responderlos, y el informe. **No** los papeles de trabajo, tildes ni borradores (son el trabajo interno de la auditora, como en la vida real). | Si ve todo: más transparencia, pero la auditora pierde independencia. |
| D4 | ¿Quién responde los hallazgos por la empresa? | Solo el **Administrador** en esta versión. | Permitirlo al Contador es fácil (una línea), pero el contador suele ser el auditado. |
| D5 | Los **límites del semáforo** por defecto (tabla 6.2) son reglas generales. | Que las dos contadoras los revisen en media hora antes de la Fase 1B; cada empresa puede cambiarlos después. | Si no se revisan, puede salir rojo algo que en ese sector es normal (p. ej. margen bruto en comercio). |
| D6 | Dos extras pequeños para el auditor: **O1** ver el historial de un documento (quién lo creó, aprobó o anuló) y **O2** avisar si algo cambió después de que la auditora lo marcó como revisado. | **Ambos** (≈1,5 días en total). O2 es casi imprescindible. | Sin O2, una tilde puede dar por bueno algo que se anuló después. |
| D7 | ¿Qué va primero? | **1A** (usabilidad, Ayuda y base guiada) → **G1** (configuración y flujos guiados) → **1B** (semáforo) → **G2** → auditoría → razones adicionales. Pone primero tu principio de "usable sin capacitación". | Si las contadoras prefieren ver el semáforo antes, se cambian G1 y 1B de lugar sin costo extra. Auditoría primero retrasa todo lo demás ≈4 semanas. |
| D8 | ¿El informe final debe ser un **dictamen formal** de auditoría (la opinión firmada del auditor)? | **No**. El sistema genera un informe de revisión con hallazgos; el dictamen lo redacta y firma la auditora bajo su responsabilidad profesional. | Hacerlo dictamen exige asesoría profesional y textos legales; fuera de esta versión. |
| D9 | **Tu socio**: la Fase 1A ya modifica pantallas suyas (clientes/proveedores, factura, pagos, menú) y la Fase 2 agrega un tipo de usuario. | Avisarle **antes de empezar**, mostrarle la lista de la sección 11 (sobre todo la fila 13, `partners.ts`) y acordar cómo se le entrega (archivo comprimido o rama en GitHub). | Si él cambia esas mismas pantallas a la vez, habrá que unir a mano; no es grave pero conviene saberlo. |
| D10 | Cambiar "tercero" por "cliente / proveedor": ¿solo en las pantallas de facturas, pagos y clientes (las que se tocan igual), o en **todo** el sistema? | Empezar por esas pantallas (Fase 1A) y hacer el resto **acordándolo con tu socio**, porque son 13 archivos más suyos (solo textos, ≈medio día). | Todo de una vez: más parejo para las contadoras, más posibilidades de choque al unir. |
| D11 | Para mostrar el manual se propone una **pieza pequeña de software libre** (`marked`, gratuita, sin conexión a internet, muy usada). | Aprobarla. | Sin ella: o el manual se escribe en un formato más técnico (HTML), o los programadores hacen su propio convertidor (+1,5 días). |
| D13 | ¿Quién adapta las **pantallas existentes de tu socio** a la experiencia guiada (tablas vacías útiles, ayudas, errores con enlace)? Son ≈18 archivos suyos con cambios pequeños. | **Nosotros, en la Fase G2, en un momento acordado con él** (≈1,5 semanas). | Si lo hace él con nuestros componentes y una guía: ahorras ≈1,5 semanas de nuestro lado, pero depende de su tiempo y el resultado puede quedar disparejo. |
| D14 | El asistente ofrece **cargar un plan de cuentas base de RD** con impuestos. Su contenido debe ser correcto. | Que las **dos contadoras lo revisen y aprueben** antes de programarlo (1–2 horas de su tiempo). | Sin su visto bueno no se carga nada base: cada empresa arma su catálogo a mano, que es justo lo que asusta a un usuario nuevo. |
| D15 | ¿Agregamos un **buscador de acciones** ("crear factura", "buscar cliente") en la barra superior? | Sí, pero **después** de lo esencial (opcional en G2, ≈2,5 días). | Sin él, todo se encuentra igual por el menú, que ya queda ordenado por tareas. |
| D16 | La prueba de "usuario sin capacitación" funciona mejor con **una persona real que nunca haya usado el sistema**. | Tú o alguien de tu equipo, 15–20 minutos por flujo al final de cada fase. | Solo con la revisión de qa se detectan menos problemas reales. |
| D12 | "Ir a clientes y proveedores" desde la factura: ¿abrir en **otra pestaña** o avisar "vas a perder lo escrito"? | Otra pestaña (no se pierde nada). | Con aviso: si la contadora acepta, pierde la factura a medias. |

---

## 13. Estimación de esfuerzo

Supuestos: equipo de agentes continuo; Carlos y las contadoras revisan cada entrega en 1–2 días;
**no incluye** esperas por respuestas del socio ni por comentarios de las contadoras.

| Fase | Trabajo (días) | Calendario |
|---|---|---|
| 0 Preparación | 1–2 | ≈0,5 semana |
| 1A Usabilidad (C), Ayuda (D) y base guiada (E) | frontend 8, backend 0,5, devops 0,5, qa 2, seguridad 0,5, doc 3 (en paralelo desde la Fase 0) | **≈1,5 semanas** |
| G1 Configuración inicial y flujos guiados | backend 5, frontend 5, qa 2, seguridad 0,5, doc 2 | **≈2 semanas** |
| 1B Semáforo, comparación, Panel + resto del manual | backend 5, frontend 4, qa 1,5, seguridad 0,5, doc 2,5 | **≈1,5 semanas** |
| G2 Pantallas existentes guiadas (+ paleta opcional 2,5 d) | frontend 5, qa 1,5, doc 2, revisor 0,5 | **≈1,5 semanas** |
| 2 Rol auditor, encargos, papeles, hallazgos | backend 6, frontend 5, qa 2, seguridad 1, doc 0,5 | **≈2 semanas** |
| 3 Tildes, archivos, informe (+O1/O2) | backend 6, frontend 3, qa 2, seguridad 0,5, doc 0,5 | **≈2 semanas** |
| 4 EBITDA, DuPont, equilibrio, vertical/horizontal | backend 5, frontend 4, qa 2, seguridad 0,5, doc 0,5 | **≈1,5–2 semanas** |
| 5 Entrega al socio | 3–4 | ≈0,5–1 semana |
| **Total** | | **≈13 a 15 semanas** (incluye ≈1 semana de margen para correcciones tras cada prueba) |

Backend y frontend avanzan en paralelo dentro de cada fase; las fases van en serie para que las
contadoras prueben cada una. Variantes: si la Fase G2 la hace el socio (D13), ≈11,5–13,5 semanas;
si además la Fase 4 (razones adicionales) se deja para después, ≈10–11,5. La experiencia guiada
(1A ampliada + G1 + G2) suma ≈4,5 semanas a la propuesta original: es el costo del principio
rector, y es la parte que más reduce el soporte y la capacitación futura. El barrido completo
de "tercero" (D10) suma ≈medio día; el convertidor propio en vez de `marked` (D11), ≈1,5 días.

---

## 14. Riesgos y avisos de deuda técnica

### 14.1 Aviso de deuda (para decidir con los ojos abiertos)
1. **El plan v3.1 y la realidad se separaron.** `PLAN.md` describe pantallas en Next.js dentro de
   plataforma, login centralizado y permisos `fin.*`. Lo que existe y se está probando es Angular
   con login propio y 4 roles fijos. La v0.2 sigue la realidad (lo correcto para entregarla al
   socio), pero **cada pantalla y cada rol nuevo hace más cara una futura migración a
   plataforma**. No bloquea la v0.2; sí conviene que Carlos y su socio decidan pronto si el plan
   de plataforma sigue en pie. Costo de no decidirlo: seguir construyendo dos caminos.
2. **Roles fijos.** AUDITOR es el quinto rol fijo. Si después aparecen más perfiles ("auditor
   interno", "gerente que solo responde"...), lo sano es pasar a permisos por acción (como
   proponía v3.1), no seguir sumando roles. Con 5 todavía es simple y auditable.
3. **Duplicado menor**: `audit-files.ts` y el servicio de archivos del auditor se parecen a los
   de adjuntos. Se aceptan para no tocar código del socio; unificarlos más adelante cuesta ≈1 día.

### 14.2 Riesgos
| Riesgo | Impacto | Mitigación |
|---|---|---|
| El auditor termina pudiendo modificar contabilidad (por una ruta nueva del socio sin `@Roles` o con todos los roles) | Grave | Prueba automática: AUDITOR recibe 403 en **toda** escritura fuera de `/auditing`, recorriendo las rutas reales; la prueba existente ya exige `@Roles` en toda escritura; regla del plan: nunca `Object.values(UserRole)` |
| Datos de auditoría de una empresa visibles para otra | Grave | `companyId` del token, llaves compuestas en la base, 404 en documentos ajenos, pruebas por cada ruta |
| Tilde que da por bueno algo que cambió después | Alto (falsa seguridad) | Opcional O2 (recomendado) |
| Personal de la empresa ve los borradores de la auditora | Medio | ADMIN solo ve hallazgos comunicados (D3); los demás roles, nada |
| Archivo malicioso subido como soporte | Medio | Mismas validaciones de tipo que adjuntos, tope de tamaño `MAX_UPLOAD_MB`, clave generada por el servidor, descarga con `nosniff` |
| Semáforo engañoso por cuentas sin clasificar o por umbrales que no aplican al sector | Medio | Aviso visible con enlace a Clasificación de cuentas; límites por empresa; contadoras validan los por defecto; razones dependientes del sector sin semáforo por defecto |
| Rentabilidad de un mes comparada con límites anuales | Medio | Anualización explícita y rotulada (6.2) |
| Punto de equilibrio con costos mal separados | Medio | Valores por defecto razonables + ajuste por cuenta + aviso de gastos sin categoría; la guía lo explica |
| Tendencia lenta con muchos datos | Bajo-medio | Límite de 24 puntos, 4 cálculos a la vez, medición en Fase 1B, plan B en 7.3 |
| Choques al unir con el socio | Medio | Módulos nuevos; archivos existentes con cambios mínimos y documentados (sección 11); aviso antes de empezar; paquete de entrega (5.3) |
| Migraciones en paralelo con las del socio | Medio | Solo migraciones aditivas; revisión del orden al unir; prueba final aplicando todas desde una base vacía (5.1) |
| Informe PDF con símbolos que salen como "?" | Bajo | Textos sin símbolos fuera del alfabeto latino; qa abre el PDF |
| Un informe se confunde con un dictamen legal | Medio (reputación) | Título "Informe de revisión"; "BORRADOR" mientras no esté cerrado; decisión D8 |
| Despliegue en pruebas rompe lo que usan las contadoras | Medio | Copia de la base antes de cada despliegue; suite completa en verde antes; migraciones aditivas |
| Al extraer el formulario de clientes/proveedores cambia sin querer la pantalla `/partners` | Medio | Copia literal de campos y validaciones; lista de comprobación de qa "se comporta igual que antes"; revisor-critico compara antes/después |
| Se pierde una factura a medio llenar al crear un cliente | Alto para la usuaria | El diálogo vive en la misma pantalla (sin navegar); "Ir a..." abre otra pestaña; prueba manual explícita |
| Choque con el socio en `partners.ts` (su pantalla "de referencia") | Medio | Avisarle antes (D9); cambio concentrado y documentado; si él la está cambiando, hacer 1A.1 justo después de unir sus cambios |
| Manual desactualizado respecto de las pantallas | Medio | El documentador actualiza la sección **en la misma fase** que cambia la pantalla; qa revisa los "?"; capturas repetibles con Playwright |
| Capturas o archivos del manual viejos por la caché del navegador | Bajo | Bloque `/manual/` sin caché larga en nginx; capturas con fecha en el nombre |
| Contenido del manual usado para inyectar código | Bajo | Archivos propios del mismo servidor; limpiador de Angular en `[innerHTML]`; CSP sin scripts en línea; guía de estilo prohíbe HTML incrustado |
| Datos reales en capturas | Medio (privacidad) | Capturas solo del ambiente de pruebas con datos ficticios; regla en la guía de estilo |
| Plan de cuentas base con errores contables o fiscales | Alto (todas las empresas nuevas lo heredan) | Validación escrita de las contadoras (D14); solo se carga en empresas sin cuentas; todo editable después |
| La experiencia guiada se vuelve un rediseño sin fin | Alto (calendario) | Criterios cerrados E1–E6; componentes pequeños del kit; lista de pantallas cerrada en 6E.1; nuevas ideas pasan a la siguiente versión con decisión de Carlos |
| Muchos archivos del socio tocados en G2 | Medio | Fase propia, acordada con él (D13); cambios de 1–6 líneas; lista exacta en la sección 11 |
| "Siguiente paso" o ayudas que se desactualizan | Bajo-medio | Textos en archivos que mantiene el documentador; qa los revisa en cada fase |
| Traductor de errores que no reconoce un mensaje | Bajo | Si no lo reconoce, muestra el original; qa provoca los errores típicos y amplía el diccionario |

---

## 15. Lo que NO incluye la v0.2

Visor general de la bitácora, revisión automática de errores, historial de accesos, dictamen
formal, pruebas automáticas de pantallas, buscador por texto completo dentro del manual, videos,
recorridos animados ("tours"), rediseño visual de pantallas existentes, un usuario en varias empresas, roles a medida, fotos de razones guardadas, plantillas de
informe editables, firma electrónica del informe, y cambios en las 20 razones existentes.

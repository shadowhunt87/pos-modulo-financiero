# Integración del Taller con el Módulo Financiero

> **Versión 1.1 (borrador)** · 2026-10-13 · Autor: Arquitecto
> **Estado:** la v1.0 fue **aprobada con cambios** por el revisor-crítico (el camino A se mantiene; B y C bien
> descartados). Esta v1.1 aplica esos cambios, cada uno verificado en el código. Falta la aprobación de Carlos; nada se
> programa antes.
> **Documentos que mandan:** `CLAUDE.md`, `docs/GUIA-PRODUCTO.md` (P1–P14), `docs/GUIA-CONTABLE-FISCAL.md` (R1–R12),
> `docs/PLAN-v0.3.md` (§4 reverso, §5 vigencias, §7 e-CF), `docs/PAQUETES-DE-TRABAJO.md` (§3.1 reparto) y
> `docs/ANEXO-S0-2FA-EXPORTACION.md` (D41).
> **Relación con `docs/CONTRATO-VERTICALES.md` v1.2:** ese contrato supone una vertical escrita **dentro** de este
> repositorio. El taller real es otra aplicación. La sección 3 dice qué partes siguen valiendo.
> **Código verificado:** núcleo en la rama `wp/N1-reverso` (commit `0f0b723`; N1 incluido, sin fusionar). Taller en **dos
> versiones** (leídas, **no ejecutadas**; es código de tercero): «main» en `taller-vertical/backend/taller-backend-main` y
> `frontend/taller-frontend-main`, y «qa» en `taller-vertical/qa/backend/taller-backend` y `qa/frontend/taller-frontend`.
> **Tres ambientes que nunca se mezclan:** (1) Finanzas solo (`financiero-pruebas`); (2) Taller solo (`taller-pruebas`);
> (3) **Integrado** (`integrado-pruebas`, sección 5). Este documento no cambia nada de los ambientes 1 y 2.

## Qué cambió (v1.0 → v1.1)

| # | Cambio | Dónde |
|---|---|---|
| A1 | Se reconoce la versión «qa» del taller (ya trae secretos obligatorios, límite de intentos en el login, helmet, roles en clientes y vehículos, vista pública mínima de la cotización, semilla con clave aleatoria, puertos en 127.0.0.1) y lo que le falta (cobros, cuentas por cobrar, acta en PDF, migraciones, fotos en disco). Paquete nuevo **T0b** (base = main + arreglos de qa, con su migración) y decisión **D-T7**. **T5a** se reduce a lo que qa no cubre | 1.1, 4.10, 6, 9 |
| A2 | Modo integrado que **falla de forma segura**: `BILLING_BACKEND` es del proceso; empresa sin enlace ⇒ no factura; las secuencias y la emisión local quedan **cerradas en la API**. Ventas de mostrador sin orden (D-T10) y paso de una empresa de local a integrado | 4.3, 4.10, 9 |
| A3 | Idempotencia rehecha: **llave natural** (origen en la factura con índice único parcial) en lugar de tabla con caducidad; `externalRef` único en el cobro; el reintento manda **el mismo cuerpo guardado**; la orden queda congelada; dos pedidos simultáneos. Se elimina el camino provisional «no reintentar» y la búsqueda «por las notas» (no existe). F1/F2 se construyen **antes o en paralelo** a T2a | 4.4, 4.11, 6 |
| A4 | Alcance real de la cuenta ACCOUNTANT (41 rutas de escritura y lectura de todo); el adaptador solo lee lo que está en su enlace; cuentas por cobrar filtradas; Consulta no gana acceso a cuentas por cobrar; ACCOUNTANT **sí** puede emitir notas de crédito | 4.6, 4.7, 4.9 |
| A5 | La retención del 30 % solo sobre servicios es un **defecto del PLAN-v0.3** (§5.6 + A7), no del taller: se propone cambio con **D-T11** y dependencia de N2c; T2c no prueba retenciones (o manda la base explícita). Pregunta nueva: ITBIS en B14 | 4.2, 6, 8, 9 |
| M1 | Memoria recalculada (topes 2,43 GB + migración); construir de una en una o en la PC | 5.3, 5.9 |
| M2 | `container_name` con prefijo `integrado-`; prohibido reutilizar `docker-compose.prod.yml` y el `docker-compose.yml` del socio; clave propia en Nginx Proxy Manager; NPM es el **único punto compartido** | 5.1, 5.3, 5.6 |
| M3 | Sin rama larga: T3a entra a la rama principal por el flujo normal; el ambiente 3 se construye desde la principal o una etiqueta | 5.2, 6 |
| M4 | Reglas para RNC corregido después de enlazar, RNC que en Finanzas es solo proveedor, búsqueda parcial (`contains`) y RNC único por empresa; `Company.rnc` del taller es opcional | 4.2 |
| M5 | La cotización guarda totales pero no líneas: se congela (paquete **T2d**) | 4.12, 6 |
| M6 | Tiempo **neto** (no «libera 3–4 semanas»); T0 con fecha; V1b sin depender de T3a; relación con D41 (2FA) | 3, 6, 9 |
| M7 | Factura impresa: decisión **D-T9** | 7.3, 9 |
| M8 | Reintentos con la bandeja en la base y un revisor periódico: es una cola sencilla, y se dice | 4.4 |
| M9 | Evaluada y descartada «Finanzas importa la orden del taller» | 2.1 |
| H | Hechos renumerados H1–H27; corregidos: cobro que supera el saldo (422, no anticipo), importes como número JSON, Swagger sin montar, límite de crédito, factura sin cliente solo con líneas libres, `BILLING_BACKEND` por proceso, memoria, NPM, versión qa, búsqueda parcial, `rnc` opcional, notas no buscables | 1, 4 |
| O | Bloquear E31/E32 en pantalla no es control (se cierra en la API del taller); B02 ≥ RD$250.000 a «Consumidor final»; el aviso del contrato §3.6 en Finanzas pasa a ser un paquete (**T3d**); la cotización pública queda tras la clave de NPM en el ambiente 3; el rol del token del taller tarda hasta 8 h en cambiar | 4.5, 4.13, 5.6, 6, 8 |
| D | Decisiones nuevas **D-T7 a D-T11**; mejoradas D-T5 (tiempo neto) y D-T6 (qué puede hacer hoy esa cuenta) | 9 |
| P | Coherencia con PAQUETES (§3.1, §7, §8), tablero y CONTRATO §6.2; qué pasa con las preguntas P2–P5 del contrato | 3, 6.3 |

**En una frase:** el taller sigue siendo dueño del trabajo del taller (clientes, vehículos, recepción, órdenes,
cotizaciones) y le **pide al núcleo** que emita las facturas y registre los cobros; el núcleo es el único que numera
comprobantes, calcula impuestos y contabiliza. Así hay **una sola numeración** y el 606/607 cuadra.

---

## 1. Punto de partida (verificado en el código el 2026-10-13)

### 1.1 Taller (aplicación del socio)

| # | Hecho | Dónde |
|---|---|---|
| H1 | Aplicación autónoma: NestJS 10, Prisma 5, PostgreSQL 16, Vue 3 + Tailwind 4 + Pinia. Base de datos propia | `package.json`, `docker-compose.yml` |
| H2 | Tablas propias `Company` (`rnc` **opcional** y único), `User`, `Client`, `Vehicle`, `WorkOrder`, `WorkOrderLine`, `Quote`, `Reception`, `NcfSequence`, `Invoice`, `InvoiceLine`, `Payment`. `Company`, `User`, `Invoice`, `NcfSequence` y `Payment` **se llaman igual** que en el núcleo | `prisma/schema.prisma` |
| H3 | Factura con NCF B01, B02, B14, B15 y e-NCF E31, E32, E34, numerada con **su propia** `NcfSequence` (empieza siempre en 1) | main `src/billing/billing.service.ts` `issue`; `fiscal.ts` |
| H4 | e-CF **simulado**: con `ECF_PROVIDER=mock` acepta todo sin enviar nada a la DGII. El ambiente 2 corre con `mock` | `src/ecf/mock-ecf.provider.ts`; `deploy/compose.pruebas.yml` |
| H5 | **Sin anulaciones ni notas de crédito** (E34 existe como tipo pero no se enlaza ni descuenta) | `docs/CARACTERISTICAS.md` §8.6 |
| H6 | ITBIS **18 % escrito en el código** y como valor por defecto en la base; dinero calculado con `number`; ITBIS redondeado **sobre el total gravado**, no por línea | `src/work-orders/totals.ts`; `fiscal.ts` |
| H7 | Retenciones como porcentaje libre por factura (0 a 1) | `src/billing/dto.ts` |
| H8 | Cobros contra una factura del taller (CASH, CARD, TRANSFER, CHECK, OTHER); cuentas por cobrar por antigüedad desde la emisión; `GET /receivables` solo para ADMIN y CAJERO | main `src/receivables/*` |
| H9 | **No postea asientos** ni tiene catálogo de cuentas | — |
| H10 | La factura sin cliente («Consumidor final») solo existe en la factura de **líneas libres** (sin orden); la que sale de una orden siempre lleva el cliente de la orden | `billing.service.ts` `resolveSource` |
| H11 | Patrón de «proveedor enchufable» elegido por variable de entorno (`ECF_PROVIDER`), **constante para todo el proceso** | `src/ecf/ecf.module.ts` |
| H12 | Cotización: guarda subtotal, ITBIS y total, pero **no sus líneas**; la vista pública muestra las líneas **actuales** de la orden | `Quote` en `schema.prisma`; `quotes.service.ts` |
| H13 | **Dos versiones del taller.** «main»: sin límite de intentos en la API (el ambiente 2 lo pone en nginx), `JWT_SECRET` de ejemplo, clientes y vehículos con solo sesión, cotización pública que devuelve la orden completa (ids, `companyId`, VIN). «qa»: `loadEnv` rechaza secretos de ejemplo y exige `JWT_SECRET` ≥ 32; `@Throttle` 5/min en el login y `ThrottlerGuard` global 300/min; helmet; `@Roles` en clientes y vehículos; `toPublicView` con prueba; semilla con clave aleatoria; compose en 127.0.0.1; `StatusHistory.userId` opcional y la aprobación de la cotización mueve la orden a «En reparación». **Pero qa no tiene** `Payment` ni `receivables`, ni `reception/acta.ts`, ni `prisma/migrations`, y guarda fotos **solo en S3** (exige `S3_ACCESS_KEY`/`S3_SECRET_KEY`; la imagen de MinIO ya no se descarga). **En las dos**, el guard JWT no consulta la base: un usuario desactivado o con el rol cambiado sigue con su token hasta 8 h | main y qa: `src/config/env.ts`, `src/app.module.ts`, `src/auth/*`, `src/common/guards/jwt-auth.guard.ts`, `src/quotes/quotes.service.ts`, `prisma/` |

Frontend (las dos versiones): sesión en `localStorage` (`taller.token`), API en `/api`, rutas desde la raíz
(`src/api/client.ts`, `src/router/index.ts`).

### 1.2 Núcleo

| # | Hecho | Dónde |
|---|---|---|
| H14 | NestJS (`package.json`: `^12.0.1`, no 11), Prisma 7, PostgreSQL 18, Angular con kit propio **sin Tailwind** | `package.json`, PLAN-v0.3 §1 |
| H15 | `POST /invoices` con `issueNow: true` crea **y emite** en una transacción: calcula impuestos, revisa el **límite de crédito** del cliente (422), consume el NCF sin huecos, numera, arma el asiento y escribe la bitácora. Si algo falla, **no queda nada** | `invoicing.service.ts` `create`, `issueTx` (límite de crédito 335–344) |
| H16 | El NCF de venta sale de `ncfType` o de `Partner.defaultNcfType`; B01/E31 exigen RNC o cédula | `issueTx` 311–321 |
| H17 | Catálogo de comprobantes con B14, B15, E31, E32, E34, B04… | `src/masters/ncf/ncf.service.ts` |
| H18 | Retenciones por `TaxRate`; base por defecto: ITBIS de **toda** la factura (retención de ITBIS) o subtotal (ISR); hoy se acepta una base enviada | `build()` 166–175 |
| H19 | Nota de crédito: `POST /invoices` con `CREDIT_NOTE` + `relatedInvoiceId`, roles **ADMIN y ACCOUNTANT** | `invoicing.controller.ts`; `issueTx` 312–316 |
| H20 | Anular factura (ADMIN, APPROVER): con N1, una E o de mes cerrado da 422 «nota de crédito»; con pagos aplicados, 422 | `invoicing.service.ts` `void` |
| H21 | Cobro: exige banco **o** caja; si lo aplicado a una factura **supera su saldo, 422**; si el monto supera lo aplicado, el sobrante queda como **anticipo** | `payments.service.ts` 76, 162–164 |
| H22 | `GET /partners?q=` busca por **coincidencia parcial** (`contains`) en nombre, nombre comercial y RNC; el RNC es **único por empresa** (409 al repetir) | `partners.service.ts` 36–44, 65–70 |
| H23 | Importes en los DTO como **número JSON** (`@IsNumber`, hasta 4 decimales), no como texto | `invoice.dto.ts`, `payment.dto.ts` |
| H24 | `GET /invoices?q=` busca **solo** en número y NCF (no en notas) | `invoicing.service.ts` `list` |
| H25 | El usuario pertenece a **una** empresa; token con `companyId`; límite de intentos en el login. ACCOUNTANT figura en **41** `@Roles` de escritura (impuestos, catálogo, saldos iniciales, transferencias, importar banco, compras, notas de crédito, `PATCH /partners`…) y, como todos, lee todo (incluido `/exports/dgii/:form`) | `src/auth/*`; `grep @Roles` en controladores |
| H26 | **No existen**: llave de servicio, origen en la factura (V1a), referencia externa en el cobro, endpoint de versión, PDF de factura. `@nestjs/swagger` está instalado pero **no montado** (no hay `SwaggerModule`) | búsqueda en `src/` |
| H27 | Hoy se puede emitir una venta E sin proveedor (hueco que cierra N3 con un 422). Las dos interfaces esperan su API en `/api` del **mismo** dominio | PLAN-v0.3 §7.1; los dos `nginx.conf` |

---

## 2. Decisión 1: quién es dueño de qué

### 2.1 Los caminos

| Criterio | **A. El taller pide facturas y cobros al núcleo por API** | B. Reescribir el taller como módulo del núcleo | C. El taller factura y solo manda asientos |
|---|---|---|---|
| Numeración de comprobantes | **Una sola** (núcleo) | Una sola | **Dos** |
| 606/607/608 | Completos desde el núcleo | Igual | **Incompletos** (el 607 sale de `Invoice`) |
| Cuentas por cobrar | Cuadran con el mayor | Igual | Mayor y cartera no coinciden |
| R9, R7 | Los resuelve el núcleo | Igual | 18 % fijo y coma flotante |
| Correcciones (R2) | Las tiene el núcleo | Igual | Habría que construirlas dos veces |
| e-CF real | Un conector (N7) | Igual | Dos |
| Trabajo del socio | Casi todo se conserva | Se rehace (Angular, NestJS 12, Prisma 7) | Todo |
| Costo | ≈3 semanas al primer recorrido; ≈7–8 a robusto y seguro | ≈8–12 semanas + divergencia con el socio | Bajo al inicio, alto para siempre |

**Descartadas también:**
- **A-bis (el taller numera y el núcleo importa la factura ya numerada):** son dos numeraciones; el núcleo no podría
  bloquear el fin de las B ni el e-CF sin proveedor.
- **A-pull (M9: Finanzas «importa» las órdenes listas del taller):** su ventaja real es que el código de terceros no
  guardaría ninguna llave con permiso de **escritura** en Finanzas (Finanzas tendría una llave de **lectura** del
  taller). Se descarta porque: (1) la cajera necesita el NCF **en el mostrador**, al momento; si Finanzas importa por
  temporizador hay espera, y si lo hace a pedido, la cajera tendría que entrar a Finanzas; (2) el núcleo tendría que
  conocer el modelo del taller (un módulo del taller dentro del núcleo, contra «núcleo mínimo» y la línea del socio);
  (3) el taller igual necesita leer el estado de la factura. Lo que se toma de ella: la llave del taller en Finanzas
  tendrá el **alcance mínimo** (T5b) y, si seguridad juzga inaceptable una llave de escritura en código de terceros,
  A-pull es el plan de respaldo.

### 2.2 Recomendación: **camino A**

El taller del socio es bueno en lo operativo y flojo en lo fiscal; el núcleo es lo contrario. A junta lo mejor de cada
uno y deja **una sola verdad fiscal**. **Costo de no hacerlo:** con C, cuadres manuales de dos 607 cada mes; con B,
semanas de trabajo tiradas y el repositorio del socio por otro lado.

### 2.3 Quién es dueño de cada dato

| Dato | Dueño | El otro sistema… |
|---|---|---|
| Contacto del cliente, vehículos, recepciones, fotos, firmas, actas | **Taller** | No lo guarda |
| Datos fiscales del cliente (nombre fiscal, RNC, tipo de comprobante, plazo, límite de crédito) | **Núcleo** | El taller guarda el enlace; lo crea la primera vez que factura |
| Órdenes, etapas, líneas, cotizaciones y su aprobación | **Taller** | El núcleo guarda el origen (`taller.orden`) |
| Factura, NCF/e-NCF, notas, anulación | **Núcleo** | El taller guarda el enlace y **lee** el estado |
| Tasas de impuestos y retenciones | **Núcleo** | El taller las consulta |
| Cobros, saldos, cuentas por cobrar | **Núcleo** | El taller los registra por API y lee |
| Asientos, mayor, 606/607/608, bancos, caja, cierre | **Núcleo** | Nada |
| Usuarios y roles | Cada uno los suyos (4.8) | — |
| Empresa | Las dos, enlazadas por RNC | Una empresa del taller **sin RNC no se puede integrar** |

**Regla de oro:** en modo integrado el taller **nunca** consume NCF ni calcula el impuesto que vale, y eso lo impide
**su API**, no solo su pantalla (4.10).

---

## 3. El contrato de verticales v1.2 frente al taller real

El contrato eligió «dentro de los dos repositorios» y descartó «servicio aparte por HTTP» por no tener transacción común.
El taller **es** un servicio aparte.

| Parte del contrato | ¿Vale? | Cómo se traduce |
|---|---|---|
| §3.3 Toda venta con comprobante es una `Invoice` del núcleo con su origen; **el estado se lee, no se copia** | **Sí, es el centro** | `POST /invoices` con origen; lectura por origen (4.6) |
| §4.3.3 / §4.3.4 La vertical no calcula impuestos ni consume NCF | **Sí** | Cerrado en la API del taller en modo integrado |
| §4.1.5, R2 | **Sí** | Corrige el núcleo |
| §3.6 «Facturas» avisa, no bloquea, con «Ver documento» | **Sí** | Aviso y enlace en el detalle de factura de Finanzas: paquete **T3d** (antes la v1.0 decía «Finanzas no cambia de pantallas»; era una contradicción) |
| §4.5.2 Roles por defecto | **Sí** | Aplicados a la cuenta de servicio y a su alcance (T5b) |
| §4.8 Prohibiciones | **Sí** | Por HTTP no se escriben tablas; períodos los cuida el núcleo; datos reales tras S1–S3 |
| §4.6.2-8 Secretos en columnas `…Enc` | **Sí** | Credencial cifrada en el taller |
| §11 Fuera de alcance | **Sí** | Igual |
| P1 Propiedad y licencia | **Sí, urgente** | Bloquea T0b y T2a (D-T4) |
| §3.1, §3.2, §4.1 (`post` en la transacción, `createInTx`, `nextFor`), §4.7 (manifiesto), §4.5.3–4.5.6, §4.6 (tablas con prefijo, registro de S2), §3.5/V4 | **No** | Base propia del taller; transacciones separadas compensadas con la llave natural (4.4); versión por API (F3); la «activación» es el enlace por empresa |
| V1a a1 + a5 (`Invoice.sourceModule/sourceId`, `findBySource`) | **Sí, recortado** | Expuesto por HTTP en **T3a** |
| V1b b1/b3 | Higiene | Sin prisa y **sin depender de T3a** |
| V2, V3 | **No para el taller** | V3 se reemplaza por pruebas por HTTP (T3c) |

**Preguntas P2–P5 del contrato (quedaban huérfanas):**
| Pregunta | Qué pasa |
|---|---|
| P2 ¿Dónde se guarda el código? | Para el taller: **en su propio repositorio**; los cambios de integración van en una rama que se le entrega |
| P3 ¿Quién aprueba los cambios? | Los del núcleo (T3a, T3d, T5b): Carlos, con aviso al socio (archivos calientes). Los del taller: los une el socio; Carlos aprueba que se entreguen |
| P4 ¿Quién enciende la vertical para una empresa? | Crear el **enlace de empresa** (que la deja facturar contra Finanzas) lo hace solo el equipo técnico con autorización de Carlos, nunca el ADMIN del taller |
| P5 ¿Nicho y nombre corto? | Respondida: `taller`; origen `taller.orden` |
Las demás (P1, P6–P10) siguen como en el contrato; P9 y P10 no aplican al taller.

**Recomendación (D-T5):** conservar el contrato para futuras verticales internas, con una nota que remita aquí, y
**pausar** V2, V3, V4 y la parte interna de V1a. **Tiempo neto (M6):** la pausa saca de la cola de Claude-PC ≈4,5 días
de trabajo (V4, V2, V3); los paquetes T le **suman** ≈10–11 días. Resultado: la cola de Claude-PC **crece ≈5–6 días
netos**, no se libera. Claude-servidor suma ≈8 días (sección 6).

---

## 4. Diseño técnico del camino A

### 4.1 El recorrido en palabras

1. Recepción crea la orden y, si hace falta, la cotización (que queda **congelada** al aprobarse, 4.12).
2. La cajera pulsa **«Facturar»**. El taller: comprueba que su empresa tiene enlace; busca o crea el cliente fiscal en el
   núcleo; guarda en su bandeja el pedido exacto; lo envía con el origen `taller.orden` + la orden.
3. El núcleo, en una transacción, calcula, revisa el límite de crédito, consume el NCF, numera y contabiliza.
4. El taller guarda el enlace y muestra número, NCF, total y saldo **leídos** del núcleo.
5. La cajera registra el cobro en el taller; el taller lo manda con su `externalRef`.
6. La contadora ve todo en Finanzas (con «Viene de la orden OT-123», T3d) y corrige allí si hace falta.

### 4.2 Mapeo de datos

**Empresa.** `Company` del taller ↔ `Company` del núcleo por **RNC**. Enlace por empresa (4.3). Sin enlace, en modo
integrado esa empresa **no factura** (4.10). La empresa sale siempre del token del usuario del taller.

**Cliente → `Partner`.**
| Taller | Núcleo | Regla |
|---|---|---|
| — | `type` | `CUSTOMER` |
| `name`, `phone`, `email` | igual | Solo al crear; después manda el núcleo |
| `document` | `taxId`, `taxIdType` | Solo dígitos (9 = RNC, 11 = cédula). Se busca con `GET /partners?q=` y, como la búsqueda es **parcial** (H22), el taller se queda **solo con la coincidencia exacta** del RNC. Como el RNC es único por empresa (H22), hay como mucho uno: si existe se enlaza, si no se crea |
| RNC que en Finanzas es **solo proveedor** | — | El núcleo respondería 422 «El tercero no es cliente». El taller **no** lo cambia (no le toca): muestra «Este RNC está en Finanzas como proveedor; pide a tu contadora que lo marque como cliente y proveedor» |
| RNC corregido en el taller **después** de enlazar | — | El enlace no cambia. Al facturar, si el RNC del taller difiere del de Finanzas, avisa «En Finanzas este cliente tiene el RNC X; corrígelo allí si está mal» y factura con el de Finanzas. Los datos fiscales los corrige la contadora en Finanzas |
| Sin cliente | «Consumidor final» de la empresa | Solo en ventas de mostrador (D-T10) y solo B02/E32. **A partir de RD$250.000** el consumo exige identificar al comprador (C-2): el taller lo bloquea y pide el cliente |
| `buyerRnc` distinto del cliente | Otro `Partner` | Se busca o crea por ese RNC |

**Orden y vehículo.** No pasan como datos. La factura lleva origen `taller.orden` + `<id de la orden>:<n>` (4.4) y en
`notes`: «Orden OT-123 · Placa A123456 · registrada desde Taller por Yaneris Peña».

**Línea de orden → línea de factura.**
| Taller | Núcleo | Regla |
|---|---|---|
| `description` | `description` | Igual |
| `quantity`, `unitPrice` | `quantity`, `unitPrice` | Número JSON (H23) convertido desde el Decimal guardado, no desde cálculos en coma flotante (hasta 4 decimales: sin pérdida) |
| `taxRate > 0` | `taxRateId` | ITBIS general del enlace. `taxRate = 0`: sin impuesto |
| `type = PART` / `LABOR` | `accountId` | «Venta de repuestos» / «Servicios de taller» del enlace (los valida la contadora) |
| `amount` | — | No se envía |

**Encabezado.** `type: SALE`; `issueDate`: fecha de **Santo Domingo**; `ncfType`; `dgiiIncomeType` del enlace (por
defecto `01`); `issueNow: true`; `sourceModule: taller.orden`, `sourceId`.

**Tipos de comprobante.**
| Taller | Núcleo | Nota |
|---|---|---|
| B01, B02, B15 | Igual | Secuencia del núcleo |
| B14 | Igual | **Pregunta C-10:** los regímenes especiales normalmente van sin ITBIS; con el mapeo actual la orden mandaría ITBIS. Hasta la respuesta, B14 **cerrado** en la API del taller |
| E31, E32 | Igual | **Cerrados en la API del taller** en modo integrado hasta N3 (no basta esconderlos en pantalla: hoy el núcleo los aceptaría sin proveedor, H27) |
| E34 | No | Nota de crédito: la hace el núcleo |

**Retenciones.** Se eligen de la lista del núcleo (`withholdings: [{ taxRateId }]`), sin porcentajes libres. **Defecto
del PLAN-v0.3 (A5):** la retención del 30 % del ITBIS de una persona jurídica aplica al ITBIS de los **servicios**. El
PLAN-v0.3 §5.6 define `RET_ITBIS_SERVICIOS_PJ` con base «ITBIS de la factura» y su A7 hace que el núcleo **ignore** la
base que manda el cliente: una factura con repuestos y mano de obra retendría de más. Afecta a **cualquier** factura
mixta del núcleo, no solo a las del taller. Se propone a Carlos el cambio **D-T11** (base = ITBIS de las líneas de
servicio, calculada por el núcleo) **antes de N2c**. Mientras tanto: T2c **no prueba retenciones**; si hace falta una,
el taller manda la base explícita (hoy se acepta, H18).

**Cobros → `Payment`.**
| Taller | Núcleo | Regla |
|---|---|---|
| `amount` | `amount` y `allocations[0].amount` | **Iguales y ≤ saldo leído**. Si lo aplicado supera el saldo, el núcleo da 422 (H21); si el monto supera lo aplicado, quedaría anticipo: el taller nunca manda montos distintos |
| CASH | `CASH` + `cashRegisterId` | Caja del enlace |
| CARD | `CARD` + `bankAccountId` | Banco del enlace; el 2 % del procesador no se calcula (C-7) |
| TRANSFER / CHECK | `BANK_TRANSFER` / `CHECK` + `bankAccountId` | Banco del enlace |
| OTHER | — | Cerrado en la API en modo integrado |
| id del cobro del taller | `externalRef` | Llave natural del cobro (4.4) |
| `reference`, `paidAt` | `reference`, `date` | Fecha de Santo Domingo |

### 4.3 Identificadores, tablas de enlace y paso de local a integrado

En la **base del taller** (nombres orientativos):
| Tabla | Qué guarda | Llave única |
|---|---|---|
| Enlace de empresa | empresa del taller, empresa del núcleo, RNC, usuario técnico, credencial cifrada (`…Enc`), y el **mapa** (ITBIS, cuentas de repuestos y servicios, tipo de ingreso 607, «Consumidor final», caja y banco por método, cuenta de ventas de mostrador si D-T10 lo abre) | una por empresa del taller; la del núcleo también única |
| Enlace de cliente | cliente del taller ↔ `partnerId` | (empresa, cliente) |
| Bandeja de envíos | empresa, tipo (FACTURA, COBRO), origen (orden o cobro), `sourceId` o `externalRef`, **el cuerpo exacto enviado**, estado (PENDIENTE, HECHO, RECHAZADO, POR_REVISAR), id devuelto, número y NCF, último error, intentos, fechas, quién lo pidió | (empresa, `sourceId`) y (empresa, `externalRef`); una sola solicitud activa por orden |

En modo integrado `NcfSequence`, `Invoice` y `Payment` del taller **no se usan**: lista, detalle y cuentas por cobrar se
leen del núcleo.

**Paso de una empresa de local a integrado (A2):** regla simple: **una empresa entra al modo integrado sin facturas
propias del taller**. Hoy no existe ninguna con datos reales (el ambiente 2 es demostración) y D-T8 recomienda no vender
el modo local con datos reales. Si algún día una empresa ya facturó en local: paquete aparte de migración, a inicio de
mes: (1) las secuencias del núcleo empiezan **después del último NCF usado** en el taller (`lastUsedNumber` al crear la
secuencia), para no repetir números; (2) los saldos pendientes entran como saldos iniciales en Finanzas por la contadora;
(3) las facturas viejas quedan en el taller solo para consulta y sus cobros se registran en Finanzas.

### 4.4 Idempotencia y reintentos (rehecho, A3)

Riesgo: si la red se corta después de que el núcleo emitió y antes de que el taller lo sepa, un reintento podría emitir
otra factura con otro NCF.

**Diseño: llave natural, sin tabla ni caducidad.**
- **Facturas:** el núcleo guarda el origen (`sourceModule`, `sourceId`) y tiene un **índice único parcial** sobre
  (empresa, origen) **solo para ventas no anuladas**. El `sourceId` es `<id de la orden>:<n>`, donde `n` es el intento
  de facturación de esa orden: sube **solo** cuando la factura anterior dejó de valer (anulada o cubierta por una nota de
  crédito total, que **no** la anula y por eso necesita un número nuevo). Si llega una segunda factura con el mismo
  origen, el núcleo responde **409 con el id de la existente**.
- **Cobros:** `Payment.externalRef` único por empresa; mismo comportamiento.
- **Dos pedidos simultáneos con la misma llave:** el índice deja pasar uno; el otro recibe 409 con el id, y el taller lo
  trata como éxito tras leerlo.
- **El reintento manda el mismo cuerpo guardado** en la bandeja, nunca uno recalculado.
- **La orden queda congelada** (sin agregar ni cambiar líneas) mientras tenga un envío PENDIENTE o una factura que
  vale. Para cambiarla, primero la contadora corrige en Finanzas.

**Estados.**
1. «Facturar» guarda el envío PENDIENTE con su cuerpo (si ya hay uno activo, lo muestra).
2. 2xx o 409 con id: HECHO.
3. 4xx de regla (422, 400, 403, 404): RECHAZADO con el mensaje; nada quedó en el núcleo (H15).
4. Sin respuesta o 5xx: sigue PENDIENTE y se reintenta con el mismo cuerpo.
5. Más de 24 h PENDIENTE: POR_REVISAR, visible para el ADMIN.

**Quién reintenta (M8).** El taller no tiene programador de tareas y un temporizador en memoria se pierde al reiniciar.
Por eso: (a) se reintenta **al abrir** la orden o la bandeja; (b) un **revisor periódico** dentro de la API del taller
cada 5 minutos lee de la base los PENDIENTES y los reintenta. Como el estado vive en la base, un reinicio no pierde nada;
si hubiera dos copias de la API, la llave natural impide duplicar. **Es una cola sencilla sobre la base de datos**, sin
Redis.

Ya **no** hay camino provisional «no reintentar», ni búsqueda «por las notas» (H24: no existe): F2 se construye **antes
o en paralelo** a T2a (sección 6).

### 4.5 Si el núcleo rechaza

| Respuesta | Ejemplo | El taller |
|---|---|---|
| 422 regla | «No hay secuencia configurada para B01», «El crédito fiscal requiere RNC», «período cerrado», «Configura la cuenta contable…», **«Excede el límite de crédito de…»** (H15), «El tercero no es cliente» | RECHAZADO; mensaje tal cual + pista (corregir el dato o «pídele a tu contadora») con enlace a Finanzas |
| 400 | campo inválido | RECHAZADO; error del taller, se registra |
| 401 | sesión de servicio vencida | Vuelve a entrar y repite **una** vez el mismo cuerpo |
| 403 | sin permiso | RECHAZADO; aviso al ADMIN del taller |
| 404 | cliente enlazado ya no existe | RECHAZADO; borra el enlace del cliente y vuelve a buscar |
| 409 con id | ya existe (4.4) | HECHO |
| 409 sin id | otro conflicto | POR_REVISAR |
| 5xx / sin conexión | Finanzas caído | PENDIENTE; el resto del taller sigue funcionando, pero **no se factura** |

### 4.6 Anulaciones y notas de crédito

El taller no las tiene y **no se le construyen**.
- **Quién corrige:** la contadora en Finanzas. Anular: ADMIN o APPROVER. Nota de crédito: ADMIN o **ACCOUNTANT**
  (H19). Por eso la cuenta de servicio, que es ACCOUNTANT, **técnicamente podría** emitir notas de crédito: el
  adaptador del taller no tiene ninguna función que lo haga, y T5b la deja fuera del alcance de la llave.
- **Cómo se entera el taller:** lee el estado por origen (F2): `effective` falso ⇒ la orden vuelve a «por facturar»
  con el aviso «La factura B0100000045 fue anulada en Finanzas el 20/11».
- **En el taller:** botón «Pedir corrección a contabilidad» que abre la factura en Finanzas. No hay «Anular».
- **Cobros mal registrados:** los anula ADMIN o APPROVER en Finanzas.

### 4.7 Autenticación entre sistemas

**Qué puede hacer hoy una cuenta ACCOUNTANT (A4, H25):** 41 rutas de escritura (entre ellas cambiar impuestos, el
catálogo de cuentas y los saldos iniciales, hacer transferencias, importar extractos, registrar compras, emitir notas de
crédito, editar clientes) y **leer todo** (incluidos los TXT del 606/607). Además, con clave, **podría entrar a la
pantalla de Finanzas** como cualquier persona.

| Opción | Cómo | Cuándo |
|---|---|---|
| **S-a. Usuario técnico con clave** | Uno por empresa, ACCOUNTANT, `POST /auth/login`, token de 8 h | **Solo con datos ficticios** (ambiente 3). Aceptado sabiendo lo de arriba |
| **S-b. Llave de servicio con alcance** | Mismo usuario técnico **sin clave** (no entra a la pantalla), llave larga por empresa guardada con hash, revocable, con último uso, limitada a: leer clientes, impuestos, bancos, cajas, facturas y cobros **de su enlace**; crear clientes, facturas de venta (sin notas) y cobros | **Obligatoria antes de datos reales** (T5b) |
| S-c. mTLS | — | Descartada (desproporcionada) |

**Relación con el 2FA (D41 del anexo S0):** si Carlos decide 2FA obligatorio también para ACCOUNTANT, el usuario técnico
con clave **no podría entrar**. Por eso: o T5b va antes que esa regla, o el usuario técnico queda **exento de forma
explícita** y documentada. Recomendación: T5b antes; con S-b el usuario técnico no tiene clave y el 2FA no le aplica.

**Reglas comunes:** el usuario técnico existe porque `Invoice.createdById` y `Payment.createdById` lo exigen. La
credencial va cifrada en la base del taller con una clave que solo está en su variable de entorno. **Aislamiento:** el
taller elige la credencial por la empresa del token de su usuario y el núcleo vuelve a filtrar por la empresa de la
credencial. **Lectura acotada (A4):** el adaptador solo pide al núcleo facturas y cobros **cuyo id está en su enlace**
(o por su origen) y las cuentas por cobrar del taller se calculan **filtradas a esos documentos**, aunque el núcleo
devuelva la cartera completa de la empresa. El nombre de la persona del taller va en `notes`. El tráfico va por una red
interna (5.4).

### 4.8 Usuarios: dos inicios de sesión

| Opción | A favor | En contra |
|---|---|---|
| **Dos** (recomendada) | Cero cambios; cada audiencia en su herramienta (P3); los roles no coinciden | El dueño tiene dos claves |
| Uno con el núcleo como identidad | Una clave | Toca la autenticación de los dos lados y el 2FA (S1) |
| Proveedor externo (Keycloak, Authentik) | Estándar | Un sistema más: rompe «simple y auditable» |

### 4.9 Permisos y roles (modo integrado)

| Acción | Admin | Recepción | Mecánico | Caja | Consulta | Núcleo |
|---|---|---|---|---|---|---|
| Facturar una orden | Sí | No | No | Sí | No | Cuenta de servicio |
| Registrar un cobro | Sí | No | No | Sí | No | Cuenta de servicio |
| Ver facturas (leídas del núcleo) | Sí | No | No | Sí | Sí (como hoy en el taller) | — |
| Ver cuentas por cobrar | Sí | No | No | Sí | **No** (como hoy: `GET /receivables` es ADMIN, CAJERO). Abrirlo a Consulta sería una decisión aparte | — |
| Anular, nota de crédito, anular cobro | En Finanzas | No | No | No | No | ADMIN/APPROVER (anular), ADMIN/ACCOUNTANT (nota) |
| Configurar el enlace | Equipo técnico con autorización de Carlos (P4) | No | No | No | No | — |
| Crear clientes y vehículos | Sí | Sí | No (vehículos: qa permite km a Mecánico) | No | No | — (ya resuelto en qa) |

### 4.10 Qué cambia en el código del taller

**Base de partida (D-T7, paquete T0b):** ni main ni qa sirven solas. main tiene cobros, cuentas por cobrar, acta y
migraciones, pero es la versión floja en seguridad; qa tiene la seguridad, pero no tiene cobros, acta ni migraciones y
exige S3. La base es **main + los arreglos de qa**, con **una migración** que lleve el esquema de qa (`StatusHistory.userId`
opcional) y conserve el almacenamiento en disco además de S3. Lo ideal es que la consolide **el socio**; si no puede,
Claude-PC lo intenta en una carpeta aparte y se lo entrega.

Imitando su patrón de `ECF_PROVIDER` (H11): `BILLING_BACKEND` = `local` (por defecto; ambiente 2 sin cambios) o `core`.
**Es del proceso, no de la empresa (A2):** en `core`, toda empresa factura por el núcleo; una empresa **sin enlace** recibe
«Tu taller todavía no está conectado con Finanzas; pide al equipo técnico que lo conecte» y **no factura**.

| Área | Cambio | Tamaño |
|---|---|---|
| Módulo de enlace | Cliente HTTP con tiempo límite, cuenta de servicio, traducción de errores (4.5), revisor periódico (4.4) | M |
| Migración aditiva | Enlace de empresa, de cliente y bandeja (4.3) | S |
| `billing` | En `core`: emisión por el núcleo; **API cerrada** para `POST /billing/sequences`, emisión local, E31/E32/E34/B14 y porcentajes libres (responden 409 «en modo integrado lo hace Finanzas»); líneas libres según D-T10; lectura desde el núcleo | M |
| `receivables` | En `core`: cobro por API con `externalRef`; saldos leídos y **filtrados** a su enlace; OTHER cerrado | M |
| `quotes`, `work-orders` | Tasa del núcleo y redondeo **por línea**; cotización congelada (4.12, T2d); orden congelada con envío activo (4.4) | M |
| `ecf` | Apagado en `core`; `mock` prohibido en el ambiente 3 | S |
| Frontend Vue | Facturar (cliente fiscal, tipo, retenciones del núcleo), estados con icono, color y texto, «Ver en Finanzas», sin «Secuencias» | M |
| Seguridad que qa no cubre (**T5a**) | El guard consulta en la base que el usuario siga activo y su **rol actual** (hoy un cambio de rol tarda hasta 8 h); límite de intentos en las rutas públicas de cotización (`/public/quotes/:token`) y comprobación de que el límite global ve la IP real detrás del proxy | S–M |
| Pruebas | Unidad contra un núcleo falso; recorrido contra el núcleo real del ambiente 3 | M |

No se toca: recepción, fotos, actas, tablero, etapas, WhatsApp.

### 4.11 Qué cambia en el núcleo

**Ya existe y usa el taller:**
| Endpoint | Para qué | Roles |
|---|---|---|
| `POST /auth/login`, `GET /auth/me` | Cuenta de servicio (S-a) | público / sesión |
| `GET /partners?q=`, `POST /partners` | Buscar (filtrando exacto) o crear | lectura todos; escribir ADMIN, ACCOUNTANT |
| `GET /tax-rates`, `GET /bank-accounts`, `GET /cash-registers`, `GET /ncf/sequences` | Mapa y avisos | todos |
| `POST /invoices` (`issueNow`), `GET /invoices/:id` | Emitir y leer | ADMIN, ACCOUNTANT / todos |
| `POST /payments`, `GET /payments/:id` | Cobrar y leer | ADMIN, ACCOUNTANT / todos |

**Lo que falta (T3a, T3d, T5b):**
| # | Falta | Archivos del socio que toca | Riesgo |
|---|---|---|---|
| F2 | `Invoice.sourceModule/sourceId` en el DTO de crear; **índice único parcial** (empresa + origen, solo ventas no anuladas; va en la migración SQL porque Prisma no lo modela, con comentario en el esquema); 409 con el id de la existente; `GET /invoices/by-source` con `effective` (V1a a1 + a5 recortado) | `schema.prisma`, `invoice.dto.ts`, `invoicing.service.ts`, controlador | Medio (archivo caliente) |
| F1 | `Payment.externalRef` único por empresa y 409 con id (reemplaza a la tabla de idempotencia de la v1.0) | `schema.prisma`, `payment.dto.ts`, `payments.service.ts` | Medio |
| F3 | `GET /meta/version` | archivo nuevo | Bajo |
| F5 | Montar `SwaggerModule` (H26) con los endpoints que usa el taller; **decidir si `/docs` es público** (recomendado: solo dentro de la red, no expuesto por el nginx de Finanzas) | `app.setup.ts` | Bajo |
| T3d | Aviso del contrato §3.6 en el detalle de factura: «Viene de la orden OT-123 del Taller · Ver orden» | `sales/invoice-detail.*` (1 archivo) | Bajo |
| F4 | Llave de servicio con alcance (S-b) | `src/auth/*` (PR propio) | **Alto** |

### 4.12 Cálculo, redondeo y cotización congelada (R7, R9, M5)

- La factura vale lo que calcula el núcleo.
- **La cotización hoy no guarda sus líneas** (H12): si después de aprobarla se agregan o cambian líneas, la vista pública
  muestra las nuevas y la factura sale de las nuevas. La diferencia puede ser **de cualquier monto**, no de centavos.
  **T2d:** la cotización guarda **copia de sus líneas**; la vista pública muestra esa copia; aprobada, las líneas de la
  orden quedan bloqueadas; un trabajo extra se agrega con **otra cotización** (complementaria); si al facturar la orden
  tiene líneas fuera de lo aprobado, el taller avisa antes.
- Mismo redondeo que el núcleo (por línea) y tasa del núcleo, para que cotización y factura coincidan al centavo.

### 4.13 e-CF en modo integrado

El taller no habla con ningún proveedor; E31/E32 cerrados en su API hasta N3; el núcleo es el único emisor. Pequeños y
Micro: solo e-CF desde el **15-nov-2026**. Hasta N7, un taller real integrado **no puede facturar electrónicamente
desde el sistema** (7.2).

---

## 5. El ambiente 3 (integrado)

### 5.1 Principios

- Propios: carpeta, proyecto `integrado-pruebas`, contenedores (`container_name` con prefijo `integrado-`), volúmenes,
  redes, puertos, secretos, subdominios y copias del código.
- **Prohibido reutilizar** `docker-compose.prod.yml` del núcleo (publica `127.0.0.1:${PORT:-3000}`) y el
  `docker-compose.yml` del socio (main publica 5434, 6379, 9000 y 9001 en **todas** las interfaces). El compose del
  ambiente 3 se escribe completo, sin `-f` encadenados.
- **Único punto compartido, dicho con honestidad:** Nginx Proxy Manager, que ya está unido a las redes `edge` de los
  otros ambientes y se unirá a la del 3. Por eso apunta **por nombre de contenedor** (`integrado-nucleo-web`,
  `integrado-taller-web`): en los ambientes 1 y 2 ya hay servicios llamados `web`, y por nombre de servicio sería ambiguo.
  Lista de acceso (clave) **propia** del ambiente 3.
- Solo datos ficticios; reconstrucción con un comando.

### 5.2 Carpeta

`/home/claude/claude-docker/proyectos/Software/integrado/`
| Ruta | Contenido |
|---|---|
| `README.md` | Paso a paso para Carlos |
| `compose.integrado.yml`, `dc.sh` | Compose completo; atajo con `-p integrado-pruebas` |
| `reconstruir.sh` | Borra solo este proyecto y lo recarga (5.8) |
| `.env.integrado`, `.credenciales-integrado.txt` (600) | Secretos generados al azar; usuarios ficticios |
| `fuentes/financial-backend/` | Clon propio en la **rama principal o una etiqueta** (M3), nunca una rama larga; lo de T3a entra a la principal por el flujo normal antes de usarse aquí |
| `fuentes/taller/` | Repositorio git propio con la base de T0b y la rama de integración del taller |
| `nginx/`, `semilla/` | Configuración web propia; `semilla.json` y scripts |

### 5.3 Servicios

| Servicio (`container_name`) | Construcción | Redes | Puerto | Memoria máx. |
|---|---|---|---|---|
| `integrado-nucleo-db` | postgres:18-alpine | nucleo | — | 512 MB |
| `integrado-nucleo-migrate` | núcleo (etapa `tools`) | nucleo | — | 384 MB (corre y termina) |
| `integrado-nucleo-api` | núcleo (etapa `api`) | nucleo, enlace | — | 768 MB |
| `integrado-nucleo-web` | núcleo `frontend/` | nucleo, edge | 127.0.0.1:8050 | 128 MB |
| `integrado-taller-db` | postgres:16 | taller | — | 384 MB |
| `integrado-taller-api` | taller (Dockerfile endurecido como el del ambiente 2) | taller, enlace | — | 512 MB |
| `integrado-taller-web` | taller frontend | taller, edge | 127.0.0.1:8051 | 128 MB |

Sin Redis ni MinIO (fotos en disco, según T0b).

### 5.4 Redes

`integrado_nucleo_net` y `integrado_taller_net` internas; `integrado_enlace_net` (interna, solo las dos API);
`integrado_edge_net` (las dos web + NPM). Ninguna base en `enlace` ni en `edge`.

### 5.5 Puertos

Solo 127.0.0.1:8050 y 8051 (libres hoy; los ambientes 1 y 2 usan 8040/8041 y 15173/13000/15434).

### 5.6 Subdominios

| Opción | A favor | En contra |
|---|---|---|
| **Dos subdominios** (recomendada): `integrado.biodesch.com` (Finanzas) e `integrado-taller.biodesch.com` (Taller) | Cero cambios en las interfaces; sesiones en orígenes distintos | Dos DNS y dos hosts en NPM |
| Un dominio con rutas | Una dirección | Cambiar base de la app Vue, su `/api` y el enlace público; sesiones en el mismo origen |

Los dos detrás de HTTPS y de la clave de NPM. **Consecuencia:** el enlace público de cotización también queda detrás de
esa clave en el ambiente 3 (los probadores la tienen; un cliente real no). Se acepta en pruebas; en producción la ruta
pública irá sin esa clave y con su propio límite (T5a).

**Diseño visual:** Taller con su Tailwind; Finanzas con su kit (sin Tailwind). Sin estilos sueltos; T3d usa el kit.

### 5.7 Datos ficticios coherentes

Una sola `semilla.json`. 2 empresas («Taller Los Hermanos SRL (DEMO)» y «Auto Servicio El Cibao SRL (DEMO)»), mismos RNC
ficticios en los dos lados. Núcleo: catálogo RD, diarios, año 2026 abierto, impuestos, cuentas automáticas y de
repuestos y servicios, secuencias B01, B02, B04, B15, caja, banco, «Consumidor final», contadora, dueño, aprobador y
usuario técnico. Taller: empresa, etapas, usuarios, enlace. Clientes iguales en los dos lados (mitad ya enlazados);
una docena de vehículos y órdenes; **2 órdenes «Listo» sin facturar**; **ninguna** factura ni cobro precargado.

### 5.8 Reconstruir desde cero

`reconstruir.sh`: se niega si el proyecto no es `integrado-pruebas`; `down -v` de ese proyecto; bases sanas;
migraciones; semilla del núcleo; semilla del taller; prueba de humo (el taller lee `GET /tax-rates` del núcleo);
credenciales en el archivo 600.

### 5.9 Recursos del servidor (M1)

Topes: 512 + 768 + 128 + 384 + 512 + 128 = **2,43 GB** con todo encendido, más 384 MB de la migración mientras corre.
Hoy hay ≈4,6 GB disponibles y ≈0,5 GB de swap en uso. Por eso: **construir las imágenes de una en una** con el ambiente 2
parado (o construirlas en la PC), apagar el ambiente 3 cuando no se use, y no tener los tres ambientes con builds a la vez.

---

## 6. Plan por fases y paquetes

Flujo de cada paquete: arquitecto → revisor-crítico → Carlos aprueba → dev → qa → seguridad → documentador →
revisor-crítico final. S = horas · M ≈ 1 día · L = 2–3 días.

| ID | Paquete | Quién | Nivel | T | Depende de |
|---|---|---|---|---|---|
| **T0** | Aprobación; **conversación con el socio** (P1, D-T4, D-T7) **a más tardar el 23-oct**; DNS | Carlos | — | — | — |
| **T0b** | **Base del taller** = main + arreglos de qa, con su migración y fotos en disco | El socio (ideal) o Claude-PC en carpeta aparte | N1 | L | T0 (acuerdo) |
| **T1** | Ambiente 3 vacío (5.1–5.6) | Claude-servidor (devops) | N2 | M | Aprobación (no espera al socio) |
| **T1s** | Semilla coherente y prueba de humo | Claude-servidor + Ollama para redactar `semilla.json`, revisado | N2/N3 | M | T1 |
| **T3a** | **Núcleo: F2, F1, F3, F5** (en paralelo a T2a, entra a la principal) | Claude-servidor | N1 | M–L | Aprobación; aviso al socio |
| **T2a** | Adaptador del taller (backend), con la llave natural desde el principio | Claude-PC | N1 | L | T0b, T3a (puede empezar contra un núcleo falso) |
| **T2b** | Pantallas del taller en modo integrado | Claude-PC | N2 | M | T2a |
| **T2d** | Cotización congelada (4.12) | Claude-PC | N2 | M | T0b |
| **T2c** | Recorrido mínimo en el ambiente 3: orden → B01 → asiento → cobro → 607 de prueba; aislamiento entre las 2 empresas; reintento con corte simulado. **Sin retenciones** (A5) | Claude-servidor (qa) + contadora mira el asiento | N2 | M | T1s, T2a, T2b, T3a |
| **T3b** | Revisor periódico, POR_REVISAR, «vale / no vale», orden que vuelve a «por facturar» | Claude-PC | N1 | M | T2c |
| **T3c** | Pruebas de contrato por HTTP (reemplazan a V3 para el taller) | Claude-PC (qa) | N1 | M | T3b |
| **T3d** | Aviso «Viene de la orden» en Finanzas (contrato §3.6) | Claude-PC (dev-frontend) | N2 | S | T3a |
| **T4** | Correcciones vistas desde el taller (con N1 fusionado) | Claude-PC | N2 | S | N1, T3b |
| **T5a** | Seguridad que qa no cubre (4.10) | Claude-PC | N1 | S–M | T0b |
| **T5b** | Llave de servicio con alcance (S-b) | Claude-servidor | N1 | L | T3a; diseño revisado por seguridad; antes de D41 si incluye ACCOUNTANT |
| **T5q** | Auditoría de seguridad de la integración | Claude-servidor (seguridad) | N1 | M | T5a, T5b |
| **T6** | Estado e-CF del núcleo visto desde el taller | Claude-PC | N2 | S | N3 (N7 para emitir) |
| **TD** | Manual «Facturar y cobrar desde el taller» | Ollama + revisión de Claude-PC | N3 | M | T2b |

**Esfuerzo:** Claude-servidor ≈8 días de trabajo (T1, T1s, T3a, T2c, T5b, T5q); Claude-PC ≈10–11 (T0b, T2a, T2b, T2d,
T3b, T3c, T3d, T4, T5a; ≈8 si T0b lo hace el socio). Más las revisiones de calidad.

**Fechas estimadas** (aprobación la semana del 19-oct; conversación con el socio a más tardar el 23-oct; si el cupo se
agota o una revisión devuelve un paquete, todo se corre):
| Hito | Calendario |
|---|---|
| Ambiente 3 vacío con semilla; T3a en la rama principal | ≈27-oct |
| Base del taller (T0b) | ≈30-oct (si la hace el socio, depende de él) |
| **Ver una orden convertida en factura y asiento en el ambiente 3** (T2c) | **≈10–13 nov (≈3–3,5 semanas)** |
| Robusta: correcciones visibles, pruebas de contrato, aviso en Finanzas | ≈24-nov |
| Lista del lado de la integración para la puerta de datos reales (T5a, T5b, T5q) | ≈5–9 dic, **más** S1–S3 del núcleo |
| e-CF real desde el taller | Cuando exista N7 |

### 6.1 Qué se puede hacer ya y qué espera

| Ya | Espera a… |
|---|---|
| T1 y T1s (no tocan el código del socio) y T3a | — |
| T0b, T2a, T2d, T5a | El acuerdo con el socio (T0) |
| Reglas finales de corrección | **N1** fusionado |
| Tasa con vigencia a la fecha | **N2a/N2c**; vista previa para la cotización: **N2d** |
| Retenciones en facturas mixtas | **D-T11 antes de N2c** |
| Bloqueo de las B por fecha | **N5** |
| e-CF | **N3** y **N7** |
| Datos reales | **S1–S3** + **T5a, T5b, T5q** + exportación que incluya la base del taller |

### 6.2 Cambios propuestos a otros documentos (aplicados en esta entrega, sin commit, pendientes de Carlos)

- `docs/tablero-paquetes.csv`: filas T0, T0b, T1, T1s, T2a, T2b, T2c, T2d, T3a, T3b, T3c, T3d, T4, T5a, T5b, T5q, T6, TD;
  V2, V3 y V4 marcados «en pausa (D-T5)»; V1b sin prisa.
- `docs/PAQUETES-DE-TRABAJO.md`: §3.1 punto 3 de la cola de Claude-PC (taller en lugar de V4/V2/V1b/V3); §7 lista de
  seguridad obligatoria con T2a, T3a, T5a, T5b; §8 fechas del taller.
- `docs/CONTRATO-VERTICALES.md` §6.2: nota de que las fechas del socio se reemplazan por las de este documento.
- **Propuesta a `docs/PLAN-v0.3.md`** (no aplicada: la decide Carlos, D-T11): §5.6 y A7, base de la retención de ITBIS
  de servicios en facturas mixtas.

---

## 7. Riesgos

### 7.1 Seguridad del taller

| Riesgo | Estado en qa | Mitigación |
|---|---|---|
| Sin límite de intentos | Resuelto en el login (5/min) y global (300/min) | Verificar IP real detrás del proxy; límite en la cotización pública (T5a) |
| Secretos por defecto | Resuelto (`loadEnv`) | Incluido en T0b |
| Cotización pública con datos de más | Resuelto (`toPublicView`) | Incluido en T0b |
| Roles flojos en clientes y vehículos | Resuelto | Incluido en T0b |
| Usuario desactivado o con rol cambiado sigue 8 h | **No resuelto** | T5a |
| Credencial de Finanzas en código de terceros | — | Cifrada, red interna, lectura acotada, S-b (T5b); plan de respaldo A-pull (2.1) |
| Sesiones en el mismo origen | — | Dos subdominios |

### 7.2 e-CF (noviembre de 2026)

Grandes Locales y Medianos: solo e-CF desde el 1-nov-2026; Pequeños, Micro y No Clasificados: hasta el 15-nov-2026.
**Ningún taller real emitirá e-CF desde este sistema en esas fechas.** Nunca `ECF_PROVIDER=mock` con datos reales.

### 7.3 Contabilidad, datos y comercio

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Factura duplicada por corte de red | Alto | Llave natural (4.4) desde T2a |
| Copiar estados | Alto | Leer siempre (contrato §3.3) |
| Cotización distinta de la factura | Alto (reclamo) | T2d + mismo redondeo |
| Retención de más en facturas mixtas (todo el núcleo) | **Alto** | D-T11 antes de N2c |
| ITBIS en B14 | Medio | B14 cerrado hasta C-10 |
| Fecha UTC | Medio | Fecha de Santo Domingo |
| Finanzas caído | Medio | Bandeja; el taller sigue sin facturar |
| Exportación completa sin la base del taller | Alto (P10, R12) | Paquete con S2 antes de datos reales |
| **Ni Finanzas ni el taller imprimen la factura** | **Alto (comercial)**: sin papel o PDF no hay qué entregar al cliente con un B01 | **Decisión D-T9** |
| Vender el taller solo (modo local) con datos reales | Alto: 18 % fijo, sin notas de crédito, e-CF simulado | **Decisión D-T8** |

### 7.4 Deuda técnica y «simple y auditable»

Dos sistemas por HTTP son más complejos que uno: dos bases, dos inicios de sesión, una bandeja con su revisor periódico
(una cola sencilla). Se acepta porque reescribir cuesta 8–12 semanas. Se mantiene auditable si el taller nunca guarda
estados fiscales, toda escritura en Finanzas pasa por la API con bitácora y no se agregan webhooks, colas externas ni
proveedor de identidad sin una razón medida. **Costo de no vigilarlo:** cada pieza extra es un lugar más donde los
números del taller y los de Finanzas dejan de coincidir.

Deuda aceptada: dos inicios de sesión; S-a hasta T5b; nombre de la persona en `notes`; sin fusión de clientes
duplicados; índice parcial invisible para Prisma (documentado); el taller pregunta al abrir (sin avisos del núcleo).

---

## 8. Qué validan las contadoras

Montos de prueba: repuestos 1.000, mano de obra 2.000, ITBIS 18 %.

| # | Caso | Asiento esperado (lo genera el núcleo) | Pregunta |
|---|---|---|---|
| C-1 | Venta a crédito B01 | Débito CxC 3.540 / Crédito Repuestos 1.000, Servicios 2.000, ITBIS por pagar 540 | ¿Cuentas separadas? ¿Tipo de ingreso 01? |
| C-2 | Contado B02 a «Consumidor final» | C-1 + Débito Caja 3.540 / Crédito CxC 3.540 | ¿Un cliente genérico por empresa sirve para el 607? ¿Desde RD$250.000 hay que identificar al comprador, y cómo? |
| C-3 | Abono por transferencia | Débito Banco 1.000 / Crédito CxC 1.000 | — |
| C-4 | Cobro con tarjeta | Débito Banco / Crédito CxC | Retención del 2 %: ¿al cobrar o al conciliar? (C-7) |
| C-5 | Cliente que retiene el 30 % del ITBIS (solo servicios) | Débito CxC neto + ITBIS retenido / Crédito ingresos e ITBIS | — |
| C-6 | **Factura mixta con retención del 30 %** | ¿Base 360 (ITBIS de la mano de obra) o 540? | Si es 360, aplica D-T11 al PLAN-v0.3 |
| C-7 | 2 % de tarjeta | — | Base y momento (ya en D37) |
| C-8 | Anulación (mes abierto) y nota de crédito (mes cerrado) desde Finanzas | Reverso (N1) / B04 | ¿Qué debe ver el taller? |
| C-9 | Comprobantes según la clasificación | — | ¿Un taller típico es Pequeño o Micro? ¿Hasta qué día admite B? |
| C-10 | **B14 (regímenes especiales)** | — | ¿Va sin ITBIS? ¿Qué cuenta de ingreso? |

Además: un 607 ficticio del ambiente 3 por el prevalidador de la DGII (R10).

---

## 9. Decisiones de Carlos

| # | Pregunta (en sencillo) | Recomendación |
|---|---|---|
| **D-T1** | ¿Cómo se juntan el taller y Finanzas? | **Camino A**: el taller pide a Finanzas que facture y cobre |
| **D-T2** | ¿Una dirección web o dos? | **Dos**: `integrado.biodesch.com` e `integrado-taller.biodesch.com` |
| **D-T3** | ¿Una clave o dos? | **Dos por ahora** |
| **D-T4** | ¿Hablas con el socio antes de tocar su código? | **Sí, a más tardar el 23-oct.** Sin su acuerdo no arrancan T0b ni T2a; el ambiente vacío (T1) y lo de Finanzas (T3a) sí |
| **D-T5** | ¿Pausamos V2, V3, V4 y la parte interna de V1a? | **Sí.** Ojo: no ahorra tiempo neto; el trabajo del taller suma ≈5–6 días más a la cola de Claude-PC de lo que se pausa. Se recomienda porque el taller es la vertical real |
| **D-T6** | ¿Con qué llave entra el taller a Finanzas? | Hoy, un usuario «contador» puede casi todo: cambiar impuestos, catálogo, saldos iniciales, emitir notas de crédito y entrar a la pantalla de Finanzas. Por eso: **solo en el ambiente de prueba**; **antes de datos reales, llave limitada y revocable (T5b)**, y antes de exigir 2FA a los contadores |
| **D-T7** | ¿De qué código del taller partimos? | **main + los arreglos de qa**, consolidados en una base (T0b), idealmente por el socio |
| **D-T8** | ¿Se puede vender el taller **solo** (sin Finanzas) a un cliente real? | **No por ahora**: tiene 18 % fijo, no anula ni hace notas de crédito y su factura electrónica es simulada |
| **D-T9** | ¿Cómo se entrega la factura impresa? | **Un paquete de PDF de factura en Finanzas** (con NCF, RNC, ITBIS y los datos que exige la DGII), validado por la contadora, antes de datos reales; con e-CF, la representación impresa del proveedor |
| **D-T10** | ¿Ventas de mostrador sin orden (vender una pieza suelta)? | **Apagadas en la primera fase**; después, abiertas con una cuenta de ingreso «ventas de mostrador» que defina la contadora |
| **D-T11** | ¿Corregimos el plan de Finanzas para que la retención del 30 % se calcule solo sobre el ITBIS de los servicios? | **Sí, si la contadora lo confirma (C-6), antes de N2c**. Afecta a toda factura mixta, no solo al taller |

---

## 10. Archivos de referencia

- Núcleo: `src/invoicing/*`, `src/receivables-payables/*`, `src/masters/partners/*`, `src/masters/ncf/ncf.service.ts`,
  `src/auth/*`, `src/app.setup.ts`, `prisma/schema.prisma`, `docker-compose.prod.yml`, `docker-compose.pruebas.yml`,
  `frontend/deploy/nginx.conf`.
- Taller main: `backend/taller-backend-main/src/{billing,receivables,ecf,auth,common,clients,vehicles,quotes,work-orders}`,
  `prisma/`; `frontend/taller-frontend-main/src/{api,router}`; `docs/CARACTERISTICAS.md`; `deploy/*`.
- Taller qa: `qa/backend/taller-backend/src/{config/env.ts,app.module.ts,auth,quotes,clients,vehicles,storage}`,
  `prisma/`, `docker-compose.yml`; `qa/frontend/taller-frontend`.

---

## 11. Resumen para Carlos

**Qué cambió.** El revisor aprobó la idea (el Taller le pide a Finanzas que facture y cobre) y pidió ajustes, todos
hechos: partimos de la versión más segura del taller que ya había preparado el equipo de qa, juntándola con la que tiene
cobros; el taller no puede facturar por su cuenta ni por error cuando está conectado; una factura no se puede duplicar
aunque se caiga la conexión; la cuenta con la que el taller entra a Finanzas se limita antes de datos reales; la
cotización aprobada queda congelada; y encontramos un detalle del plan de Finanzas (la retención del 30 % en facturas
con repuestos y mano de obra) que hay que corregir para todos los clientes, no solo para el taller.

**Cuánto tarda.** Unas **3 a 3,5 semanas** para ver una orden del taller convertida en factura con su asiento en el
ambiente de prueba (hacia el 10–13 de noviembre); unas **2 semanas más** para dejarlo robusto; y **2 más** para la parte
de seguridad que se exige antes de datos reales. Es trabajo **adicional**: no lo compensa lo que se pausa.

**Qué decides tú.** Las 11 decisiones de la sección 9, cada una con su recomendación. Las más urgentes:
1. **Hablar con el socio esta semana** (a más tardar el 23-oct): que acepte la base del taller y los cambios en una rama aparte.
2. **Factura impresa** (D-T9) y **no vender el taller solo** todavía (D-T8).
3. **Corregir la retención del 30 %** en el plan de Finanzas cuando la contadora lo confirme (D-T11).
Además: crear dos subdominios (te doy el paso a paso) y un rato de la contadora para la sección 8.

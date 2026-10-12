# Plan técnico v0.3 — Cumplimiento fiscal: vigencias, ficha fiscal, puerta de datos reales, calendario, declaraciones y e-CF

Fecha: 2026-10-12 · Autor: Arquitecto · **Versión 1.2** (v1.1 aprobada con cambios por el revisor-critico; cada ajuste verificado en el código)
Documentos que mandan: `CLAUDE.md`, `docs/GUIA-PRODUCTO.md` (P1–P14, checklist 6) y `docs/GUIA-CONTABLE-FISCAL.md`
(R1–R12, sección 3, checklist 8). Planes vigentes: `docs/PLAN-v0.2.md` (en curso) y `docs/PLAN.md`; este plan no los
reemplaza y reutiliza las convenciones del socio (PLAN-v0.2, sección 2) y la entrega con un PR por fase (12.4). El
veredicto de calidad es de `qa`; la aprobación de negocio, de Carlos.

## Qué cambió

**v1.1 → v1.2 (una línea por cambio):**
| # | Cambio (verificado en el código) | Dónde |
|---|---|---|
| N1 | La nota de crédito tiene salida entre las Fases 3 y 7. Pasado el fin de las B, `issueTx` elegiría una B04 (`invoicing.service.ts:314`, bloqueada por D24) o una E34 (422 sin proveedor), así que "Crear nota de crédito" guía a emitir la E34 en el portal e importar el XML. Lo mismo para B11/B13 (`:328-330`) → E41/E43 | 4.2, 7.1, 7.4, 1.4, 13 |
| N2 | `voidJournalEntry` (`accounting.service.ts:543-570`) no miraba `sourceType`. Ahora solo admite asientos MANUAL (incluida la apertura) y los de tesorería (BANK_TRANSACTION, OTHER, que hoy no tienen otra vía de corrección). Factura, pago y cierre → 422 "corrígelo desde el documento" | 4.2 |
| N3 | `valueAt` excluye las filas que tienen sucesora (`supersedesId`) | 5.2 |
| N4 | Los saldos no cambian, pero el diario, el mayor y las columnas de la balanza muestran original y reverso. Cambian también `Reports.e2e-spec.ts:134, :261` y `entry-approval.e2e-spec.ts:256` | 4.3, 14, manual |
| N5 | Las notas de crédito y débito toman los valores fiscales a la fecha de la factura que modifican | 5.2 |
| N6 | Hasta tener `FiscalFiling` (Fase 5), un mes se considera "declarado" si ya pasó el día 15 del mes siguiente (Fase 1) | 4.2 |
| N7 | `EcfDocument` lleva un único (empresa, RNC emisor, e-NCF) para cubrir importaciones simultáneas; la regla D36 se basa en la **conexión** y no en la secuencia | 7.2, 7.4, D36 |
| N8 | Estimación separada: ≈13 semanas efectivas sin el e-CF propio y la Fase 7 aparte. La puerta de datos reales se divide en 3a (backend y devops) y 3b (pantallas), y se cierra hacia la semana 11 | 12, 15, 17 |
| A7 | En impuestos enlazados se ignora la base que manda el cliente (`:171`) y la del borrador (`:303`); al emitir se recalcula | 5.3 |
| A3 | Clave `NONE` en un impuesto enlazado → 422 explicado. D38 aplica solo a impuestos enlazados | 5.2, D38 |
| A8 | No consta que `fast-xml-parser` limite la profundidad: se hace una revisión propia antes de leer. La subida es multipart (multer con sus límites); el tope JSON de 100 KB (`app.setup.ts:43`) no la afecta y la confirmación usa un id del lado del servidor | 7.4 |
| m1 | M6 está en 4.3 (no en 4.2) | — |
| m2 | En el sistema todo entra como **Por validar** hasta que se carga la validación con nombre (D33); la 5.6 muestra el "estado en la Guía" | 5.1, 5.6 |
| m3 | El frontend de la Fase 1 sale junto con su backend: la pantalla vieja no mostrará reversados como si nada | 12 |
| m4 | Fuera del catálogo `RECARGO_MORA` e `INTERES_INDEMNIZATORIO` (nada los usa en la v0.3); la base TOTAL del 2 % de tarjeta va a la contadora; `IMP_CHEQUES` con nota de discrepancia; contingencia con arts. 55 y 40-43 | 5.6, 7.5, 0.1 |
| m5 | Se actualiza la tarea 0.3 de `docs/PLAN-v0.2.md` (copia externa) para que apunte a la Fase 3 de la v0.3 | 0.5 |

**v1.0 → v1.1 (resumen):**
- **G1–G5:** reglas de reverso por llamador; el cierre de año conserva su flujo; apertura, listado, conciliación y pruebas del socio.
- **G6:** trazabilidad de la tasa y parámetros inmutables.
- **G7:** importación sin choques.
- **G8:** fecha real contra el fin de las B.
- **A1–A9:** nuevo orden con la puerta de datos reales obligatoria; documentación e-CF como bloqueo; fecha mínima;
  607/608 conservador; NG de retención; retener al pagar como decisión; base declarada; XML "No verificado";
  `EcfDocument` en la misma transacción.
- **M1–M8:** contingencia, B de pequeños, "Corregir" con copia, cuadre neto, cargador y deuda del trigger.

## 0. Resumen para Carlos (una página)

**Qué resuelve la v0.3:** que lo fiscal "simplemente funcione y esté al día" (P11) sin saberse la ley, que el sistema
**pueda recibir datos reales**, y dejar listo el camino de la factura electrónica.
1. **Los valores de la DGII dejan de estar fijos en el programa** (R9): tasas, retenciones, topes y fechas con
   "desde". Cada factura guarda **qué tasa usó y de dónde salió**. Un cambio de la DGII se carga como dato, sin
   programar; nada se borra ni se sobrescribe. Cada valor dice si está **Oficial** o **Por validar**.
2. **Ficha fiscal de la empresa**: clasificación DGII, régimen, tipo de sociedad, marco NIIF y cierre.
3. **Lo contabilizado no se toca** (R2): corregir un asiento crea un **reverso** visible. Una factura de un mes
   cerrado o ya declarado, o una factura electrónica, se corrige con **nota de crédito**, nunca anulándola. Mientras
   no haya conexión con el proveedor, esa nota se emite en su portal y se importa.
4. **Puerta de datos reales** (obligatoria): verificación en dos pasos (2FA), exportación completa de los datos y
   copia de respaldo fuera del servidor. Sin esto no hay clientes reales.
5. **Factura electrónica, parte 1**: importar los XML que tus clientes emiten en el portal del proveedor, bloquear su
   anulación y **cuadrar el mes** (607 contra la contabilidad, 606 contra el ITBIS adelantado).
6. **Calendario fiscal en el Panel** y avisos de comprobantes (NCF) que se agotan o vencen y del **fin de las B**.
7. **609, IT-1 e IR-17 asistidos**, con la lista de lo que hay que corregir antes de presentar.
8. **Factura electrónica, parte 2** (emitir desde el sistema): espera la documentación del proveedor.

**Aviso honesto sobre el 15-nov-2026:** ningún cliente real emitirá e-CF desde el sistema en esa fecha. Hay tres
motivos: no hay datos reales sin la Fase 3, el proveedor no está definido y la v0.2 sigue en curso. Los clientes
cumplen esa fecha con el portal del proveedor (o el Facturador Gratuito); nuestro sistema entra después,
importando sus e-CF y llevando su contabilidad y su DGII.

**Tiempo:** ≈**13 semanas efectivas** y ≈**19 a 21 de calendario** sin la emisión propia de e-CF, en parte en
paralelo con la v0.2 (el backend empieza ya). Datos reales posibles hacia la **semana 11**. Emitir e-CF desde el
sistema (Fase 7) suma ≈2,5 semanas efectivas **desde que el proveedor entregue su documentación**. **Decides tú:** D23–D40 (sección 16). Las nuevas más importantes:
**D34**: factura de mes cerrado → nota de crédito; **D37**: retener al emitir o al pagar; **D38**: desde qué fecha hay
valores; **D39**: 2FA antes del e-CF.

## 1. Punto de partida (verificado en el código el 2026-10-12, rama `fase-1`, `d369c6d`)

| Tema | Hoy | Consecuencia |
|---|---|---|
| Impuestos | `TaxRate` por empresa: `rate Decimal(5,2)`, `type`, `isWithholding`, `dgiiCode`, cuentas. **Sin fechas.** `PATCH` cambia la tasa al instante | Brecha principal de R9 |
| Cálculo | `invoicing.service.ts` `build()`: `taxAmount = net × t.rate`; base de la retención según `type` (`:171`: ITBIS_WITHHOLDING → ITBIS, si no → subtotal). Al emitir **recalcula con los maestros actuales** | Una factura de junio emitida en julio usaría la tasa de julio; un 2 % "del monto" se calcularía sobre el ITBIS |
| Facturas emitidas | Guardan `taxAmount` y `InvoiceWithholding.base/amount`, **no la tasa aplicada**; el detalle muestra `taxRate.name/rate` del maestro actual (`:518-519`) | Migrar no cambia montos, pero hoy no hay trazabilidad de la tasa |
| Vista previa | `invoice-form.ts:135-153` y `:254` usan `taxRate.rate` y la base por `type` | Debe pedir tasa y base vigentes a la fecha |
| Valores fijos | `dgii.codes.ts`: `CONSUMER_DETAIL_THRESHOLD = 250000` | A parámetro |
| R2 asientos | PATCH solo DRAFT/REJECTED ✔; sin DELETE ✔. `void` → VOIDED; solo con el período abierto (`accounting.service.ts:561`, `posting.service.ts:141`). `REVERSAL`/`reversalOfId` existen y **nadie los usa** | D23 |
| R2 documentos | Factura y pago anulan con `posting.voidEntry` (solo en período abierto). La reapertura de año anula el cierre (`fiscal-year.service.ts:419`). Los reportes excluyen solo `CLOSING` | Reglas por llamador (4.2) |
| DGII | 606/607/608 con validaciones y TXT. Una factura anulada sale del 607 (`dgii.service.ts:157`) y entra al 608 por `voidedAt` (`:403`). Sin 609, IT-1, IR-17 ni cuadres; ITBIS proporcional en 0 | Secciones 4 y 9 |
| 607/608 con e-CF | El 607 trata igual E y B. La fuente del repo (`fuentes/...`, línea 268) solo dice que quien usa el Facturador Gratuito no presenta el 607 de esos e-CF. Respuestas del portal de ayuda de la DGII ([E31 en el 607](https://ayuda.dgii.gov.do/conversations/discusiones/se-deben-reportar-en-el-formato-607-las-facturas-electronicas-de-ventas-e31/65f278cc2e503b6c8e8bb766), [607 de la facturación electrónica](https://ayuda.dgii.gov.do/conversations/discusiones/607-de-la-facturacin-electrnica/6526ad0f9ebea32adabe54fd), [606 a 609](https://ayuda.dgii.gov.do/conversations/discusiones/formatos-de-envo-606-607-608-y-609/67b4e65d998b007ec2371cac)) dicen que el emisor 100 % electrónico no remite 607 ni 608. **No es una norma descargada** | Validar; por defecto, conservador (D35) |
| NCF | `NcfSequence` con rango, vencimiento y `warningThreshold`; `consumeNext` compara el vencimiento contra `issueDate` (`ncf.service.ts:64,71`), que escribe el usuario | Avisos (R8) y bloqueo con la fecha real |
| Empresa | `Company`: RNC, moneda, `fiscalYearStartMonth`. Nada más | Ficha aparte (6) |
| e-CF | Solo secuencias E en el catálogo; **se puede emitir una venta E sin ningún proveedor** y anularla | 7.1 |
| Conciliación | Candidatos = líneas POSTED (`bank-reconciliation.service.ts:96`); bloquea los enlaces a asientos no POSTED (`:181`) | Ajustar para reversos (4.3) |
| Respaldos | Diarios con prueba de restauración; **sin cifrado ni copia externa** (PLAN-v0.2 11.2, D17/D18 pendientes) | Fase 3 |
| Memoria | API con `mem_limit: 768m` (`docker-compose.pruebas.yml`) | Tope de la importación |
| v0.2 | Fase 1 en pruebas (`76c7407`…`d369c6d`); Fases 2–7 pendientes | Sección 15 |
| Estilos | Kit propio (`styles.css`, `shared/ui`); **sin Tailwind** y no se introduce | Pantallas con el kit |

## 2. Alcance ajustado y por qué

| Propuesto | Queda | Razón |
|---|---|---|
| R9 parámetros + ficha | **Sí, primero** (Fase 2) | Sin esto, todo lo demás repite valores fijos. Lo "por empresa" es el `TaxRate` existente |
| R2 | **Sí** (Fase 1), con reglas por llamador | La necesitan el e-CF y la exactitud del 607/608 |
| 2FA + exportación + copia externa | **Obligatoria** (Fase 3, D29) | Es la condición para tener datos reales (R12, P10); PLAN-v0.2 lo prometió |
| e-CF | **Partido**: Fase 4 sin proveedor (bloqueo R2, estado mínimo, importación) y Fase 7 con proveedor | Armar el XML, la cola y la contingencia sin el XSD ni la API del proveedor sería retrabajo (A1, A2) |
| Cuadres previos | **Fase 4**, con la importación | Los datos importados son los que más necesitan cuadrar |
| R11 calendario + R8 avisos | Fase 5 | Plazos y feriados como datos |
| R10 609/IT-1/IR-17 | Fase 6, **asistidos**: hoja por casilla, sin archivo del IT-1 | Se llenan en la Oficina Virtual; la proporcionalidad solo se avisa (D32) |
| Ctrl+K, DuPont, equilibrio, vertical/horizontal, conciliación de 2 columnas, importadores, visor de bitácora | **v0.4** (D30) | La Guía contable prioriza lo fiscal |

## 3. Convenciones, módulos y librerías

**Convenciones del socio**: PLAN-v0.2 sección 2, sin excepción. Incluye módulo por carpeta, ESM `.js`, guards,
`@Roles` explícito, `companyId` del token, `writeAudit` en la transacción, 404 para lo ajeno, 422 en español,
migraciones aditivas y `ADD VALUE` en migración propia. **Módulos nuevos**: `src/fiscal/`: parámetros, cargador,
ficha, enlaces, calendario, presentaciones y avisos. `src/dgii-returns/`: 609, hojas, cuadres y revisión. **Usa**
`DgiiService` (ya exportado). `src/ecf/`: documento, importación y, en la Fase 7, adaptadores y cola. Frontend:
`features/fiscal/` y `features/ecf/` con el kit. Ningún estilo global nuevo. **Librerías**: Backend: solo
`fast-xml-parser` (MIT, sin dependencias, mantenida; D31), con versión fijada y sin CVE conocidos (`npm audit` en la
Fase 4). Sin validador XSD nativo. El 2FA (Fase 3) se diseña en un anexo. Si propone una librería TOTP, pasa por la
misma regla. Frontend: ninguna.

## 4. A) R2 — Lo contabilizado no se edita ni se borra

### 4.1 Hallazgos
Ninguna ruta edita ni borra un asiento POSTED, una factura emitida ni un pago contabilizado ✔. Lo de un período
cerrado tampoco se puede anular hoy ✔. **Hueco 1:** anular en un período **abierto** pone VOIDED y saca el asiento de
los libros en su fecha original, sin dejar el movimiento contrario. Ese mes puede estar abierto en el sistema y su
606/607 ya presentado el 15: una factura anulada sale del 607 (`dgii.service.ts:157`) aunque ya se haya declarado.
**Hueco 2:** una factura E se puede anular como si fuera B. **Hueco 3:** `PATCH /tax-rates/:id` altera los borradores
en silencio (R9).

### 4.2 Reglas por llamador (D23 reverso; D34 nota de crédito)
| Llamador | Período del original **abierto** | Período **cerrado** |
|---|---|---|
| Factura B o sin NCF (`invoicing.void`) | Reverso con la fecha original; 608 como hoy. **Excepción: mes ya declarado** → 422 nota de crédito. Desde la Fase 1 se considera declarado si ya pasó el día 15 del mes siguiente; desde la Fase 5 cuenta además `FiscalFiling` | 422: "Esta factura es de un mes cerrado. No se anula: corrígela con una nota de crédito → [Crear nota de crédito]" (hoy ya es 422, sin guía) |
| Factura E (`ncf` empieza con "E") | **Siempre** 422 con nota de crédito (Ley 32-23, art. 7). Solo se anula internamente si su `EcfDocument` está REJECTED | Igual |
| Pago (`payments.void`) | Reverso con la fecha original | 422 como hoy: "Reabre el mes o registra un pago o devolución nuevos" |
| Reapertura de año (asiento `CLOSING`) | **Sin cambio**: sigue marcando VOIDED. Los reportes y presupuestos excluyen `CLOSING`; un reverso REVERSAL no tendría esa exclusión (G1) | — |
| Endpoint de asientos (`accounting.voidJournalEntry`): **solo** `sourceType` MANUAL (incluida la apertura), BANK_TRANSACTION u OTHER (tesorería, sin otra vía de corrección hoy). INVOICE, PAYMENT o YEAR_END_CLOSING → 422 "Este asiento viene de un documento: corrígelo desde la factura o el pago" | Reverso con la fecha original | Solo con `reverseOn` **explícito** en un período abierto; sin él → 422 "Elige la fecha del reverso dentro de un mes abierto" |

**Mecánica (un solo punto de cambio, `posting.voidEntry`, PR propio para el socio):**
Nueva firma: `voidEntry(tx, user, entryId, reason, opts?: { reverseOn?: Date })`. Los llamadores actuales no cambian.
Si `type = CLOSING`: lógica actual. Si el asiento es un `REVERSAL`: 422 "Un reverso no se reversa; registra el asiento
de nuevo". En otro caso crea el reverso: `type = REVERSAL`, `reversalOfId = original`; **mismo
`sourceType`/`sourceId`**, para que el documento muestre los dos; mismo diario; líneas con débito y crédito
intercambiados, con el mismo tercero y centro de costo; número nuevo. El original **queda POSTED**; se le registran
`voidedAt/voidedById/voidReason` (metadatos, sin tocar montos). `writeAudit(VOID)` al original y `POST` al reverso. Si
chocan dos reversos (P2002 sobre el `reversalOfId` único) → 409 "Este asiento ya fue reversado".
`accounting.voidJournalEntry` delega en esa misma lógica. **Pantalla**: "Corregir" ofrece (a) **reversar** y (b)
**reversar y crear una copia precargada** como borrador para editarla (R2: el sistema arma el reverso y el asiento
nuevo). El detalle muestra "Reversado por DG-000145". En una factura de mes cerrado o electrónica, el botón es "Crear
nota de crédito". **Cómo se emite esa nota (N1):** si la clasificación todavía admite B, se crea la B04 como hoy. Pasado el
fin de las B y sin conexión con el proveedor (Fases 3 a 7), el botón guía a "Emítela como E34 en el portal de tu
proveedor y luego importa el XML → [Importar]". La importación la enlaza con la factura original por el NCF modificado.
Lo mismo pasa con los comprobantes que emite la propia empresa en compras (B11/B13 → E41/E43). **Validación en la base de datos**: descartada por ahora (deuda 18.2).

### 4.3 Efectos que se cubren
**Apertura (G2):** `fiscal-year.service.ts:468, :489` agregan `reversedBy: { is: null }` para poder rehacer el asiento
de apertura. **Listado (G5):** `?status=VOIDED` deja de mostrar lo reversado. Se agrega `?reversed=true`; la respuesta
incluye `reversedBy { id, number }` y la etiqueta "Reversado" (archivos del socio: DTO de consultas,
`listJournalEntries`, `labels.ts`). **Conciliación (M6):** los candidatos (`bank-reconciliation.service.ts:96`)
excluyen el par original reversado + reverso cuando ninguno está enlazado, porque se cancelan solos. El bloqueo de
"enlazado a asientos anulados" (`:181`) también cuenta los enlaces a asientos reversados. **Reportes (N4):** los saldos no cambian (original y reverso son POSTED y
suman cero), pero el **libro diario, el mayor y las columnas de débito y crédito de la balanza muestran los dos**;
el manual lo explica. El cierre de año no cambia (G1). **Pruebas del socio
que cambian (G5):** `invoicing-payments.e2e-spec.ts:199` contaba asientos VOIDED; pasa a contar el reverso.
`accounting.e2e-spec.ts:330` esperaba `status VOIDED`; pasa a esperar POSTED con `reversedBy`.
`accounting.e2e-spec.ts:385` usaba `?status=VOIDED` (total 2); pasa a `?reversed=true`. `Reports.e2e-spec.ts:134` y
`:261` ("sin anulados" en el diario y en el mayor) pasan a esperar original y reverso. `entry-approval.e2e-spec.ts:256`
(débito de caja menos 4) pasa a esperar el saldo neto. `fiscal-year.e2e-spec.ts:279`
**no cambia** (el cierre conserva su flujo); qa lo confirma.

## 5. B) R9 — Parámetros fiscales con vigencia

### 5.1 Modelo (tablas globales, sin `companyId`, **solo inserción**)
**`FiscalParameter`**: Campos: `id, key (≤60), revision (Int, 1…), kind (RATE | AMOUNT | DATE | DAYS | FLAG | TABLE |
NONE), value Decimal(19,6)?, valueDate?, valueJson?, unit`, `base?` (solo retenciones: ITBIS | SUBTOTAL | TOTAL),
`validFrom Date, supersedesId?, source (≤300), sourceUrl?, notes?, loadId, createdAt`. Único `(key, validFrom,
revision)`. **No hay `validTo`**: un valor rige hasta el siguiente `validFrom` de la misma clave. "Deja de aplicar" es
una fila `NONE`. **Ninguna fila se modifica ni se borra.** Corregir un valor Por validar = **revisión nueva** con
`supersedesId`. El servicio no tiene métodos de cambio y una e2e lo comprueba. **`FiscalParameterValidation`**
(`parameterId, validatedBy, validatedAt, loadId, note`): el estado **Oficial** sale de que exista una validación con
nombre (la contadora de D33, cargada con el mismo cargador); si no, es **Por validar**, aunque la Guía la marque Oficial. Así validar tampoco modifica la fila. **`FiscalParameterLoad`** (`loadedAt, loadedBy,
fileName, sha256, gitCommit, summary`): registro de cargas (los datos globales no tienen empresa ni usuario para
`AuditLog`). `Holiday` y `FiscalObligation` (8.1) siguen el mismo patrón.

### 5.2 Resolución y fecha mínima
`valueAt(key, date, tx?)`: descarta las filas que tienen sucesora (alguna fila con `supersedesId` igual a su id; N3) y,
de las restantes, toma la de mayor `validFrom ≤ fecha` y mayor `revision`. Usa la fecha UTC del sistema
(`ymd`). Devuelve `{ id, value, base, status, validFrom, source }`. Si no hay valor: 422 "No hay un valor vigente de
'Retención ISR honorarios' para el 14/06/2026; avísanos". **Nunca** hay un valor por defecto escondido en el código.
**Fecha mínima (A3, D38; solo impuestos enlazados):** toda clave que entra en un cálculo debe tener valor desde el **1-ene-2025** (recomendado:
cubre el año 2025 completo y los registros atrasados). El cargador rechaza un catálogo que no lo cumpla. Antes de esa
fecha: 422 "El sistema tiene valores fiscales desde el 01/01/2025". La Fase 0 exige los valores históricos, por
ejemplo las retenciones de alquiler y honorarios antes del 1-jul-2026. **Clave que vale `NONE` en un impuesto enlazado (A3):** 422 "Este impuesto no aplica desde el dd/mm/aaaa (fuente);
quítalo de la línea". **Fecha que se usa:** la de emisión de la factura (`issueDate`), como hoy. **Notas de crédito y débito
(N5):** usan la fecha de la factura que modifican, así heredan su tasa aunque la ley haya cambiado después. **Retener al pagar (A6, D37)** no es un cambio chico, porque hoy la retención se
calcula y contabiliza al emitir. Pasarla al pago movería ese asiento a la contabilización del pago y cambiaría el
saldo de la factura, la vista previa, el 606/607 y sus pruebas (≈1,5–2 semanas). **Se decide antes de la Fase 2.**
Recomendación: mantener la emisión. Si la tasa cambia entre la factura y su pago, se avisa "revisa con tu contadora".

### 5.3 Valores por empresa: el `TaxRate` existente, con base declarada
**1 columna**: `TaxRate.parameterKey String?`. **Enlazado:** el cálculo usa `valueAt` para la **tasa y la base** (A7). Se **ignora la base que mande el cliente** (hoy
`invoicing.service.ts:171` la acepta) y la guardada en el borrador (`:303`): al emitir se recalcula, también en los
borradores creados antes del enlace;
`TaxRate.rate` queda informativo y su `PATCH` da 422; el enlace **rechaza combinaciones incompatibles**: base ITBIS
solo con `ITBIS_WITHHOLDING`; base TOTAL o SUBTOTAL con retenciones; parámetro sin base solo con impuestos de línea.
Por ejemplo, el 2 % de tarjeta (base TOTAL) se calcula sobre el monto aunque el tipo sea `ITBIS_WITHHOLDING`. **Sin
enlazar:** funciona como hoy. Es el **ajuste por empresa**, con el aviso "no se actualiza solo". No se crea una tabla
de excepciones. **Condición "aplica si…" (A5):** el borrador de NG que eximiría de la retención del 30 % a los
emisores e-CF
([DGII](https://dgii.gov.do/publicacionesOficiales/foroContribuyentes/Documents/Borrador-NG-dispone-no-aplicacion-retenciones-ITBIS-NG-02-05-e-CF.pdf))
haría depender la retención del proveedor. **Decisión de diseño:** `FiscalParameter` **no** lleva condiciones
genéricas (sería un motor de reglas). Si la NG se aprueba, se carga una fecha (`RET_ITBIS_30_EXENTA_EMISOR_ECF_DESDE`)
y la condición vive en el código (el comprobante del proveedor empieza con E). Riesgo **Validar** (18.1). **Aviso en
el Panel** mientras haya impuestos sin enlazar o sugerencias sin confirmar (no solo en Impuestos).

### 5.4 Trazabilidad y migración
**Migración aditiva**: tablas nuevas, `TaxRate.parameterKey` y, en modelos del socio: `InvoiceLine.appliedRate
Decimal(9,4)?` y `fiscalParameterId String?`; `InvoiceWithholding.appliedRate` y `fiscalParameterId` (la base ya
existe). `build()` las llena al guardar y al emitir; el detalle de factura muestra `appliedRate` (y la tasa del
maestro solo en facturas viejas sin ese dato). **Ninguna factura emitida se recalcula.** **Enlace propuesto,
confirmado por una persona (P4):** `GET /fiscal/tax-links/suggestions` por tipo, tasa y lado; lo ambiguo no se enlaza
solo. **Plantilla de la v0.2:** la tarea 2.2 de la v0.2 crea los impuestos ya enlazados (sección 15). **Cambios en el
código:** `invoicing.service.ts` `build()`: ≈15 líneas (tasa, base, `appliedRate`, `fiscalParameterId`); `get()`:
incluir `appliedRate`; vista previa: `GET /fiscal/tax-rates/effective?date=` devuelve `{ taxRateId: { rate, base } }`
para `invoice-form.ts` (`:135-153`, `:254`). **Corregir un valor Por validar:** el cargador lista **exactamente** los
documentos emitidos con la fila anterior (por `fiscalParameterId`) para que la contadora decida si hacen falta notas.

### 5.5 Cargador (D25)
Comando: `node dist/fiscal/load-parameters.js <archivo.json> [--dry-run] --commit <hash-git>`. Lo corre devops en el
contenedor, con autorización de Carlos. **`--dry-run`** muestra las diferencias sin aplicar nada. **Formato
estricto:** el esquema se valida en el código y cualquier campo desconocido es un error. Transaccional; **solo
inserta**; guarda el `sha256` y el commit de git del archivo. Archivos fechados en
`docs/normativa-dgii/parametros/AAAA-MM-DD_<tema>.json`, junto a su norma. Pantalla de "operador global": descartada
por ahora (no existe un rol por encima de las empresas).

### 5.6 Catálogo inicial (Guía contable, sección 3; cada clave de cálculo con valor desde la fecha mínima)
La columna dice el **estado en la Guía**. En el sistema todo entra **Por validar** hasta la validación con nombre (5.1).
| Clave | Valor y vigencia | Estado en la Guía |
|---|---|---|
| `ITBIS_TASA_GENERAL` / `_REDUCIDA` / `_EXPORTACION` | 18 % / 16 % / 0 % | Oficial |
| `RET_ITBIS_SERVICIOS_PJ` (base ITBIS) · `_PERSONA_FISICA`, `_SEGURIDAD_LIMPIEZA_TRANSPORTE`, `_INFORMALES` (base ITBIS) · `_TARJETA` (base TOTAL, la confirma la contadora con D37) | 30 % · 100 % · 2 % | Oficial |
| `RET_ITBIS_RST` | 100 % | Validar |
| `RET_ISR_ALQUILER_PF`, `RET_ISR_HONORARIOS_PF` (base SUBTOTAL) | Valor desde 1-ene-2025 (**la Fase 0 lo exige**) y 15 % desde 1-jul-2026 | Validar |
| `RET_ISR_PAGOS_ESTADO` · `RET_ISR_EXTERIOR_DIGITAL` | Histórico + 5 % · 15 % desde 1-jul-2026 | Validar |
| `RET_ISR_DIVIDENDOS` · `ISR_PJ_TASA` · `ISA_TASA` | 10 % · 27 % · 1 % | Oficial |
| `ISR_PJ_TASA_GRANDES` | 30 % (2026–2028) | Validar |
| `IMP_CHEQUES_TRANSFERENCIAS` (solo se carga; se usa en la v1.0) | 0,15 %; 0,20 % desde 3-jul-2026 | Oficial (las fuentes anotan una discrepancia: `fuentes/...` línea 130) |
| `F607_UMBRAL_DETALLE_CONSUMO`, `ECF_RFCE_UMBRAL_E32` | RD$250.000 | Validar |
| `F607_NO_ENVIAR_SI_100_ECF`, `F607_MIXTO_SOLO_B`, `F608_EXCLUYE_ECF` (FLAG) | **0 = conservador** (se envía, con nota) | Validar (D35) |
| `NCF_B_ULTIMO_DIA_GRANDE_NACIONAL` | Lo da la Fase 0 | Validar |
| `NCF_B_ULTIMO_DIA_GRANDE_LOCAL_MEDIANO` | 31-oct-2026 | Oficial |
| `NCF_B_ULTIMO_DIA_PEQUENO_MICRO_NC` | 15-nov-2026 o el 14 (ver nota) | Validar |
| `ECF_CONTINGENCIA_MAX_HORAS` · `NCF_B_CONTINGENCIA_MAX_DIAS` · `ECF_REGULARIZACION_DIAS` | 72 · 15 · 30 (Decreto 587-24, arts. 40-43 y 55, según `fuentes/...` líneas 224 y 251) | Validar |
| `ECF_AVISO_ROJO_HORAS` | 48 (umbral del producto, no legal) | — |
| `IT1_MAPA_CASILLAS`, `IR17_MAPA_CASILLAS` (TABLE) | Formulario vigente | Validar (bloquea la Fase 6) |

**Nota (M3):** el Aviso 06-26 (guardado en `docs/normativa-dgii/`) da "seis (6) meses contados a partir del 15 de
mayo de 2026". La Guía 3.7 dice "hasta el 15-nov-2026" (Oficial) y su sección 9 dice "desde el 15-nov-2026". La
fecha es oficial; lo que no está claro es **si el 15 todavía admite B**. Se carga como Validar y, cuando la contadora
confirme, se actualiza la Guía 3.7 según su sección 10.

## 6. C) Ficha fiscal de la empresa

**Tabla aparte 1 a 1**, `CompanyFiscalProfile` (`companyId @unique`), con: `dgiiClassification` (GRANDE_NACIONAL,
GRANDE_LOCAL, MEDIANO, PEQUENO, MICRO, NO_CLASIFICADO); `taxRegime` (ORDINARIO, RST); `legalForm` (Ley 479-08: SRL,
SA, SAS, EIRL, SNC, SCS, SCA, PERSONA_FISICA, OTRA); `accountingFramework` (NIIF_PYMES, NIIF_COMPLETAS) y
`frameworkAdoptionDate`; `ecfEmitterSince?`, `isWithholdingAgent`, `updatedById`, `updatedAt`. Toca el modelo del
socio solo con 1 línea de relación en `Company`. **Cierre:** se deriva de `fiscalYearStartMonth`. Si no es uno de los
permitidos, se avisa sin bloquear. **Ficha en blanco o incompleta:** aviso **permanente** en el Panel: "Completa los
datos fiscales de tu empresa para saber qué te toca → [Completar]". Endpoints: `GET /fiscal/profile` (todos) y `PUT`
(ADMIN) con `writeAudit`. Pantalla `/company/fiscal`, enlazada desde "Empresa" (1 línea), con ayuda pensada para el
dueño en cada campo.

## 7. D) e-CF

### 7.1 Qué se hace sin proveedor (Fase 4) y qué espera (Fase 7)
**Fase 4:** **Bloqueo R2** (4.2). **Estado mínimo** `EcfDocument`. **Importación de XML** (7.4). **Notas y comprobantes propios (N1):** las E34/E33 y las E41/E43 siguen el mismo camino (portal + importación). **Venta E sin
conexión:** emitir una venta E desde el sistema sin conexión activa con el proveedor da 422: "Para emitir e-CF desde
el sistema falta conectar tu proveedor. Mientras tanto, emite en su portal e importa el XML aquí → [Importar]". Así
nunca queda un e-CF emitido que nadie envía. **Fase 7 (bloqueada por 7.5 y por la documentación técnica de 0.2):**
armador del documento, adaptador, cola, trabajador y contingencia.

### 7.2 Modelo
**Fase 4, `EcfDocument`:** `id, companyId, invoiceId @unique, ecfType, eNcf, status, origin (EMITTED | IMPORTED),
verification (UNVERIFIED | VERIFIED), issuerRnc, securityCode?, xmlFileUrl?`, fechas. Índice `(companyId, status)` y
**único `(companyId, issuerRnc, eNcf)`** (N7). `Invoice` solo tiene `@@index([companyId, ncf])`, sin único: si dos
importaciones simultáneas traen el mismo e-CF, la segunda choca con ese único dentro de la transacción (P2002 → 409).
**`EcfStatus`:** se define completo desde ya (IMPORTED, PENDING_SEND, SENDING, ACCEPTED, ACCEPTED_CONDITIONAL,
REJECTED, CONTINGENCY, VOID_UNUSED) para evitar `ALTER TYPE` después. **Siempre en la misma transacción que la factura
(A9):** la importación crea factura + `EcfDocument IMPORTED`; en la Fase 7, `issueTx` crea `PENDING_SEND` (≈2 líneas).
**No hay sondeo** de facturas sin documento: el trabajador lee por `(status, nextAttemptAt)` con índice. **Fase 7,
además:** `EcfEvent`, `EcfConnection` (credenciales cifradas como `BankConnection.credentialsEnc`, nunca en
respuestas) y los campos de envío (`trackId`, `attempts`, `nextAttemptAt`, `lastError`, `contingencySince`).

### 7.3 Interfaz del adaptador (diseño a confirmar con la documentación del proveedor; Fase 7)
```ts
export interface EcfProvider {
  readonly code: string;
  readonly numbering: 'OURS' | 'PROVIDER';
  send(doc: EcfPayload, ctx: EcfContext): Promise<EcfSendResult>;
  status(ref: EcfRef, ctx: EcfContext): Promise<EcfStatusResult>;
  voidUnused(r: { ecfType: string; from: string; to: string }, ctx: EcfContext): Promise<EcfVoidResult>; // ANECF
  listReceived?(since: Date, ctx: EcfContext): Promise<EcfReceived[]>;
  printable?(ref: EcfRef, ctx: EcfContext): Promise<Buffer>;
}
```
- `EcfPayload`: nuestro documento común con los nombres de la estructura de la DGII (`Encabezado/IdDoc`, `Emisor`,
  `Comprador`, `Totales`, `DetallesItems`, `InformacionReferencia`), con el redondeo del ITBIS según el XSD (R7).
- La firma, el token, el RFCE y los acuses los hace el proveedor (Guía 3.7).

### 7.4 Importar XML e-CF (Fase 4; D28, D36, D40)
`POST /ecf/import` (ADMIN, ACCOUNTANT). **Límites:** hasta **10 archivos** por envío, ≤1 MB cada uno, procesados **uno
por uno** (`mem_limit 768m`). **Lectura segura:** si el archivo contiene `<!DOCTYPE` o `<!ENTITY`, se rechaza
**antes** de leerlo; `fast-xml-parser` con `processEntities: false`, sin DTD y con tope de profundidad (≤30 niveles)
verificado con una **revisión propia previa**, porque no consta que `fast-xml-parser` limite la profundidad (seguridad lo comprueba
en la versión fijada). La subida es **multipart** con límites de multer (`files: 10`, `fileSize: 1 MB`), como en
`chart-of-accounts.controller.ts:26`. El tope JSON de 100 KB (`app.setup.ts:43`) no aplica, y la confirmación envía solo
el id de la importación preparada en el servidor. **Validaciones:** el RNC emisor o el receptor es el de la empresa; tipo E31–E47; duplicados: compras por
RNC + e-NCF; ventas por e-NCF de la empresa (409); los totales cuadran. **Choques de e-NCF en ventas (G7, N7, D36):** la regla se basa en la **conexión con el proveedor**, no en la secuencia.
Sin conexión (Fases 3 a 7) no se emite E desde el sistema y todo se importa. Con conexión, importar ventas de los tipos
que emite el sistema da 422 "Tus E31 se emiten desde el sistema; no se importan". La opción interna "e-NCF ya asignado" de `issueTx` (≈6 líneas) **solo**
la usa la importación y vuelve a comprobar esa regla. **Vista previa:** muestra cliente o proveedor (se crea con el
diálogo de la v0.2), los impuestos sugeridos con los enlazados y el asiento. Al confirmar, la factura y el
`EcfDocument` se guardan en la misma transacción, con el XML guardado (R12). **Sin verificar (A8):** el sistema no
comprueba la firma, así que un XML inventado podría entrar como compra con ITBIS adelantado. Por eso: todo importado
queda **"No verificado con la DGII"**, visible en la factura y en la revisión del mes ("ITBIS adelantado de
comprobantes no verificados: RD$X en N facturas"); la verificación (firma XMLDSig o consulta a la DGII por e-NCF +
código de seguridad) es **D40**.

### 7.5 Contingencia (Fase 7) y lo que bloquea
**Contingencia según las fuentes del repo** (Decreto 587-24, arts. 40-43; fin de las B, art. 55; todo **Validar**): sin conexión: se emite y
se envía en ≤72 h, con la leyenda "e-CF emitido en modalidad de contingencia"; si no se puede emitir e-CF: secuencias
B autorizadas ≤15 días, **notificar a la DGII** y regularizar con e-CF en ≤30 días; si la caída es de la DGII: se
guarda y se envía al restablecerse. Los plazos salen de 5.6. El aviso del Panel se pone en rojo a las
`ECF_AVISO_ROJO_HORAS`. **Lo que bloquea la Fase 7**, que Carlos debe conseguir del proveedor: API documentada y
ambiente de pruebas antes de firmar; quién numera los e-NCF; credenciales por empresa o de integrador; quién custodia
el .p12; descarga de XML emitidos y recibidos; aprobación comercial; precio, contrato y dónde guardan los datos;
autorización vigente de la DGII. Se suma la documentación técnica e-CF de la DGII (XML/XSD vigentes), marcada como
pendiente en `docs/normativa-dgii/README.md`.

## 8. E) Calendario fiscal y avisos (R11, R8) — Fase 5

### 8.1 Datos
Los datos globales tienen vigencia y estado y se cargan con el cargador de 5.5.
**`FiscalObligation`:** `code, name, ownerText, frequency, rule (DAY_OF_NEXT_MONTH | DAYS_AFTER_FY_END | FIXED_DATE),
ruleValue, appliesWhen Json`, vigencia, estado y fuente. Carga inicial: día 10: IR-3 e IR-17; día 15: 606 a 609 y
anticipos; día 20: IT-1; 120 días después del cierre: IR-2 e ISA. **Quedan fuera:** la TSS (hasta que haya nómina; la
contadora confirma la fecha) y lo del RST (hasta que la contadora lo confirme). Mientras, el sistema dice "tu régimen
tiene fechas propias". **`Holiday`:** feriados cargados año por año, **nunca calculados** (Ley 139-97). Desde el 1-dic
se avisa si falta el año siguiente. **`FiscalFiling`** (por empresa): `obligationCode, period, filedAt, filedById,
reference?, snapshot Json?`. Además de quitar el aviso, **bloquea anular** facturas de un mes ya declarado (4.2).

### 8.2 Cálculo
`occurrences(company, from, to)` combina las reglas vigentes con la ficha y corre cada vencimiento al siguiente día
laborable. Marca cada obligación como Presentada, Pendiente o Vencida y dice **qué falta**. Prueba unitaria con un día
20 en domingo, un día 15 en feriado seguido de sábado y un IR-2 con cierre al 30-jun.

### 8.3 Avisos y bloqueo de las B
`GET /fiscal/alerts` alimenta el bloque `.alerts` del Panel con: obligaciones de la semana; "Te quedan 40 comprobantes
B01"; vencimiento de secuencias (30 días antes); fin de las B por clasificación (45 días antes); ficha incompleta e
impuestos sin enlazar (permanentes); XML no verificados. **Bloqueo (D24, G8):** se rechaza una venta con secuencia B
si **la fecha de la factura o la fecha real** (hoy) es posterior al último día válido de la clasificación. La misma
función revisa el vencimiento de la secuencia también contra hoy, porque `ncf.service.ts:64,71` solo mira `issueDate`.
Es 1 llamada desde `issueTx`. **Contingencia registrada por el ADMIN:** con motivo, plazo máximo de
`NCF_B_CONTINGENCIA_MAX_DIAS` (no lo dice la Guía 3.7; viene del Decreto 587-24 según las fuentes) y recordatorio de
notificar a la DGII y regularizar. Sin clasificación cargada: solo se avisa. **Endpoints:** GET `/fiscal/calendar` y
`/fiscal/alerts` (todos); POST `/fiscal/filings` (ADMIN, ACCOUNTANT); DELETE `/fiscal/filings/:id` (ADMIN, queda en la
bitácora); POST y DELETE `/fiscal/b-contingency` (ADMIN).

## 9. F) R10 — Cuadres (Fase 4) y 609, IT-1 e IR-17 asistidos (Fase 6)

### 9.1 Ajustes a 606/607/608 (`dgii.service.ts`, ≈30 líneas)
El umbral del consumo sale del parámetro. **e-CF (D35):** con las banderas en 0 (conservador), **todo sigue como hoy**
y aparece la nota "Si eres 100 % electrónico, puede que no tengas que enviarlo; confírmalo con tu contadora". Si la
contadora pone las banderas en 1: `F607_NO_ENVIAR_SI_100_ECF`: "Este mes no tienes que enviarlo", con el TXT
disponible igual; `F607_MIXTO_SOLO_B`: el TXT lleva solo las B y las E se muestran aparte; `F608_EXCLUYE_ECF`: el 608
excluye las E. **El 606 no se toca.** La frase "el emisor electrónico solo reporta en el 606 los B recibidos" queda
como Validar, sin efecto en el código. **ITBIS proporcional (D32):** solo se avisa.

### 9.2 609 e IT-1/IR-17 (Fase 6)
**609** (`src/dgii-returns`): fuente: compras B17/E47 o a proveedores con país ≠ DO, con su retención; columnas y
tipos de renta según el **instructivo oficial** (bloquea); tipo de renta desde el `dgiiCode` de la retención; si el
instructivo lo pide sin retención, tabla lateral `InvoiceFiscalExtra`; mismo contrato que el socio (`rows, errors,
warnings, canExport, assumptions`, TXT). **Hojas IT-1 e IR-17:** casilla por casilla, con el origen de cada valor y
enlace; **no se genera archivo**: se llenan en la Oficina Virtual; el mapa de casillas es un parámetro con vigencia y
lo valida la contadora (bloquea); saldo a favor tomado del `snapshot` del mes anterior; se exportan a PDF y Excel.

### 9.3 Cuadres previos y revisión del mes (Fase 4)
| Cuadre | Compara (**netos** del mes, incluidas las notas de crédito) | Si no cuadra |
|---|---|---|
| 607 ↔ mayor | ITBIS neto del 607 (facturas − notas) contra el saldo neto (crédito − débito) del mes de las cuentas `salesAccountId` de los ITBIS de venta | Diferencia y asientos que la explican ("asiento manual DG-000123") |
| 606 ↔ crédito de ITBIS | ITBIS por adelantar neto del 606 contra el neto (débito − crédito) de las cuentas `purchaseAccountId` | Igual |
| Cuenta de ITBIS compartida por ventas y compras | Detectada: el cuadre se hace sobre el neto conjunto y se advierte "usa cuentas separadas para un cuadre exacto" | Aviso |
| Retenciones | Retenciones del 606 contra las cuentas de retenciones por pagar | Igual |
| Secuencias | Huecos en NCF propios (R8) | "Falta el B0100000052" |
| Importados | e-CF no verificados (7.4) | Monto y lista |

`GET /dgii-returns/review?period=` junta errores, avisos y cuadres, cada uno con un botón "Corregir". Es el paso 9 del
cierre mensual y lo usa el cierre guiado de la v0.2. Tolerancia 0; los centavos de redondeo se muestran con la cuenta
de redondeo (R7). La comparación 607 ↔ IT-1 entra en la Fase 6, con la hoja del IT-1.

## 10. Permisos y aislamiento

| Acción | ADMIN | ACCOUNTANT | APPROVER | VIEWER | AUDITOR |
|---|---|---|---|---|---|
| Ver valores, calendario, avisos, hojas, revisión, estado e-CF | Sí | Sí | Sí | Sí | Sí |
| Cambiar valores fiscales globales | **Nadie por API** (solo el cargador) | | | | |
| Enlazar o desenlazar impuestos | Sí | Sí | No | No | No |
| Ficha fiscal; contingencia de las B; conexión e-CF; ANECF | Sí | No | No | No | No |
| "Ya lo presenté" / deshacer | Sí / Sí | Sí / No | No | No | No |
| Importar XML; reintentar e-CF | Sí | Sí | No | No | No |
| Corregir (reversar) | Igual que hoy `void` (ADMIN, APPROVER) | | | | |

Las tablas globales son de solo lectura por API. Lo de empresa usa el `companyId` del token y responde 404 a lo ajeno.
`security.e2e-spec.ts` debe seguir en verde.

## 11. Pantallas (P7; checklists de la Guía de producto, sección 6, y de la contable, sección 8)

| Pantalla | Archivo [front] | Fase |
|---|---|---|
| Asiento: "Corregir" (reversar / reversar y copiar), "Reversado por", filtro "Reversados" | `ledger/entry-detail.ts`, `ledger/entries.ts` (socio) | 1 |
| Factura: "Crear nota de crédito" si es de mes cerrado o E; tasa aplicada; estado e-CF | `sales/invoice-detail.*` (socio) | 1, 2, 4 |
| Valores fiscales vigentes (historial, revisiones, Oficial/Por validar, exportar para la contadora) | `features/fiscal/parameters.ts` | 2 |
| Impuestos con enlace y base | `catalog/tax-rates.ts` (socio) + `features/fiscal/tax-link-dialog.ts` | 2 |
| Datos fiscales | `features/fiscal/fiscal-profile.ts` | 2 |
| Vista previa del ITBIS y la retención a la fecha | `sales/invoice-form.ts` (socio) | 2 |
| 2FA (activar, entrar con código, recuperación) y "Exportar todos mis datos" | Según el anexo 2FA | 3 |
| Importar XML e-CF; revisión del mes con cuadres | `features/ecf/ecf-import.ts`, `reporting/dgii-returns.ts` + pestaña en `dgii.html` (socio) | 4 |
| Calendario; avisos en el Panel | `features/fiscal/calendar.ts`, `dashboard/fiscal-alerts.ts` + 1 línea en `dashboard.html` | 5 (avisos de ficha y enlaces: 2) |
| 609, IT-1, IR-17 | `reporting/dgii-returns.ts` | 6 |
| Bandeja e-CF y conexión | `features/ecf/ecf-inbox.ts`, `ecf-connection.ts` | 7 |

Requisitos de todas las pantallas:
migas, propósito, siguiente paso, estado vacío que enseña y "?" con su sección (`verificar-ayuda` en verde); errores
con "cómo arreglarlo" y montos con `money`; estados con ícono, color y texto ("Oficial", "Por validar", "No
verificado", "Reversado"); uso a 375 px y con teclado; prueba de usuario nuevo con perfil de dueño y de contadora; lo
que bloquea una regla fiscal se explica en lenguaje sencillo.

Menú (PLAN-v0.2 9.4): Reportes suma "Declaraciones DGII" y "Calendario fiscal"; Configuración suma "Valores
fiscales", "Datos fiscales" y "Facturación electrónica".

## 12. Fases y tareas

**Flujo de cada fase:** arquitecto → revisor-critico → **Carlos aprueba** → dev → qa → seguridad → documentador →
revisor-critico final → despliegue en pruebas (con respaldo previo) → PR al socio.
**Tamaños:** S = horas · M ≈ 1 día · L = 2–3 días. Solo datos ficticios hasta cerrar la Fase 3.

### Fase 0 — Preparación y bloqueos declarados · efectivo ≈0,5 sem · calendario ≈1–2 sem
| # | Agente (modelo) | Tarea | Tam. |
|---|---|---|---|
| 0.1 | documentador (Sonnet) + contadora | Valores de 5.6 **desde la fecha mínima (D38)** con su fuente: históricos de retenciones, fin de las B (incluidos Grandes Nacionales y el 15-nov), umbrales, banderas 607/608, contingencia, retención al emitir o al pagar (D37) y base TOTAL del 2 % de tarjeta, RST, TSS | M |
| 0.2 | Carlos | Descargar desde el navegador: instructivos 606/607/608/**609**, IT-1, IR-17, feriados 2026–2027 y la **documentación técnica e-CF (XML/XSD) vigente** (bloquea la Fase 7). Se guardan en `docs/normativa-dgii/` con fecha y SHA-256 | — |
| 0.3 | Carlos | Enviar al proveedor las preguntas de 7.5 | — |
| 0.4 | contadora | Mapas de casillas IT-1/IR-17 (bloquean la Fase 6); flujo de e-CF rechazado | — |
| 0.5 | arquitecto (Opus) | Anexo 2FA y exportación (revisado por revisor-critico y seguridad **antes** de la Fase 3); D33; actualizar la tarea 0.3 de `docs/PLAN-v0.2.md` (copia externa) para que apunte a la Fase 3 de la v0.3 | M |

### Fase 1 — R2: corregir sin borrar · efectivo ≈1,5 sem · calendario ≈2 sem
**El frontend (1.4) se despliega junto con el backend:** sin eso, la pantalla vieja mostraría los reversados como POSTED sin aviso.
| # | Agente (modelo) | Tarea | Tam. |
|---|---|---|---|
| 1.1 | dev-backend (**Opus**) | `voidEntry` con reglas por llamador (4.2): CLOSING intacto, prohibido reversar un REVERSAL, 409 ante P2002; endpoint de asientos limitado por `sourceType` (N2); mes declarado = pasó el día 15 siguiente (N6); `voidJournalEntry` con `reverseOn`; 422 de nota de crédito en facturas | L |
| 1.2 | dev-backend (**Opus**) | Apertura (4.3), `?reversed=true`, conciliación (candidatos y bloqueo) | M |
| 1.3 | dev-backend (**Opus**) | e2e `immutability.e2e-spec.ts` (13); ajustes de las 3 pruebas del socio (4.3); suite completa | M |
| 1.4 | dev-frontend (Sonnet) | "Corregir" (reversar / reversar y copiar), "Reversado por", filtro; "Crear nota de crédito" con su guía a portal + importación cuando no hay B (N1) | M |
| 1.5 | qa (Sonnet) · seguridad (Opus) · documentador (Sonnet) | Suite, balanza antes y después, usuario nuevo "corregir un asiento" · barrido de PATCH/DELETE · manual 06 | S c/u |

### Fase 2 — R9 + ficha fiscal · efectivo ≈2,5 sem · calendario ≈3 sem
**Requisitos:** 0.1 entregado y **D37 decidida**. Lo no validado se carga como Por validar.
| # | Agente (modelo) | Tarea | Tam. |
|---|---|---|---|
| 2.1 | dev-backend (**Opus**) | Migración (parámetros inmutables, validaciones, cargas, ficha, `parameterKey`, `appliedRate`/`fiscalParameterId`); `valueAt` | M |
| 2.2 | dev-backend (**Opus**) | Cargador: `--dry-run`, esquema estricto, solo inserción, fecha mínima, commit, informe por `fiscalParameterId` | L |
| 2.3 | devops (Sonnet) | Catálogo inicial JSON; carga en pruebas; paso a paso | S |
| 2.4 | dev-backend (**Opus**) | `build()` con tasa y base del parámetro y trazabilidad; `get()` con `appliedRate`; 422 en `PATCH` de tasa enlazada; umbral del 607 | M |
| 2.5 | dev-backend (Sonnet) | Sugerencias y enlace con compatibilidad de base; `effective?date`; ficha; avisos de ficha y enlaces | M |
| 2.6 | dev-backend (**Opus**) | e2e `fiscal-parameters.e2e-spec.ts` (13) | M |
| 2.7 | dev-frontend (Sonnet) | Valores fiscales; Impuestos; Datos fiscales; vista previa; tasa aplicada en el detalle | L |
| 2.8 | qa (Sonnet) · seguridad (Opus) · documentador (Sonnet) | Junio/julio, base del 2 %, usuario nuevo · cargador y tablas de solo lectura · manual 02 y `OPERACION.md` | M · S · M |

### Fase 3 — Puerta de datos reales (obligatoria, D29) · efectivo ≈2,5 sem · calendario ≈5 sem (semanas 6–11)
**Requisitos:** anexo 2FA aprobado (0.5); D17 y D18 de la v0.2 decididas (destino de la copia externa y frase secreta).
**En dos entregas (N8):**
- **3a (semanas 6–9):** backend (3.1, 3.2) y devops (3.3), con qa e2e, seguridad del backend y su PR.
- **3b (semanas 9–11):** pantallas (3.4), primeras en la fila del frontend, con prueba de usuario nuevo, seguridad del
  flujo completo y su PR.

**La puerta se abre** (datos reales permitidos) solo cuando 3b está aprobada, con la auditoría de seguridad y el sí de Carlos.
| # | Agente (modelo) | Tarea | Tam. |
|---|---|---|---|
| 3.1 | dev-backend (**Opus**) | 2FA según el anexo (activar, verificar, códigos de recuperación, obligatorio para ADMIN si Carlos lo decide), con bitácora | L |
| 3.2 | dev-backend (**Opus**) | Exportación completa por empresa (datos, adjuntos y XML), también al cancelar; solo ADMIN, con bitácora | L |
| 3.3 | devops (Sonnet) | Copia externa **real** cifrada (PLAN-v0.2 11.2: cifrado, `OFFSITE_CMD`, aviso de fallo), con restauración ensayada desde la copia externa | M |
| 3.4 | dev-frontend (Sonnet) | Pantallas de 2FA y exportación | M |
| 3.5 | qa (Sonnet) · seguridad (Opus) · documentador (Sonnet) | e2e de 2FA y exportación; restauración · auditoría completa y verificación de la regla de datos reales · manual y paso a paso para Carlos | M · M · M |

### Fase 4 — e-CF mínimo, importación de XML y cuadres · efectivo ≈2,5 sem · calendario ≈3 sem
| # | Agente (modelo) | Tarea | Tam. |
|---|---|---|---|
| 4.1 | dev-backend (**Opus**) | `EcfDocument` (enum completo); bloqueo R2 de E; 422 para venta E sin conexión | M |
| 4.2 | dev-backend (**Opus**) | Importación (7.4): lectura segura, 10 archivos en secuencia, D36, e-NCF ya asignado, misma transacción, "No verificado" | L |
| 4.3 | dev-backend (**Opus**) | Ajustes 606/607/608 (9.1); cuadres netos y `review` (9.3) | L |
| 4.4 | dev-backend (Sonnet) | e2e `ecf-import.e2e-spec.ts` y `dgii-review.e2e-spec.ts` (13) | M |
| 4.5 | dev-frontend (Sonnet) | Importar XML; revisión del mes; marcas "No verificado" | L |
| 4.6 | qa (Sonnet) · seguridad (Opus) · documentador (Sonnet) | XML malformados, ajenos y con DOCTYPE; 10 archivos con memoria medida · XXE, profundidad, versión y `npm audit` · manual de importación y cuadres | M · M · M |

### Fase 5 — Calendario y avisos · efectivo ≈1,5 sem · calendario ≈2 sem
| # | Agente (modelo) | Tarea | Tam. |
|---|---|---|---|
| 5.1 | dev-backend (**Opus**) | `FiscalObligation`, `Holiday`, `FiscalFiling`; `occurrences` y prueba unitaria; bloqueo de anulación con mes declarado | L |
| 5.2 | dev-backend (**Opus**) | Bloqueo de las B con fecha real y contingencia (D24) | M |
| 5.3 | dev-backend (Sonnet) | `alerts`, presentaciones, e2e `fiscal-calendar.e2e-spec.ts` | M |
| 5.4 | dev-frontend (Sonnet) | Calendario; avisos en el Panel | M |
| 5.5 | qa (Sonnet) · documentador (Sonnet) | Oct-2026 a mar-2027 a mano con la contadora · manual del calendario | M · S |

### Fase 6 — 609, IT-1 e IR-17 · efectivo ≈1,5 sem · calendario ≈2 sem
**Requisitos:** instructivo 609 y mapas de casillas validados.
| # | Agente (modelo) | Tarea | Tam. |
|---|---|---|---|
| 6.1 | dev-backend (**Opus**) | 609 + TXT; hojas IT-1/IR-17; saldo a favor; cuadre 607 ↔ IT-1; exportación | L |
| 6.2 | dev-backend (Sonnet) · dev-frontend (Sonnet) | e2e `dgii-returns.e2e-spec.ts` · pantallas | M · L |
| 6.3 | qa (Sonnet) + contadora · documentador (Sonnet) | Un mes ficticio por el **prevalidador oficial** · manual 08 | M · M |

### Fase 7 — e-CF con el proveedor · efectivo ≈2,5 sem · **bloqueada** (7.5 y documentación técnica de 0.2)
| # | Agente (modelo) | Tarea | Tam. |
|---|---|---|---|
| 7.1 | dev-backend (**Opus**) | `EcfPayloadBuilder` contra el XSD (redondeo R7); `EcfEvent`, `EcfConnection`; `PENDING_SEND` en `issueTx` | L |
| 7.2 | dev-backend (**Opus**) | Adaptador real + `FakeEcfProvider`; trabajador por índice; reintentos; contingencia completa (7.5); ANECF | L |
| 7.3 | dev-frontend (Sonnet) | Bandeja, conexión, estados, avisos | M |
| 7.4 | qa (Sonnet) · seguridad (Opus) | Ciclo completo contra el ambiente de pruebas del proveedor, con reloj simulado · credenciales, certificado, tráfico saliente | M · M |

### Fase 8 — Cierre de la v0.3 · efectivo ≈0,5 sem
qa: suite completa sobre una base nueva y restauración. revisor-critico: revisión contra las dos guías y este plan.
seguridad: release y regla de datos reales. documentador: notas de versión.

## 13. Pruebas que debe hacer qa (e2e con vitest, esqueleto de `financial-ratios.e2e-spec.ts`)

- **`immutability.e2e-spec.ts` (F1):** Factura B en mes abierto → reverso con la fecha original, balanza igual y 608
  como hoy. Factura en mes cerrado → 422 con el texto de nota de crédito. Factura E → 422 siempre. Pago en mes cerrado
  → 422. Asiento manual en mes cerrado: sin `reverseOn` → 422; con `reverseOn` abierto → reverso. Asiento de una factura o de un
pago por el endpoint de asientos → 422 (N2). Factura de un mes abierto cuyo día 15 siguiente ya pasó → 422 nota de crédito (N6). Reversar un REVERSAL
  → 422; dos reversos simultáneos → uno pasa y el otro da 409. Reapertura de año → el cierre queda VOIDED como hoy y
  los reportes no cambian. Apertura reversada → se puede crear otra. `?reversed=true`. Conciliación: pago reversado +
  su reverso no aparecen como pendientes, y un enlace a un asiento reversado bloquea. `AuditLog` en cada caso.
- **`fiscal-parameters.e2e-spec.ts` (F2):** Claves `TEST_*`: 15-jun usa el valor viejo y 15-jul el nuevo; un borrador
  de junio emitido en julio usa junio. Antes de la fecha mínima → 422. `appliedRate` y `fiscalParameterId` guardados.
  Revisión nueva: las facturas viejas conservan su fila y el informe las lista. **Ninguna fila cambia** (comparación
  antes y después de cada carga); `--dry-run` no escribe nada. Campo desconocido → rechazo. El 2 % de base TOTAL se
  calcula sobre el monto; enlace incompatible → 422; PATCH de tasa enlazada → 422. Facturas previas a la migración
  idénticas. Ficha solo ADMIN; empresa B intacta.
- **`ecf-import.e2e-spec.ts` (F4):** Compra válida → factura + `EcfDocument IMPORTED` "No verificado" en una
  transacción. Venta de un tipo con secuencia activa → 422 (D36); e-NCF duplicado → 409; RNC ajeno → 422.
  `<!DOCTYPE`/entidades → rechazado sin leer; profundidad > 30 → rechazado; 11 archivos → 400; > 1 MB → 413. Anular un
  E importado → 422; venta E sin conexión → 422. **Camino N1:** pasado el fin de las B, "Crear nota de crédito" de una B01
  no crea una B04 (422 con la guía) y una E34 importada queda enlazada a la B01 y la acredita; igual con E41/E43. Dos
  importaciones simultáneas del mismo e-CF → una pasa y la otra da 409. Nota de crédito de una factura de junio-2026 →
  tasa de junio (N5). Base enviada por el cliente en un impuesto enlazado → se ignora (A7).
- **`dgii-review.e2e-spec.ts` (F4):** Banderas en 0 → 607/608 como hoy, con nota; en 1 → comportamiento de 9.1; el 606
  no cambia. Una nota de crédito no genera una falsa diferencia en el cuadre neto. Un asiento manual en ITBIS por
  pagar → señalado con su número. Cuenta compartida → aviso; hueco de NCF → aviso.
- **`fiscal-calendar.e2e-spec.ts` (F5):** Cierres en diciembre y junio contra la tabla a mano. "Ya lo presenté" quita
  el aviso y bloquea anular facturas de ese mes. B01 del 1-nov-2026 de una GRANDE_LOCAL → 422, **también con
  `issueDate` del 31-oct escrita el 1-nov**. Secuencia vencida con fecha atrasada → 422. Contingencia ≤ el máximo →
  ok; al día siguiente del máximo → 422.
- **`dgii-returns.e2e-spec.ts` (F6):** 609 con su fila; hoja IT-1 igual al cálculo a mano.

## 14. Archivos existentes del socio que se modifican

| Archivo | Cambio | Fase | Riesgo |
|---|---|---|---|
| `prisma/schema.prisma` | Modelos nuevos al final; `TaxRate.parameterKey`; `InvoiceLine`/`InvoiceWithholding` + `appliedRate`, `fiscalParameterId`; relaciones en `Company`; campos 2FA en `User` (según el anexo) | 2–4 | Medio |
| `src/app.module.ts` | Módulos nuevos | 2–6 | Bajo |
| `src/posting/posting.service.ts` | `voidEntry`: reverso, CLOSING intacto, `reverseOn` | 1 | **Alto**: lo usan factura, pago y cierre |
| `src/modules/accounting/accounting.service.ts` + `dto/void-journal-entry.dto.ts` + `dto/accounting-queries.dto.ts` | Delegar el reverso; `reverseOn`; `?reversed=true` y `reversedBy` en el listado | 1 | Medio |
| `src/fiscal-year/fiscal-year.service.ts` | `:468`, `:489` excluyen la apertura reversada | 1 | Bajo |
| `src/treasury/bank-reconciliation.service.ts` | `:96` candidatos; `:181` bloqueo | 1 | Medio |
| `src/invoicing/invoicing.service.ts` | 422 de nota de crédito; `build()` (≈15 líneas); `get()`; revisión de las B (1); e-NCF ya asignado (≈6); `PENDING_SEND` (F7, ≈2) | 1–7 | **Alto**: archivo central |
| `src/receivables-payables/payments.service.ts` | Ninguno (sigue llamando a `voidEntry`); qa lo confirma | — | — |
| `src/masters/tax-rates/tax-rates.service.ts` + DTO | 422 en tasa enlazada; `parameterKey` | 2 | Bajo |
| `src/dgii/dgii.service.ts`, `dgii.codes.ts` | Umbral; banderas e-CF | 2, 4 | Medio |
| `src/auth/*`, `src/users/*` | 2FA (según el anexo) | 3 | **Alto** (inicio de sesión) |
| **Pruebas:** `test/invoicing-payments.e2e-spec.ts:199`, `test/accounting.e2e-spec.ts:330, :385`, `test/Reports.e2e-spec.ts:134, :261`, `test/entry-approval.e2e-spec.ts:256` (`test/fiscal-year.e2e-spec.ts:279` no cambia; se verifica) | Expectativas de VOIDED → reverso; diario y mayor muestran original y reverso (los saldos no cambian) | 1 | Medio |

**Frontend:** `ledger/entry-detail.ts`, `ledger/entries.ts`, `sales/invoice-detail.*`, `sales/invoice-form.ts`,
`catalog/tax-rates.ts`, `admin/company.ts`, `dashboard/dashboard.html`, `reporting/dgii.html`,
`reporting/reporting.routes.ts`, `app.routes.ts`, `layout/nav.ts`, `shared/labels.ts`, `ayuda.json` y los del login
para el 2FA. **Total: ≈14 archivos de backend + 5 pruebas del socio y ≈15 de frontend.** `posting.service.ts`,
`invoicing.service.ts` y la autenticación van cada uno en su PR, con su explicación.

## 15. Solapamiento con la v0.2 y calendario conjunto

| v0.2 | Choque | Cómo se resuelve |
|---|---|---|
| Fase 2, tarea 2.2 (`chart-template`, impuestos base) | Crearía impuestos sin enlace | La **Fase 2 de la v0.3 (backend 2.1–2.4) va antes** que esa tarea |
| Fase 2, datos de ejemplo y cierre guiado | Impuestos y revisión del mes | Usan los enlazados; la revisión (9.3) se suma como paso |
| Fase 0, respaldos (D17/D18) | La copia externa sigue pendiente | Se completa en la Fase 3 de la v0.3 |
| Fase 4 (pantallas guiadas: `tax-rates.ts`, `ncf.ts`, `dgii.html`, `dashboard.html`, `company.ts`, `entries.ts`) | Las mismas pantallas | El frontend de la v0.3 va **después** de la Fase 4 de la v0.2, o en la misma rama por área |
| Fase 5 (AUDITOR) | Permisos | Solo lectura de lo fiscal |

**Calendario conjunto (semanas desde el 12-oct-2026):**

| Semanas | v0.3 | v0.2 |
|---|---|---|
| 1–3 | Fases 0 y 1 (backend) | Fase 2 sin impuestos |
| 3–6 | Backend de la Fase 2 | Termina la Fase 2 (plantilla enlazada); Fase 3 |
| 6–9 | Fase 3a (backend y devops) | Fase 4 |
| 9–13 | **3b primero (pantallas del 2FA y exportación; puerta abierta hacia la semana 11)**; frontend de la Fase 2; backend de la Fase 4 | Fase 5 |
| 13–17 | Frontend de la Fase 4; Fase 5 | Fases 6–7 |
| 17–21 | Fases 6 y 8 | — |
| Aparte | Fase 7: ≈2,5 sem efectivas / ≈3 de calendario **desde que llegue la documentación del proveedor** | — |

**Lo que más puede alargarlo:** la contadora (0.1, 0.4), los documentos de 0.2, la revisión del socio de los
archivos de riesgo alto y el proveedor.

## 16. Decisiones para Carlos

| # | Pregunta | Recomendación |
|---|---|---|
| D23 | Corregir un asiento: ¿borrarlo de los libros (hoy) o registrar el **movimiento contrario**? | **Movimiento contrario**, salvo el asiento de cierre de año, que sigue como hoy |
| D24 | Pasado el fin de las B, ¿impedir o solo avisar? | **Impedir**, con fecha real, aviso 45 días antes y contingencia; sin clasificación, solo avisar |
| D25 | ¿Cómo se cargan los cambios de la DGII? | Archivo fechado que carga devops con tu permiso, primero en modo prueba |
| D26 | ¿Se pueden usar valores "Por validar"? | Sí, con aviso visible |
| D27 | Orden del e-CF | La importación va en la Fase 4, antes que el calendario; emitir desde el sistema espera al proveedor |
| D28 | ¿Importar XML de e-CF? | Sí |
| D29 | 2FA, exportación completa y copia externa | **Ahora obligatorio** (Fase 3, abierta hacia la semana 11): es la condición para tener datos reales. Confírmalo |
| D30 | Ctrl+K, DuPont y lo demás que la v0.2 dejó → ¿v0.4? | Sí |
| D31 | ¿Librería `fast-xml-parser`? | Sí, con versión fijada y configuración segura |
| D32 | ¿ITBIS proporcional en la v0.3? | Solo avisar |
| D33 | ¿Quién es la contadora que marca los valores como "Oficial"? | Una de las 2 contadoras de prueba, con nombre |
| **D34** | Una factura B de un **mes cerrado** (o ya declarado): ¿se anula o se corrige con **nota de crédito**? | **Nota de crédito.** Anularla cambiaría un 607 ya presentado |
| **D35** | Si una regla diría "no envíes este formato" y la contadora no la ha confirmado, ¿qué hace el sistema? | **Lo conservador**: seguir generándolo, con una nota. Dejar de enviar un formato obligatorio tiene sanción; la contadora confirma antes de cambiarlo |
| **D36** | ¿Cómo evitamos números de e-CF repetidos al importar ventas? | Mientras no esté conectado el proveedor, **todo se importa**; cuando se conecte, los tipos que emite el sistema ya no se importan. Además, un candado en la base impide el mismo e-CF dos veces |
| **D37** | La retención, ¿al emitir la factura (como hoy) o al pagarla? | **Al emitir**, con aviso si la tasa cambió antes del pago. Pasarla al pago cuesta ≈1,5–2 semanas; decídelo antes de la Fase 2 con la contadora |
| **D38** | ¿Desde qué fecha tiene que tener valores fiscales el sistema? | **1-ene-2025**. Antes de esa fecha no se pueden registrar documentos con impuestos **conectados a los valores oficiales** (los saldos iniciales y los impuestos sin enlazar no se afectan) |
| **D39** | ¿El 2FA va antes que el e-CF? | **Sí**: los XML importados son datos reales de clientes |
| **D40** | Los XML importados no se verifican contra la DGII: ¿se aceptan marcados "No verificado" o se exige verificarlos? | **Aceptarlos marcados** en la v0.3 (se ve en la factura y en la revisión del mes); verificarlos en la Fase 7 si el proveedor o la DGII lo permiten |

**Lo que Carlos consigue:** los documentos de 0.2 (incluida la documentación técnica e-CF), las respuestas del
proveedor (7.5), el tiempo de la contadora y las decisiones D17/D18 de la v0.2 (copia externa y frase secreta).

## 17. Estimación

| Fase | Trabajo (días por agente) | Efectivo | Calendario |
|---|---|---|---|
| 0 Preparación | doc 1, arquitecto 1 | ≈0,5 sem | ≈1–2 sem (paralelo) |
| 1 R2 | back 5,5, front 2, qa 1, seg 0,5, doc 0,5 | ≈1,5 sem | ≈2 sem |
| 2 R9 + ficha | back 9, devops 0,5, front 3, qa 2, seg 0,5, doc 1,5 | ≈2,5 sem | ≈3 sem |
| 3 Puerta de datos reales (3a + 3b) | back 6, devops 2, front 2,5, qa 2, seg 1,5, doc 1 | ≈2,5 sem | ≈5 sem (semanas 6–11) |
| 4 e-CF mínimo, importación, cuadres | back 9, front 3, qa 2, seg 1, doc 1 | ≈2,5 sem | ≈3 sem |
| 5 Calendario y avisos | back 5, front 2, qa 1,5, doc 0,5 | ≈1,5 sem | ≈2 sem |
| 6 609, IT-1, IR-17 | back 5, front 2, qa 1,5, doc 1 | ≈1,5 sem | ≈2 sem |
| 8 Cierre | qa 0,5, revisor 1, doc 0,5, seg 0,5 | ≈0,5 sem | ≈0,5–1 sem |
| **Total sin la Fase 7** | | **≈13 sem** | **≈19–21 sem** |
| 7 e-CF con proveedor (aparte, bloqueada) | back 8, front 2, qa 2, seg 1 | +≈2,5 sem | +≈3 sem desde que llegue la documentación |
| (si D37 = pago) | back 5, front 2, qa 1 | +≈1,5–2 sem | +≈2 sem |

## 18. Riesgos y deuda técnica

### 18.1 Riesgos
| Riesgo | Impacto | Mitigación |
|---|---|---|
| Valor fiscal mal cargado | Grave | Por validar visible; validación con nombre; `--dry-run`; filas inmutables; informe exacto por `fiscalParameterId` |
| El reverso rompe algo del socio | Alto | CLOSING intacto; reglas por llamador; 3 pruebas ajustadas y explicadas; balanza antes y después; PR propio |
| Anular cambia un 607 ya presentado | Alto | 422 de nota de crédito en mes cerrado o declarado (D34) |
| Dejar de enviar 607/608 por una regla mal entendida | Alto | Conservador por defecto (D35) |
| Borrador de NG (retención del 30 % a emisores e-CF) | Medio | Fecha en un parámetro + condición en el código; Validar |
| XML inventado o malicioso | Alto | "No verificado" visible (D40); lectura segura; 10 archivos en secuencia |
| e-NCF duplicado al importar | Alto | D36 + duplicados (409) |
| Saltarse el fin de las B con fechas atrasadas | Alto | Comparar también contra la fecha real |
| 2FA mal hecho bloquea a los usuarios | Alto | Anexo revisado antes; códigos de recuperación; restablecimiento por el ADMIN con bitácora |
| El proveedor no llega | Alto (comercial) | La importación funciona sin él; la Fase 7 es independiente |
| Contingencia sin vigilancia (Fase 7) | Alto | Plazos como parámetros; aviso en rojo; reloj simulado en las pruebas |
| Plantilla de impuestos de la v0.2 antes que R9 | Medio | Orden de la sección 15 |
| Feriados del año siguiente sin cargar | Medio | Aviso desde el 1-dic |
| Datos reales antes de la Fase 3 | Grave | Regla de oro; seguridad la verifica |

### 18.2 Deuda
(1) **`TaxRate.rate` queda informativo** en los impuestos enlazados. (2) **Valores globales por comando**, sin
pantalla de operador. (3) **ITBIS proporcional solo avisado** (D32). (4) **Sin *trigger* en la base de datos** que
impida cambiar lo contabilizado. Rompería la limpieza de las e2e del socio y es invisible desde Prisma. Se revisa en
la v1.0. (5) **XML importados sin verificar** (D40). (6) **Sin validación XSD propia.** (7) **El trabajador e-CF corre
dentro de la API** (Fase 7). (8) **La retención se toma a la fecha de emisión**, si D37 se resuelve así. (9) **Sigue
la deuda 20.1 de la v0.2.**

## 19. Fuera de la v0.3

**v0.4 (D30):** Ctrl+K y atajos; DuPont, punto de equilibrio y análisis vertical/horizontal; conciliación de 2
columnas; importadores y migración desde QuickBooks; visor de la bitácora; alertas por correo. **v1.0:** asistente de
cierre completo y 0,20 % en la conciliación; ITBIS proporcional calculado; inventario básico; retención al pago (si
D37 lo pide); verificación de XML, si no entra en la Fase 7. **Después:** nómina con TSS (y su escala de ISR), activos
fijos, IR-2 asistido y NIIF 18. **No se hace:** certificarnos como proveedor e-CF; firmar XML; un rol de operador
global; tablas de excepciones por empresa; un motor de reglas genérico en los parámetros.

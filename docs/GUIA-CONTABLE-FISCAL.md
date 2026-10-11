# Guía contable y fiscal — Módulo Financiero

> **Base del sistema, junto con la [Guía de producto](GUIA-PRODUCTO.md).**
> Versión 1.0 — 2026-10-11. Fecha de corte normativo: octubre de 2026.
> Origen: investigación entregada por Carlos el 2026-10-11, guardada sin cambios en
> [fuentes/investigacion-contable-fiscal-2026-10.md](fuentes/investigacion-contable-fiscal-2026-10.md).
> Esta versión la depura, la ajusta a las decisiones del proyecto y la convierte en reglas verificables.

---

## 0. Cómo se complementan las dos guías

| | Guía de producto (GUIA-PRODUCTO.md) | Guía contable y fiscal (este documento) |
|---|---|---|
| Responde | **Cómo** se usa: que cualquiera lo maneje sin capacitación | **Qué** debe hacer y **qué tiene que salir bien**: contabilidad, impuestos y leyes |
| Se expresa en | 14 principios (P1–P14) y el checklist por pantalla | 12 reglas de base (R1–R12), datos de referencia y el checklist contable-fiscal |
| La valida | Prueba de "usuario nuevo" | Una contadora (CPA) y las pruebas e2e |

**Regla de precedencia:**
1. **La exactitud contable y la ley no se negocian.** Si algo cómodo para el usuario produce un asiento,
   un impuesto o un reporte incorrecto, no se hace.
2. **La forma de presentarlo la manda la Guía de producto.** La ley dice *qué* hay que cumplir; P7 dice que el
   usuario no tiene que saberse la ley para cumplirla. El sistema calcula, propone y explica (P4, P11).
3. Si las dos guías chocan de verdad, se explica el conflicto y **lo decide Carlos** (igual que en CLAUDE.md).

Cada regla R de abajo dice con qué principio P se conecta, para que nadie construya una sin la otra.

---

## 1. Depuración: qué se cambió respecto a la investigación original

### 1.1 Correcciones
| Tema | Original | Depurado | Por qué |
|---|---|---|---|
| Pérdidas fiscales | 5 años, 20% anual, 80% en el 4.º año | 5 años, 20% anual; tope de **80%** de la renta neta en el 4.º año y de **70%** en el 5.º | Faltaba el tope del 5.º año (Ley 557-05). Validar vigencia con la contadora |
| e-CF | Construir servicio propio (XML, firma, TrackID, contingencia) | **Lo hace un proveedor certificado**; el sistema prepara el documento, guarda el resultado y maneja la contingencia | Decisión de Carlos (2026-10-08): ya tienen proveedor e-CF |
| Grandes Locales y Medianos | Mezclaba "prórroga a nov-2025" con "1-nov-2026" | Su plazo de implementación venció en 2025; desde el **1-nov-2026** solo e-CF y las secuencias B valen hasta el 31-oct-2026 (aviso DGII del 26-ago-2026, art. 55 del Reglamento 587-24) | Confirmado en dgii.gov.do |
| Impuesto a cheques y transferencias | Marcado como "en conflicto" | **0.20%** desde el 3-jul-2026 (Ley 30-26) | Coinciden DGII (calendario de aplicación), bancos y prensa. Exentos: retiros de efectivo, pagos de TSS, pagos de impuestos al Estado y transferencias entre cuentas propias en el mismo banco |
| Arquitectura | Bus de eventos, data warehouse, microservicios | Módulos NestJS del socio; asientos generados desde los documentos (`posting`) | Se sigue la línea del socio; la arquitectura propuesta es para un tamaño que no tenemos |
| Hoja de ruta | V1/V2/V3 propias | Se integra a la hoja de ruta del proyecto (sección 9) | Hay un solo plan: docs/PLAN.md y docs/PLAN-v0.2.md |

### 1.2 Lo que se quitó (o queda solo como referencia)
- **Pillar Two / BEPS / impuesto mínimo global:** solo afecta a grupos con ingresos de €750 millones o más. Fuera del mercado objetivo.
- **US GAAP y libros paralelos:** no hay clientes que lo pidan. Queda como posibilidad futura (multi-libro).
- **Sectores regulados (bancos, seguros, valores):** fuera de alcance. El catálogo debe permitir mapeos futuros, nada más.
- **ISC detallado, IPI, sucesiones, vehículos, regímenes especiales sectoriales:** se dejan solo como "tipo de impuesto configurable".
- **Comparación de facturación electrónica en LatAm:** se conserva una sola idea: modelar el documento de forma común y poner un adaptador por país.
- **Certificarnos como Proveedor de Servicios de Facturación Electrónica:** no está en el plan.
- Citas a blogs y portales comerciales: se conservan en el documento original; aquí solo se citan fuentes oficiales o de confirmación.

### 1.3 Lo que queda pendiente de validar (con la contadora o el CPA asesor)
Estos valores se cargan como **parámetros con vigencia** (R9) y **no se dan por buenos** hasta que alguien
los confirme contra el texto oficial:
- Tasas de retención del art. 309 desde el 1-jul-2026 (15% alquileres, 15% honorarios, 5% pagos del Estado).
- Nuevo régimen de anticipos 2027 y RST por ingresos o por compras: **dependen de reglamentos que aún no salen**.
- Aportes del empleador a Riesgos Laborales (1.10% a 1.30%, las fuentes no coinciden) y salario mínimo para topes TSS (RD$23,223).
- Depreciación fiscal de bienes arrendados (50% / 30%) y la regla del 50% en el año de adquisición.
- Vigencia actual del régimen de compensación de pérdidas (1.1).
- Fecha en que el ICPARD hace obligatorias la NIIF 18 y la NIIF para las PYMES 2025 en RD (rige 6 meses después de la traducción oficial).

---

## 2. Las 12 reglas de base

Cada regla tiene: qué exige, cómo se ve para el usuario (vínculo con la Guía de producto) y cómo se verifica.

### R1. Partida doble garantizada
- **Exige:** todo asiento cuadra (débitos = créditos) en moneda funcional y, si aplica, en moneda de la transacción. Se valida en el servidor y, cuando sea posible, también en la base de datos.
- **Para el usuario (P6, P7):** nunca ve un "error de cuadre" técnico. Ve cuánto falta y de qué lado, con la diferencia resaltada.
- **Verificación:** e2e que intente guardar asientos descuadrados por API.

### R2. Lo contabilizado no se borra ni se edita
- **Exige:** un asiento contabilizado solo se corrige con un asiento de reverso o de ajuste. Un e-CF enviado no se modifica; se corrige con nota de crédito o débito (Ley 32-23, art. 7).
- **Para el usuario (P4, P10):** el botón dice "Corregir", y el sistema arma el reverso y el asiento nuevo; explica por qué no se puede editar.
- **Verificación:** e2e que intente PATCH/DELETE sobre asientos contabilizados y sobre facturas con e-CF aceptado.

### R3. Pista de auditoría completa
- **Exige:** quién, cuándo, desde qué IP, qué valor tenía antes y cuál después, en la misma transacción que el cambio (`writeAudit`, convención del socio). Incluye aprobaciones, reaperturas e importaciones.
- **Para el usuario (P10):** cada documento muestra "Historial" en lenguaje claro. El rol Auditor lo consulta sin poder modificar.
- **Verificación:** e2e que compruebe que cada acción que escribe deja su registro.

### R4. Períodos con cierre y reapertura controlada
- **Exige:** períodos abiertos o cerrados (idealmente por módulo); reabrir exige rol y motivo y queda en la bitácora. Ajustes de auditoría en un "período 13".
- **Para el usuario (P7):** el cierre es un **asistente con checklist** (sección 6), no una lista de cosas que hay que recordar.
- **Verificación:** e2e de registrar en período cerrado → rechazado con mensaje claro.

### R5. Segregación de funciones
- **Exige:** quien registra no aprueba; quien crea un proveedor no lo paga (configurable según el tamaño de la empresa). Roles actuales: ADMIN, ACCOUNTANT, APPROVER, VIEWER; AUDITOR en la v0.2.
- **Para el usuario (P3):** una empresa de 1 persona puede desactivar la aprobación; el sistema le advierte de lo que pierde.
- **Verificación:** matriz de roles en `test/security.e2e-spec.ts`.

### R6. El documento manda; el asiento se deriva
- **Exige:** facturas, pagos, cobros, conciliaciones (y más adelante nómina, inventario y activos) generan su asiento con plantillas configurables (`posting`). El usuario no hace a mano lo que el sistema puede derivar.
- **Para el usuario (P4):** "el sistema propone, la persona confirma": se ve el asiento que va a salir antes de guardar.
- **Verificación:** cada tipo de documento tiene un e2e que compara el asiento generado con el esperado por la contadora.

### R7. Dinero exacto
- **Exige:** tipos decimales en todo el camino (Decimal de Prisma, decimal.js en el frontend; nunca float). Redondeo del ITBIS por línea o por total según el XSD del e-CF, con cuenta de diferencia por redondeo.
- **Para el usuario (P6):** montos alineados a la derecha, con miles y moneda; los totales siempre cuadran con las líneas.
- **Verificación:** pruebas unitarias con casos de redondeo conocidos.

### R8. Numeración sin huecos y control de comprobantes
- **Exige:** numeración secuencial por empresa, diario y tipo; secuencias NCF/e-NCF con rango, vencimiento y aviso antes de agotarse o vencer. Las secuencias B dejan de ser válidas según la clasificación del contribuyente (sección 3.7).
- **Para el usuario (P7, P11):** aviso visible en el panel: "Te quedan 40 comprobantes B01" o "Tus secuencias B vencen el 31-oct".
- **Verificación:** e2e de concurrencia sobre la secuencia.

### R9. Parámetros legales con vigencia, nunca en el código
- **Exige:** tasas, tramos, topes, retenciones y plazos viven en tablas con **"válido desde / válido hasta"**, y el cálculo usa el parámetro vigente **a la fecha del documento**. Un cambio de la DGII se carga como dato, sin publicar una versión nueva.
- **Para el usuario (P11):** viene precargado y actualizado por nosotros; la empresa no tiene que configurar impuestos para empezar (P2).
- **Verificación:** e2e con una factura de junio y otra de julio de 2026 que use la tasa correcta en cada una.

### R10. Cumplimiento DGII completo y cuadrado
- **Exige:** 606, 607, 608 y 609 con el formato oficial; IT-1 e IR-17 asistidos; retenciones automáticas; cuadres antes de presentar (607 contra IT-1; 606 contra crédito de ITBIS). Gastos sujetos a retención solo deducibles si se retuvo y pagó (NG 02-05, art. 7).
- **Para el usuario (P11):** "606, 607 y 608 en un clic", con la lista de lo que falta corregir antes de generar.
- **Verificación:** una contadora pasa los archivos por el prevalidador oficial de la DGII.

### R11. Calendario fiscal integrado
- **Exige:** vencimientos de cada empresa según su clasificación y su cierre fiscal (sección 3.8), corridos al día laborable siguiente.
- **Para el usuario (P7, P11):** el panel dice qué vence esta semana y qué falta para presentarlo.
- **Verificación:** prueba unitaria del calendario con feriados.

### R12. Conservación y privacidad
- **Exige:** 10 años de documentos, XML firmados, acuses y libros (Código Tributario, art. 50 h). Ley 172-13 de datos personales: cifrado en tránsito y en reposo, acceso mínimo, derecho de acceso y corrección. Certificados digitales (.p12) cifrados y nunca expuestos (Ley 126-02).
- **Para el usuario (P10):** exportación completa de sus datos en cualquier momento.
- **Verificación:** backups probados (ya existen), y no se cargan datos reales hasta tener copia externa cifrada, 2FA y exportación completa.

---

## 3. Datos de referencia de República Dominicana

Todo lo de esta sección se carga como **parámetro con vigencia (R9)**. La columna "Estado" dice cuánto confiar:
**Oficial** = confirmado en DGII/TSS o ley; **Validar** = viene de fuentes secundarias que coinciden, falta la revisión de la contadora.

### 3.1 Marco contable
| Quién | Marco | Estado |
|---|---|---|
| Empresas que cotizan o están reguladas por la SIMV | NIIF completas (ICPARD, Res. 001, 2010) | Oficial |
| Todas las demás | NIIF para las PYMES (ICPARD, Res. 002, desde 2014) | Oficial |
| Desde ejercicios de 2027 | NIIF 18 (presentación) y NIIF para las PYMES 3.ª ed. (2025) | Validar la fecha de adopción en RD |

**Para el sistema:** la empresa guarda su marco y la fecha de adopción. El mercado objetivo son PYMES, así que la prioridad es la NIIF para las PYMES: arrendamientos operativos como gasto (sin NIIF 16) y cartera por antigüedad (sin pérdida esperada).

### 3.2 ITBIS
| Concepto | Valor | Estado |
|---|---|---|
| Tasa general | 18% | Oficial |
| Tasa reducida (yogur, mantequilla, café, aceites y grasas, azúcares, cacao y chocolate) | 16% | Oficial |
| Exportaciones | 0% | Oficial |
| Proporcionalidad (art. 349) | Si hay ventas gravadas y exentas, solo se acredita la proporción gravada; coeficiente mensual y ajuste anual. El ITBIS no acreditable va al costo o al gasto | Oficial |

**Retenciones de ITBIS:**
| Caso | Retención | Estado |
|---|---|---|
| Persona jurídica que paga servicios a otra persona jurídica | 30% del ITBIS | Oficial (NG 02-05 y 07-09) |
| Servicios de personas físicas | 100% | Oficial |
| Seguridad, limpieza, transporte de carga y similares | 100% | Oficial (NG 07-09) |
| Compras a personas físicas o no registrados (B11/E41) | 100% | Oficial |
| Compras a contribuyentes del RST | 100% | Validar |
| Cobros con tarjeta | 2% del monto | Oficial |

### 3.3 ISR de personas jurídicas
| Concepto | Valor | Vigencia | Estado |
|---|---|---|---|
| Tasa general | 27% | — | Oficial |
| Ingresos ≥ RD$1,000 millones | 30% | Ejercicios 2026–2028 (vuelve a 27% en 2029) | Validar |
| Activos (ISA) | 1% de activos imponibles; el ISR liquidado se acredita; 2 cuotas | — | Oficial |
| IR-2 | 120 días después del cierre | — | Oficial |
| Pérdidas compensables | 5 años; 20% anual; tope 80% de la renta en el 4.º año y 70% en el 5.º | — | Validar vigencia |
| Anticipos (hasta 2026) | Tasa efectiva ≤ 1.5%: 1.5% de ingresos brutos; > 1.5%: 1/12 del impuesto liquidado | — | Oficial |
| Anticipos (desde 2027) | Pequeñas y personas físicas: 50% / 30% / 20% en los meses 6, 9 y 12; micro y agro exentos | 2027 | Validar (falta reglamento) |

**Deducibilidad:** solo con comprobante válido para crédito fiscal (B01/E31, B11/E41, B13/E43, B17/E47); B02/E32 no sustenta gasto. Cada gasto se marca "admitido" o "no admitido" para la conciliación del IR-2.

### 3.4 Retenciones de ISR (IR-17, día 10)
| Concepto | Tasa | Vigencia | Estado |
|---|---|---|---|
| Alquileres a personas físicas | 15% (pago definitivo) | 1-jul-2026 | Validar |
| Honorarios y servicios de personas físicas | 15% (pago a cuenta) | 1-jul-2026 | Validar |
| Pagos del Estado | 5% | 1-jul-2026 | Validar |
| Dividendos | 10% (pago definitivo) | — | Oficial |
| Pagos al exterior por regalías, software, publicidad en línea y almacenamiento de datos | 15% definitivo | 1-jul-2026 | Validar |

### 3.5 ISR de asalariados y personas físicas (IR-3, día 10)
Escala 2026 (anual): exento hasta RD$416,220; 15% hasta RD$624,329; RD$31,216 + 20% hasta RD$867,123; RD$79,776 + 25% por encima. **Oficial.**
Escala 2027 (Ley 30-26): exento hasta RD$480,000; 15% hasta RD$685,000; RD$30,750 + 20% hasta RD$910,000; RD$75,750 + 25% hasta RD$4,800,000; RD$1,048,250 + 27% por encima, con indexación anual. **Validar.**
La retención se calcula sobre el salario menos la TSS del trabajador. La regalía pascual está exenta.

### 3.6 Otros impuestos y recargos
| Concepto | Valor | Vigencia | Estado |
|---|---|---|---|
| Cheques y transferencias a terceros | 0.20% | 3-jul-2026 | Oficial (antes 0.15%) |
| Recargo por mora | 3% por mes o fracción, tope 100%; descuentos por pronto pago | 1-jul-2026 | Validar |
| Interés indemnizatorio | 1.10% mensual; desde 2027, tasa activa BCRD + 30 pb | Ene-2027 | Validar |

### 3.7 Comprobantes fiscales y e-CF
| NCF | e-CF | Nombre |
|---|---|---|
| B01 | E31 | Crédito fiscal |
| B02 | E32 | Consumo |
| B03 | E33 | Nota de débito |
| B04 | E34 | Nota de crédito |
| B11 | E41 | Compras (a no registrados) |
| B13 | E43 | Gastos menores |
| B14 | E44 | Regímenes especiales |
| B15 | E45 | Gubernamental |
| B16 | E46 | Exportaciones |
| B17 | E47 | Pagos al exterior |

- NCF: 11 posiciones (B + 2 de tipo + 8 de secuencia). e-NCF: 13 posiciones (E + 2 de tipo + 10).
- **Fin de los comprobantes en papel:**
  - Grandes Nacionales: ya solo e-CF.
  - Grandes Locales y Medianos: solo e-CF desde el **1-nov-2026**; secuencias B hasta el 31-oct-2026, salvo contingencia. **Oficial.**
  - Pequeños, Micro y No Clasificados: hasta el **15-nov-2026** (prórroga del Aviso 06-26). **Oficial.**
- **Facturador Gratuito de la DGII:** unas 150 facturas al mes, solo pesos, sin integración. Las empresas que lo superan son nuestro mercado.

**Reparto del trabajo con el proveedor e-CF (decisión del proyecto):**
| Lo hace el proveedor certificado | Lo hace nuestro sistema |
|---|---|
| Firma XMLDSig, token con la DGII, envío, TrackID, RFCE de E32 < RD$250,000 | Armar los datos del documento con impuestos y retenciones correctos (R6, R7, R9) |
| Acuses y aprobación comercial con el receptor | Guardar el estado (aceptado, condicional, rechazado), el XML y el código de seguridad (R12) |
| Representación impresa con QR (si el proveedor la da) | Bloquear la edición después del envío (R2) y guiar la corrección con nota de crédito o débito |
| — | Contingencia: seguir vendiendo, encolar y reenviar (máximo 72 horas), con aviso visible |

### 3.8 Formatos y calendario fiscal mensual
| Día | Qué |
|---|---|
| 10 | IR-3, IR-17 y pago de TSS |
| 15 | 606, 607, 608 y 609 (aunque no haya operaciones); anticipos de ISR |
| 20 | IT-1 (con su Anexo A) e ISC |
| Anual | IR-2 e ISA a los 120 días del cierre; IR-1 el 31 de marzo; estados a los socios en 90 días; asamblea en 120 días (Ley 479-08) |

Si el día cae en no laborable, pasa al siguiente laborable. Cierres fiscales permitidos: 31-mar, 30-jun, 30-sep y 31-dic.

### 3.9 Nómina (para cuando se construya)
| Seguro (Ley 87-01) | Empleado | Empleador | Tope | Estado |
|---|---|---|---|---|
| Pensiones (AFP) | 2.87% | 7.10% | 20 salarios mínimos | Oficial |
| Salud (SFS) | 3.04% | 7.09% | 10 salarios mínimos | Oficial |
| Riesgos laborales (SRL) | — | 1.10%–1.30% según riesgo | 4 salarios mínimos | Validar |
| INFOTEP | 0.5% de bonificaciones | 1% de la nómina | — | Oficial |

Código de Trabajo (Ley 16-92): salario diario = mensual ÷ 23.83. Preaviso de 7, 14 o 28 días según la antigüedad. Cesantía de 6 días, 13 días, 21 días por año (1–5 años) o 23 días por año (más de 5). Vacaciones de 14 o 18 días. Regalía de 1/12 de lo devengado, pagada antes del 20 de diciembre y exenta de ISR y TSS. **Oficial.**

### 3.10 Depreciación fiscal (art. 287)
| Categoría | Activos | Tasa | Método |
|---|---|---|---|
| 1 | Edificaciones | 5% | Línea recta, activo por activo |
| 2 | Vehículos livianos, muebles y equipo de oficina, computadoras | 25% | Saldo decreciente por categoría |
| 3 | Todo lo demás | 15% | Saldo decreciente por categoría |

**Para el sistema:** activos fijos con dos libros, NIIF y fiscal; la diferencia alimenta el impuesto diferido (NIC 12) y el anexo del IR-2.

---

## 4. Núcleo contable: lo que tiene que existir
1. **Ficha de la empresa:** RNC, razón social, tipo social, **clasificación DGII**, **régimen (ordinario o RST)**, mes de cierre fiscal, moneda funcional y **marco NIIF con su fecha de adopción**.
2. **Catálogo de cuentas** jerárquico (el estándar RD ya se carga con un botón), con tipo, naturaleza, si es de detalle o de grupo, moneda, si exige tercero o centro de costo, y mapeo al IR-2.
   - Las dimensiones (centro de costo, proyecto, sucursal) van aparte; no se crean cuentas para cada una.
3. **Diario y mayor** con detalle hasta el documento de origen y adjuntos (XML, PDF).
4. **Ajustes y devengos:** prepagados, acumulaciones, provisiones (prestaciones, vacaciones, regalía), depreciación y deterioro.
5. **Conciliación bancaria:** el corazón (P5). Importar extracto, parear automáticamente y reconocer el 0.20%, las comisiones y las retenciones de tarjeta como sugerencias de asiento.
6. **Moneda extranjera:** tasa del día en cada transacción (historial de tasas del BCRD) y reexpresión al cierre.
7. **Estados financieros:** situación, resultados, cambios en el patrimonio y flujo de efectivo (indirecto, automático), con comparativos. Formato NIIF 18 o PYMES 2025 cuando corresponda.
8. **Libros** exportables con folio: diario, mayor, inventarios y balances.

## 5. Costos y gestión (más adelante)
- **Primero lo que pide una PYME de servicios o comercio:** inventario perpetuo con promedio ponderado o FIFO (**LIFO no**), costo de ventas automático y ajuste a valor neto realizable.
- **Después, la manufactura:** costeo por órdenes, por procesos o estándar con variaciones, y costos indirectos sobre capacidad normal (NIC 2). ABC y costeo conjunto solo si un nicho lo pide.
- **Gestión:**
  - Presupuesto contra lo real y presupuesto flexible.
  - Punto de equilibrio y margen de contribución.
  - Razones e indicadores, ya en la v0.2: semáforo y tendencia.
  - Flujo de caja proyectado a partir de CxC, CxP, nómina y el calendario fiscal.
  - Rentabilidad por centro de costo.

## 6. Cierres guiados (P7 aplicado a la contabilidad)

El cierre es un asistente con estos pasos. Cada paso muestra si está hecho, qué falta y el botón para resolverlo.

**Mensual:**
1. Comprobantes del mes emitidos y aceptados; rechazados resueltos.
2. Compras registradas y sus NCF validados; E41 y E43 generados.
3. Bancos conciliados, incluidos el 0.20% y las retenciones de tarjeta.
4. Nómina y provisiones (cuando exista).
5. Depreciación (cuando exista).
6. Reexpresión de moneda extranjera.
7. CxC, CxP y bancos cuadran contra el mayor.
8. Devengos y diferidos.
9. 606/607/608/609 generados y cuadrados; IT-1 e IR-17 listos.
10. Balanza revisada y período cerrado.

**Anual:**
1. Conteos físicos de inventario y activos.
2. Deterioro y antigüedad de cartera.
3. Conciliación fiscal: gastos no admitidos, depreciación fiscal y pérdidas.
4. ISR, ISA e impuesto diferido.
5. Asiento de cierre, reserva legal y apertura.
6. Estados con comparativos.
7. IR-2 con anexos.
8. Paquete para el auditor.

---

## 7. Dónde estamos (brecha contra el código, 2026-10-11)

| Regla / capacidad | Hoy | Falta |
|---|---|---|
| R1 Partida doble | Validada en el servicio de asientos | Revisar si también se valida en la base de datos |
| R2 Inmutabilidad | Asientos con estados DRAFT / POSTED / VOIDED y tipo REVERSAL | **Confirmar** que un POSTED no se puede editar por API; definir si VOIDED se sustituye por reverso obligatorio |
| R3 Auditoría | AuditLog con cambios, IP y navegador, escrito en la transacción | Pantalla para el auditor (Fase de auditoría v0.2) |
| R4 Períodos | Años y períodos fiscales con estado | Cierre por módulo, período 13 y asistente de cierre |
| R5 Segregación | 4 roles y aprobación opcional de asientos | Rol AUDITOR (v0.2) y matriz de conflictos |
| R6 Documento → asiento | Módulo `posting` para facturas y pagos | Plantillas configurables; ver el asiento antes de guardar |
| R7 Decimales | Prisma Decimal y decimal.js; cuenta de redondeo | Pruebas de redondeo del ITBIS por línea |
| R8 Secuencias | NcfSequence con rango, aviso y vencimiento | Aviso en el panel; regla de fin de secuencias B por clasificación |
| **R9 Vigencias** | TaxRate **sin fechas de vigencia** | **Brecha principal:** tabla de parámetros con "válido desde/hasta" |
| R10 DGII | 606, 607 y 608 (también en TXT) | 609, IT-1 e IR-17 asistidos, cuadres previos, validación con prevalidador |
| R11 Calendario | No existe | Calendario y alertas en el panel |
| R12 Conservación | Backups diarios con prueba de restauración | Copia externa cifrada, 2FA, exportación completa |
| Ficha de empresa | RNC, moneda, mes de inicio | Clasificación DGII, régimen, tipo social, marco NIIF |
| Catálogo | Jerárquico, con clasificación e import/export (v0.2) | Mapeo al IR-2; validación de las contadoras |
| e-CF | Secuencias E y punto de conexión previsto | Integración con el proveedor (estado, XML, contingencia) |
| Presupuestos | Modelo Budget con líneas | Presupuesto contra lo real |
| Nómina, inventario y activos fijos | No existen | Módulos futuros |

---

## 8. Checklist de aceptación contable-fiscal

Se suma al checklist por pantalla de la Guía de producto (sección 6). Un cambio que toca dinero,
impuestos o asientos **no se aprueba** si falla algo de esto:

- [ ] El asiento que genera cuadra y la contadora lo da por correcto (prueba e2e con el asiento esperado).
- [ ] No permite editar ni borrar nada contabilizado; ofrece corregir con reverso o nota.
- [ ] Deja registro en la bitácora dentro de la misma transacción.
- [ ] Respeta el período cerrado.
- [ ] Usa el parámetro vigente a la fecha del documento, no uno escrito en el código.
- [ ] Usa decimales exactos; los totales cuadran con las líneas.
- [ ] Lo que afecta a un formato DGII aparece bien en el 606/607/608 y pasa el prevalidador.
- [ ] Respeta el aislamiento entre empresas (companyId) y los roles.
- [ ] Explica en lenguaje sencillo la regla fiscal cuando bloquea algo (por ejemplo: "Este gasto no es deducible porque el comprobante es de consumo").

---

## 9. Lugar en la hoja de ruta

Esta guía **no reemplaza el plan**; le dice al arquitecto qué priorizar. Propuesta para que el arquitecto la
evalúe al planificar las versiones siguientes:

| Versión | Qué de esta guía entra |
|---|---|
| **v0.2 (en curso)** | Lo que ya está planificado. Además, revisar con las contadoras el catálogo RD y la sección 3 marcada "Validar" |
| **v0.3** | **R9 (parámetros con vigencia)**, ficha de empresa completa, calendario fiscal (R11), 609, IT-1 e IR-17 asistidos, cuadres previos, confirmación de R2, integración con el proveedor e-CF |
| **v1.0 (piloto)** | Asistente de cierre mensual, impuesto de 0.20% en la conciliación, inventario básico, copia externa, 2FA y exportación completa (requisito para datos reales) |
| **Después** | Nómina con TSS, activos fijos con dos libros, cierre anual con IR-2 asistido, costos de manufactura, NIIF 18 |

**Urgencia comercial:** los Pequeños, Micro y No Clasificados deben emitir e-CF desde el 15-nov-2026. Es la
demanda más inmediata del mercado, y depende de la integración con el proveedor e-CF.

---

## 10. Cómo se mantiene al día
- **Responsable de validar:** una contadora del equipo de prueba o el CPA asesor (pendiente de definir en docs/PLAN.md).
- **Cada cambio normativo:**
  1. se anota en `docs/normativa-dgii/` con la fuente oficial;
  2. se carga como parámetro con vigencia;
  3. se agrega su prueba e2e;
  4. se actualiza la sección 3 de esta guía y su estado.
- **Revisión completa:** cada enero, y cuando salgan los reglamentos de la Ley 30-26.

## 11. Fuentes principales
- DGII: [Emisión exclusiva de e-CF para Grandes Locales y Medianos (26-ago-2026)](https://dgii.gov.do/noticias/Paginas/DGII-informa-emision-exclusiva-de-facturas-electronicas-para-Grandes-Locales-y-Medianos-contribuyentes-desde-noviembre.aspx)
- DGII: [Impuesto sobre la Renta](https://dgii.gov.do/cicloContribuyente/obligacionesTributarias/principalesImpuestos/Paginas/impuestoSobreRenta.aspx)
- DGII: [Ley 32-23 de facturación electrónica](https://dgii.gov.do/transparencia/baseLegal/Documents/Leyes/Ley%2032-23.pdf)
- DGII: [Norma General 02-05 (retenciones de ITBIS)](https://dgii.gov.do/legislacion/normasGenerales/Documents/NG%20sobre%20Impuesto%20sobre%20Transferencias%20de%20Bienes%20Industrializados%20y%20Servicios%20(ITBIS)/norma02-05.pdf)
- DGII: [Ley 557-05 (pérdidas compensables)](https://dgii.gov.do/legislacion/leyesTributarias/Documents/Codigo%20Tributario%20y%20Leyes%20que%20lo%20modifican%20y%20complementan/557-05.pdf)
- DGII: [Ley 479-08 de sociedades](https://dgii.gov.do/legislacion/leyesTributarias/Documents/Otras%20Leyes%20de%20Inter%C3%A9s/479-08.pdf)
- Confirmación del 0.20%: [Siempre al Día](https://siemprealdia.co/republica-dominicana/impuestos/impuesto-a-transferencias-electronicas-ley-30-26/), [elDinero](https://eldinero.com.do/371045/reforma-fiscal-el-0-2-por-transferencia-bancaria-ya-esta-en-vigor-cuando-no-aplica/)
- Lista completa de las 85 fuentes: [investigación original](fuentes/investigacion-contable-fiscal-2026-10.md#fuentes).

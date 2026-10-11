# Guía para diseñar un software contable/ERP completo: contabilidad financiera, fiscal, de costos y gerencial (internacional y República Dominicana, octubre 2026)

Un software contable completo para la República Dominicana tiene que hacer bien tres cosas a la vez. Primero, un núcleo contable universal: partida doble, catálogo de cuentas jerárquico, períodos con cierre, asientos que no se pueden cambiar y estados financieros bajo NIIF completas o NIIF para las PYMES, según lo adoptado por el ICPARD. Segundo, un motor fiscal parametrizable para la DGII: e-CF obligatorio, ITBIS 18%/16%, ISR 27% (30% transitorio para grandes), retenciones, formatos 606/607/608/609, IT-1, IR-17, IR-2 y anticipos. Tercero, módulos de nómina (TSS, INFOTEP, Código de Trabajo), costos y gestión que alimenten automáticamente el libro mayor. El riesgo más grande en 2026 es el cambio normativo.\[1\] La Ley 30-26, promulgada el 18 de junio de 2026, modificó tasas, retenciones y plazos con vigencias escalonadas entre 2026 y 2029.\[2\] A eso se suman el fin de los NCF en papel en noviembre de 2026 y, en enero de 2027, la entrada en vigor de la NIIF 18 y de la tercera edición de la NIIF para las PYMES. Por eso el software debe guardar cada tasa y cada regla con fechas de vigencia en tablas, nunca escritas en el código.

## TL;DR

- **El núcleo contable es universal; la capa dominicana es la que decide si el producto se vende.** Hay que construir un libro mayor de partida doble, multiempresa y multimoneda, con asientos que no se modifican después de contabilizados, períodos con cierre y estados financieros NIIF. Sobre ese núcleo va el cumplimiento DGII: e-CF en XML firmado con XMLDSig RSA-SHA256, certificación como emisor electrónico, formatos 606/607/608/609 hasta el día 15, IT-1 hasta el día 20 e IR-17/IR-3 hasta el día 10.
- **2026–2027 es un año de transición normativa en tres frentes.** (1) e-CF: Grandes Locales y Medianos emiten solo e-CF desde el 1 de noviembre de 2026. Según la DGII, sus secuencias tipo "B" "solo serán consideradas válidas hasta el 31 de octubre de 2026, conforme a lo establecido en el artículo 55 del Reglamento". Pequeños, Micro y No Clasificados tienen hasta el 15 de noviembre de 2026, por la prórroga automática del Aviso DGII 06-26 (6 de mayo de 2026): "seis (6) meses contados a partir del 15 de mayo de 2026", sin necesidad de solicitarla. (2) Ley 30-26: ISR del 30% en 2026–2028 para ingresos ≥ RD$1,000 millones; impuesto a cheques y transferencias del 0.20% desde el 3 de julio de 2026 (art. 40; los bancos lo notificaron a sus clientes ese mismo día, según El Nacional); retenciones del 15% a pagos al exterior por software y publicidad digital; nueva escala de ISR de personas físicas y nuevo régimen de anticipos desde 2027. (3) NIIF 18 y NIIF para las PYMES 2025 rigen desde el 1 de enero de 2027.
- **Arquitectura recomendada.** Un motor de reglas fiscales con fechas de vigencia, un servicio aparte para e-CF (firma, envío, TrackID, contingencia), subledgers (CxC, CxP, inventario, activos, nómina) que generan asientos automáticos, y un módulo de costos y presupuestos con dimensiones analíticas. El producto debe salir con un checklist de cierre y un calendario fiscal integrados. Las empresas obligadas a NIIF completas (las que cotizan) necesitan además NIIF 9, 15 y 16 completas, consolidación y NIIF 18. Las PYMES usan las simplificaciones de la NIIF para las PYMES: arrendamientos sin NIIF 16 y sin modelo de pérdida esperada.

---

## 1. Contabilidad general / financiera

### 1.1 Marco internacional

**NIIF completas (IFRS Accounting Standards).** Las normas que el software tiene que soportar:

| Norma | Qué exige al sistema |
|---|---|
| **NIC 1 → NIIF 18** (desde el 1-ene-2027, retroactiva) | Estados primarios con comparativos; NIIF 18 agrega categorías de operación, inversión y financiación en resultados, subtotales obligatorios ("resultado operativo", "resultado antes de financiación e impuestos"), medidas de rendimiento definidas por la gerencia (MPM) conciliadas en notas, y reglas de agregación y desagregación. Si los gastos se presentan por función, hay que revelar la depreciación, la amortización y los beneficios a empleados.\[3\] Parte de la NIC 1 pasa a la NIC 8 ("Bases para la preparación de los estados financieros")\[4\] |
| **NIC 2** Inventarios | Costo o valor neto realizable, el menor; FIFO o promedio ponderado (LIFO prohibido); identificación específica; costos indirectos según capacidad normal |
| **NIC 16** PPE | Componentes, vida útil, valor residual, métodos, modelo de costo o revaluación, bajas |
| **NIIF 15** Ingresos | Modelo de 5 pasos; activos y pasivos de contrato |
| **NIIF 16** Arrendamientos | Derecho de uso y pasivo por arrendamiento; exenciones de corto plazo y bajo valor |
| **NIIF 9** Instrumentos financieros | Clasificación (costo amortizado, VR-ORI, VR-resultados), pérdida crediticia esperada, coberturas |
| **NIC 12** Impuesto diferido | Diferencias temporarias contable/fiscal (por ejemplo, depreciación NIIF frente a Art. 287), conciliación de la tasa efectiva |
| **NIC 21** Moneda extranjera | Moneda funcional; remedición de partidas monetarias al cierre; conversión para consolidar |
| **NIC 36 / NIC 38** | Deterioro por unidad generadora de efectivo; capitalización de desarrollo e intangibles |
| **NIC 7** Flujos de efectivo | Método directo o indirecto; NIIF 18 elimina opciones para intereses y dividendos\[5\] |
| **NIC 8 / NIC 37** | Cambios de políticas, estimaciones y errores; provisiones y contingencias |
| **NIIF 10 / NIC 27 / NIC 28** | Consolidación, eliminaciones intercompañía, participación no controladora, método de participación |

**NIIF para las PYMES, 3.ª edición (2025).** El IASB la publicó el 27 de febrero de 2025 y conserva las 35 secciones.\[6\] Cambios principales:
- Sección 2 alineada con el Marco Conceptual de 2018.\[7\]
- Sección 12 con medición a valor razonable alineada con la NIIF 13.\[7\]
- Sección 19 de combinaciones de negocios actualizada.\[8\]
- Sección 23 de ingresos con el modelo de 5 pasos de la NIIF 15.\[8\]
- Para cartera no se adopta la pérdida esperada; se exige un análisis de antigüedad.\[9\]
- La Sección 20 conserva la distinción entre arrendamiento financiero y operativo, sin NIIF 16.\[9\]

Rige para ejercicios iniciados desde el 1 de enero de 2027 y se puede aplicar antes.\[8\]\[10\] Para el software, una empresa bajo NIIF para las PYMES puede registrar arrendamientos operativos como gasto, mientras que una bajo NIIF completas necesita el motor de derecho de uso.

**US GAAP como referencia.** El ASC del FASB permite LIFO (ASC 330), mantiene la clasificación operativa y financiera del arrendatario (ASC 842), usa CECL (ASC 326) y prohíbe revertir el deterioro de activos de larga vida. Para filiales de grupos estadounidenses conviene un "libro paralelo" (multi-ledger) NIIF y US GAAP.

### 1.2 República Dominicana: marco legal contable

- **ICPARD.** El Instituto de Contadores Públicos Autorizados de la RD es el organismo que dicta las normas contables. La Ley 479-08 remite a "los principios y/o normas contables establecidos por el ICPARD".\[11\]
  - **Res. 001 Acta 2010-004 (18-feb-2010):** NIIF completas, obligatorias para las empresas que cotizan en la Bolsa de Valores o están reguladas por la Superintendencia del Mercado de Valores, y para las que estén en proceso de emitir valores.\[11\]
  - **Res. 002 Acta 2010-004:** NIIF para las PYMES para las demás entidades sin obligación pública de rendir cuentas, desde el 1 de enero de 2014. La Res. 20-03-2014 (Acta 22-2014) confirmó la adopción.\[12\]\[13\]
  - Las modificaciones del IASB se aplican en RD **seis meses después de su traducción oficial al español**.\[14\] El software debe permitir fijar la fecha en que cada empresa adopta la NIIF PYMES 2025 y la NIIF 18.
- **Ley 633-16.** Regula el ejercicio de la profesión de contador público autorizado y la firma de estados financieros. El software debe guardar los datos y la firma del CPA que certifica los estados.
- **Ley General de Sociedades 479-08, modificada por la Ley 31-11:**
  - Los gerentes someten el informe de gestión y los estados financieros dentro de los **90 días** siguientes al cierre (art. 109).\[15\]
  - La asamblea ordinaria anual aprueba los estados auditados y el informe del comisario de cuentas dentro de los **120 días** siguientes al cierre (art. 110 y art. 200, párr. I, en el caso de las S.A.).\[16\]
  - Durante los **15 días** previos a la asamblea, los socios tienen derecho a recibir los estados auditados, los informes y los proyectos de resoluciones.\[17\]
  - Las sociedades anónimas tienen comisario de cuentas, que debe ser un CPA con experiencia en auditoría.\[18\] La auditoría es obligatoria según el tipo social y los umbrales de la ley.
  - Implicación para el software: un módulo de gobierno corporativo con libro de actas, registro de accionistas, distribución de dividendos y reservas, y la reserva legal según el tipo social.
- **Sectores regulados.** Bancos (Superintendencia de Bancos), valores (SIMV, NIIF completas) y seguros (Superintendencia de Seguros) tienen catálogos y reportes regulatorios propios. **Recomendación:** no atacarlos en la versión 1; diseñar el catálogo para aceptar mapeos regulatorios más adelante.

### 1.3 Ciclo contable completo (funcionalidad mínima)

1. **Constitución y configuración inicial.**
   - Datos de la empresa: RNC, razón social, tipo social, clasificación DGII (Grande Nacional, Grande Local, Mediano, Pequeño, Micro), actividad económica, régimen (ordinario o RST), fecha de cierre fiscal (31-mar, 30-jun, 30-sep o 31-dic), moneda funcional y marco NIIF.
   - Asiento de apertura con el capital suscrito y pagado.
2. **Catálogo de cuentas.**
   - Estructura jerárquica de 5 a 7 niveles; en RD es habitual la codificación 1 Activo, 2 Pasivo, 3 Patrimonio, 4 Ingresos, 5 y 6 Costos y gastos (ejemplo: 1-1-01-001-0001).
   - Cada cuenta lleva sus atributos: tipo, naturaleza, detalle o grupo, moneda, si requiere tercero, centro de costo o proyecto, y su mapeo a las casillas del IR-2 y de los anexos.
   - **Recomendación:** separar el plan de cuentas legal de las dimensiones analíticas (centro de costo, proyecto, sucursal, línea de producto) para no inflar el catálogo.
3. **Registro de operaciones.** Diario general con numeración secuencial sin saltos por empresa, período y tipo de diario; asientos automáticos desde los subledgers; adjuntos (XML del e-CF, PDF).
4. **Libro mayor y balanza de comprobación** por período, con saldos de apertura y movimientos, y consultas de detalle hasta el documento de origen.
5. **Ajustes y devengos:** gastos pagados por anticipado, acumulaciones, provisiones (prestaciones laborales, vacaciones, regalía pascual), depreciación, amortización, deterioro de cartera e inventario.
6. **Conciliaciones bancarias:**
   - importación de extractos;
   - pareo automático;
   - registro del impuesto de 0.20% sobre cheques y transferencias a terceros (vigente desde el 3-jul-2026);\[19\]
   - comisiones y retenciones del 2% de ITBIS en cobros con tarjeta.
7. **Diferencias cambiarias.**
   - La transacción se registra a la tasa del día y las partidas monetarias en moneda extranjera se reexpresan al cierre.
   - Fuente de tasas: Banco Central de la RD (la DGII también publica tasas en su portal).
   - El sistema debe descargar y guardar el historial de tasas.
8. **Cierre mensual.**
   - Bloquear el período para cada módulo (CxC, CxP, inventario, nómina, contabilidad general).
   - Correr depreciación, revaluación cambiaria y provisiones.
   - Conciliar los subledgers contra el mayor.
   - Generar 606/607/608/609, IT-1 e IR-17.
9. **Cierre anual.**
   - Ajustes de auditoría en un "período 13".
   - Cálculo del impuesto corriente y diferido.
   - Asiento de cierre de resultados contra utilidades acumuladas o resultado del ejercicio; reserva legal.
   - Asiento de apertura del nuevo ejercicio.
   - IR-2 con sus anexos e ISA (si aplica).
10. **Estados financieros:** situación financiera, resultados (formato NIIF 18 desde 2027), ORI, cambios en el patrimonio, flujos de efectivo (método indirecto automático a partir de las variaciones del balance y de los movimientos clasificados) y notas con plantillas.
11. **Multiempresa, multimoneda y consolidación:** eliminaciones intercompañía, conversión por NIC 21 e interés minoritario.

### 1.4 Libros y conservación en RD

- **Libros:** el Código de Comercio y la práctica dominicana exigen diario, mayor e inventarios y balances; la Ley 479-08 exige además libros de actas y registro de socios o accionistas. El software debe imprimir o exportar estos libros foliados y con firma.
- **Conservación:** **10 años** para documentos, comprobantes y e-CF (Código Tributario, art. 50 h, aplicado expresamente a los e-CF por la DGII).\[20\]\[21\] El plazo de prescripción de la facultad de la DGII es normalmente de 3 años, ampliable en casos de omisión. Como regla de diseño, guardar todo 10 años en almacenamiento inmutable.

---

## 2. Contabilidad fiscal / tributaria (énfasis en RD)

### 2.1 Base normativa

- **Código Tributario, Ley 11-92**, con sus títulos: I procedimiento, II ISR, III ITBIS, IV Activos e ISC.
- **Modificaciones principales:** Ley 253-12 y, sobre todo, la **Ley 30-26** de Medidas Pro-Crecimiento Económico, Simplificación Fiscal y Mitigación de la Crisis Internacional, promulgada el **18-jun-2026**. Tiene 62 artículos y modifica el ISR, el ITBIS, los recargos, los ISC y varias leyes sectoriales.\[1\]\[22\]
- **Reglamentos:** 139-98 (ISR), 293-11 (ITBIS), 254-06 y Norma 06-2018 (comprobantes), Decreto 587-24 (reglamento de facturación electrónica).\[23\]
- **Normas Generales:** 07-2018 (envío de datos), 02-05 y 07-09 (retenciones de ITBIS), 01-2020 (e-CF), entre otras.
- **Advertencia:** buena parte de la Ley 30-26 (RST, percepción de ITBIS, acuerdos de pago, anticipos) depende de normas y reglamentos que todavía faltan por dictar.\[2\] El motor fiscal tiene que poder actualizarse sin publicar una versión nueva del software.

### 2.2 Cambios de la Ley 30-26 que el software debe modelar

| Medida | Antes | Con la Ley 30-26 | Vigencia |
|---|---|---|---|
| ISR personas jurídicas | 27% | 27%; **30%** para ingresos ≥ RD$1,000 millones | Ejercicios 2026, 2027 y 2028 (vuelve a 27% en 2029)\[2\]\[24\] |
| ISR personas físicas | Exento hasta RD$416,220; tramos de 15/20/25% | Exento hasta RD$480,000; tramos de 15/20/25/27% (27% por encima de RD$4.8 millones); indexación anual | Ejercicio 2027\[24\] |
| Retenciones art. 309 | Honorarios de personas físicas al 10% | Alquileres de personas físicas 15% (pago definitivo); honorarios y servicios de personas físicas 15% (pago a cuenta); pagos del Estado 5%; otras rentas 15% | 1-jul-2026\[24\] |
| Pagos al exterior | Retención general | **15%** definitivo sobre regalías, licencias de software, publicidad en línea y almacenamiento de datos (arts. 305-1 y 305-2); el resto a la tasa del art. 297 | 1-jul-2026\[2\] |
| Cheques y transferencias | 0.15% | **0.20%** (2 por mil) | 3-jul-2026\[1\] |
| Recargo por mora | 10% el primer mes y 4% los siguientes (régimen anterior) | 3% por mes o fracción, con tope de 100%;\[25\] descuentos por pronto pago de 90/70/50/30% | 1-jul-2026\[2\] |
| Interés indemnizatorio | 1.10% mensual\[25\] | Tasa activa promedio publicada por el BCRD + 30 puntos básicos, fijada cada año\[2\] | Enero 2027\[2\] |
| Anticipos ISR | Tasa efectiva ≤ 1.5%: 1.5% de los ingresos brutos; > 1.5%: 1/12 del impuesto liquidado | Medianas y grandes igual; pequeñas y personas físicas: 100% del impuesto anterior pagado en los meses 6 (50%), 9 (30%) y 12 (20%); microempresas y sector agropecuario exentos | Ejercicio 2027\[24\]\[26\] |
| RST | Régimen anterior | Modalidad por ingresos (hasta RD$30 millones para personas jurídicas de servicios y producción; RD$15 millones para profesionales y agro) y modalidad por compras (hasta RD$60 millones) | 2027 o cuando se emita el reglamento\[24\]\[27\] |
| Depreciación | Tasas ordinarias | Depreciación acelerada al doble para maquinaria industrial nueva (capítulos 84 y 85 del Arancel, vida útil ≥ 5 años) | Según la lista que publique la DGII\[24\] |
| ITBIS | — | Percepción en aduana a importadores no registrados (ITBIS + 30% de valor agregado);\[2\] nuevas exenciones (leche, agua, pastas, asfalto, ambulancias, etc.) | Vigencia general\[24\] |
| Otros | 1% por constitución de sociedades; 2% a operaciones inmobiliarias | 1% derogado; operaciones inmobiliarias al 1% en 2027 y eliminadas en 2028; ganancia de capital inmobiliaria de personas físicas al 10% definitivo; amnistía fiscal hasta el 31-12-2026 | Escalonada\[24\] |

**Discrepancias en las fuentes.** El informe de Guzmán Ariza dice que la ley "mantiene" el impuesto de 2 por mil a cheques.\[2\] Los bancos, la prensa y Alegra/Siempre al Día informan un aumento de 0.15% a 0.20% desde el 3 de julio de 2026. Según El Nacional (3-jul-2026), los principales bancos del país comenzaron ese día a notificar a sus clientes que la tasa pasó de 0.15% a 0.20%, así que hoy se cobra el **0.20%**. También es un dato aportado por fuentes secundarias que la tasa anterior de retención por honorarios fuera del 10%. En los dos casos, verificar contra el texto oficial publicado en la Gaceta antes de fijar los valores.

### 2.3 ITBIS

- **Tasas:** 18% general; **16%** para yogur, mantequilla, café, aceites y grasas comestibles, azúcares, cacao y chocolate; 0% para exportaciones.\[28\]\[29\] Los bienes exentos (art. 343 y siguientes) incluyen productos agropecuarios en estado natural, medicinas, educación, salud, alquiler de vivienda, energía eléctrica y servicios financieros, entre otros.
- **Mecánica de cálculo:** ITBIS a pagar = débito fiscal (ventas) − crédito fiscal (ITBIS de compras soportado con B01/E31) − retenciones que le hicieron − saldos a favor.
  - **Proporcionalidad (art. 349):** cuando la empresa tiene ventas gravadas y exentas, solo acredita la proporción gravada. Se necesita un coeficiente mensual y un ajuste anual.
  - El ITBIS no acreditable se lleva al costo o al gasto.
- **Retenciones de ITBIS:**

| Caso | Retención | Base legal |
|---|---|---|
| Persona jurídica que paga servicios profesionales, alquiler, etc. a otra persona jurídica | 30% del ITBIS facturado | NG 02-05 (arts. 1, 2 y 5, modificados por NG 07-09)\[30\] |
| Pagos a personas físicas por servicios gravados | 100% | NG 02-05 / Reg. 293-11\[31\] |
| Seguridad y vigilancia, limpieza, transporte de carga, entre otros | 100% | NG 07-09\[31\] |
| Compras de bienes a personas físicas o a no registrados (B11/E41) | 100% | Reg. 293-11, art. 25\[30\] |
| Compras a contribuyentes acogidos al RST | 100% | Decreto 265-19\[30\] |
| Cobros con tarjeta de crédito o débito (retención del adquirente) | 2% del monto | Normativa DGII\[32\] |
| Estado y sus instituciones | 100% | Normativa DGII\[33\] |

  Los gastos sujetos a retención solo son deducibles para el ISR si la retención se practicó y se pagó (NG 02-05, art. 7).\[34\] Esta regla debe ser una validación del sistema.
- **Declaración IT-1** con su Anexo A, presentada y pagada **a más tardar el día 20** del mes siguiente; las retenciones practicadas se declaran en la misma fecha. Antes de presentarla hay que remitir los formatos 606 y 607, y la DGII cruza el IT-1 con el 606 y el 607.\[35\]\[36\]\[37\]

### 2.4 ISR y otros impuestos directos

- **Personas jurídicas:** 27% sobre la renta neta imponible, o 30% en 2026–2028 para ingresos ≥ RD$1,000 millones. **IR-2** y pago dentro de los 120 días siguientes al cierre. Fechas límite 2026: 30 de abril para cierres al 31 de diciembre; 29 de julio para el 31 de marzo; 28 de octubre para el 30 de junio; 28 de enero para el 30 de septiembre.\[25\]
- **Impuesto sobre los Activos (ISA):** 1% del total de activos imponibles, sin ajuste por inflación y neto de depreciación, amortización y reservas. Se declara junto al IR-2 y se paga en 2 cuotas, la segunda 6 meses después.\[25\] El ISR liquidado se acredita contra el ISA, que funciona como un impuesto mínimo. Están exentas las empresas que, por ley, están exentas del ISR.\[25\]
- **Personas físicas:** **IR-1** hasta el 31 de marzo.\[25\] Escala 2026 (anual):

| Renta neta anual 2026 | ISR |
|---|---|
| Hasta RD$416,220.00 | Exento |
| RD$416,220.01 – RD$624,329.00 | 15% del excedente de RD$416,220.01 |
| RD$624,329.01 – RD$867,123.00 | RD$31,216 + 20% del excedente de RD$624,329.01 |
| Más de RD$867,123.01 | RD$79,776 + 25% del excedente de RD$867,123.01\[25\] |

  Escala desde 2027 (Ley 30-26):

| Renta neta anual 2027 | ISR |
|---|---|
| Hasta RD$480,000 | Exento\[24\] |
| RD$480,000.01 – RD$685,000 | 15% del excedente\[24\] |
| RD$685,000.01 – RD$910,000 | RD$30,750 + 20% del excedente\[24\] |
| RD$910,000.01 – RD$4,800,000 | RD$75,750 + 25% del excedente\[24\] |
| Más de RD$4,800,000 | RD$1,048,250 + 27% del excedente\[24\] |

- **Asalariados:** el ISR se retiene sobre el salario menos la TSS del trabajador (5.91%), anualizado.\[38\] Se declara en el **IR-3** hasta el día 10. La regalía pascual (1/12 del salario ordinario) está exenta de ISR; la Ley 30-26, art. 33, lo confirma aunque el monto supere 5 salarios mínimos.\[24\]
- **Otras retenciones:** **IR-17** hasta el día 10.\[25\] Incluye las retenciones del art. 309, los dividendos (10%, pago definitivo), los intereses y los pagos a no residentes (art. 305). A estos últimos se aplica el 15% de los arts. 305-1 y 305-2 en los casos indicados.\[24\]
- **Gastos deducibles:** deben ser necesarios para producir la renta y estar soportados con comprobante válido para crédito fiscal (B01/E31, B11/E41, B13/E43, B17/E47). Los respaldados con B02/E32 no son deducibles.\[39\]
  - Deben haberse practicado las retenciones que correspondan.
  - Hay límites para ciertos conceptos: donaciones, intereses (subcapitalización), y gastos de representación y personales.
  - El software debe marcar cada gasto como "admitido" o "no admitido" para la conciliación fiscal del IR-2.
- **Depreciación fiscal (art. 287 CT y Reglamento 139-98):**

| Categoría | Activos | Tasa | Método |
|---|---|---|---|
| 1 | Edificaciones y sus componentes estructurales | 5% | Línea recta, activo por activo\[40\] |
| 2 | Automóviles y camiones livianos, muebles y equipo de oficina, computadoras, sistemas de información | 25% | Saldo decreciente sobre la cuenta conjunta de la categoría\[40\] |
| 3 | Cualquier otro bien depreciable | 15% | Saldo decreciente sobre la cuenta conjunta de la categoría\[40\] |

  Reglas adicionales:
  - Los bienes dados en arrendamiento se deprecian al 50% (categoría 2) y al 30% (categoría 3).\[40\]
  - En el año de adquisición, la DGII indica aplicar la tasa sobre el 50% del valor del bien.\[41\]
  - En las categorías 2 y 3 se excluye el ITBIS del valor inicial.\[41\]
  - El ajuste por inflación de terrenos y bienes de la categoría 1 se calcula con el multiplicador de inflación antes de depreciar.\[42\]
  - **Implicación:** el módulo de activos fijos necesita dos libros, NIIF y fiscal. La diferencia entre ambos alimenta la NIC 12 (impuesto diferido) y el anexo del IR-2.
- **Pérdidas fiscales:** compensables por 5 años, con límites anuales del 20% (y en el cuarto año, 80% de la renta). El sistema debe llevar un registro de pérdidas por año de origen.
- **Precios de transferencia (art. 281 CT, NG 04-2011 y normas posteriores):** operaciones con partes relacionadas y con regímenes de baja tributación. Requiere la declaración informativa de operaciones con relacionados (DIOR) y un estudio. El software debe marcar a los terceros como relacionados y generar reportes por contraparte.

### 2.5 Comprobantes fiscales: NCF y e-CF

**Tipos (Norma 06-2018 y Ley 32-23):**

| NCF papel | e-CF | Nombre | Uso |
|---|---|---|---|
| B01 | E31 | Factura de Crédito Fiscal | Ventas a contribuyentes; da derecho a crédito de ITBIS y sustenta el gasto\[43\] |
| B02 | E32 | Factura de Consumo | Consumidor final; no sustenta gasto\[44\] |
| B03 | E33 | Nota de Débito | Aumenta el valor de un comprobante\[43\] |
| B04 | E34 | Nota de Crédito | Devoluciones, descuentos, anulaciones\[39\] |
| B11 | E41 | Comprobante de Compras | La empresa lo emite al comprar a no registrados (retención del 100% de ITBIS)\[44\] |
| B13 | E43 | Gastos Menores | Gastos menores de personal (peajes, transporte)\[39\] |
| B14 | E44 | Regímenes Especiales | Ventas exentas a zonas francas y otros regímenes\[39\] |
| B15 | E45 | Gubernamental | Ventas al Estado\[39\] |
| B16 | E46 | Exportaciones | Ventas al exterior\[39\] |
| B17 | E47 | Pagos al Exterior | Pagos a no residentes con retención\[39\] |

- **Estructura:** el NCF tiene 11 posiciones (B + 2 dígitos de tipo + 8 de secuencia). El e-NCF tiene **13 posiciones**: la letra E, 2 dígitos de tipo y 10 de secuencia\[20\] (por ejemplo, E310000000001).\[43\]\[45\]
- **Vigencia de las secuencias:** desde la autorización hasta el 31 de diciembre del año siguiente.\[20\] Los tipos 32 y 34 no tienen fecha de vencimiento de secuencia.\[46\]

**Calendario de obligatoriedad (Ley 32-23, art. 37, y avisos DGII):**

| Clasificación DGII | Plazo | Estado a oct. 2026 |
|---|---|---|
| Grandes Contribuyentes Nacionales | 12 meses (grupos en enero, marzo y mayo de 2024)\[47\] | Vencido\[48\] |
| Grandes Locales y Medianos | 24 meses (15-may-2025), con prórroga a nov-2025\[49\] | Desde el **1-nov-2026** emiten **solo** e-CF;\[50\] las secuencias B valen solo hasta el 31-oct-2026, salvo contingencia (art. 55 del Reglamento, según la DGII) |
| Pequeños, Micro y No Clasificados | 36 meses (15-may-2026) | Prórroga automática, sin solicitud, de 6 meses contados desde el 15-may-2026 (**Aviso 06-26**, 6-may-2026): **15-nov-2026** |

**Requisitos técnicos del e-CF:**
- **Certificación como emisor (DGII, proceso de 3 etapas).**
  - Requisitos previos: RNC, clave de la Oficina Virtual, "Alta NCF", certificado digital emitido por una prestadora de servicios de confianza autorizada por INDOTEL, software de e-CF y estar al día con las obligaciones.\[51\] Hay fuentes secundarias que afirman que el Decreto 587-24 eliminó este último requisito;\[52\]\[53\] la guía de la DGII de julio de 2025 todavía lo exige.
  - Etapa 1, solicitud: formulario FI-GDF-016 y postulación con las URL de Recepción, Aprobación comercial y Autenticación.\[51\]
  - Etapa 2, set de pruebas:
    - pruebas de datos (XML con los datos que entrega la DGII, en el mismo orden);\[51\]
    - pruebas de simulación con operaciones reales y la representación impresa en PDF;\[51\]
    - pruebas de comunicación (acuses y aprobaciones comerciales);\[51\]
    - registro de las URL de producción;\[51\]
    - declaración jurada firmada.\[51\]
  - Etapa 3, certificación.
- **Tres formas de emitir (Ley 32-23, art. 12):** desarrollo propio; un Proveedor de Servicios de Facturación Electrónica certificado por la DGII (Decreto 587-24 y NG 10-2021); o el **Facturador Gratuito** de la DGII.\[54\] Según la DGII, con el Facturador Gratuito "se pueden emitir un aproximado de 150 facturas mensualmente". Ese tope lo puede ajustar la DGII mediante aviso, y no hay monto límite por factura. Además funciona solo en pesos, sin impuestos adicionales ni propina, guarda los documentos 2 años y no se integra con otros sistemas. **Oportunidad comercial:** las PYMES que superen esos límites necesitan un software como el que se propone.
- **Flujo técnico:**
  1. Autenticación: el sistema pide una semilla XML, la firma y recibe un token (Bearer) con fecha de expiración.\[46\]\[55\]
  2. Construcción del XML según los XSD de la DGII (e-CF 31 a 47, versión 1.0, actualizados en oct-2025 y abr-2026).\[56\]\[57\]
  3. Firma **XMLDSig enveloped** con certificado .p12: canonicalización C14N, **RSA-SHA256**, digest SHA-256, `Reference URI=""`, y la firma como último hijo de `<ECF>`.\[58\]\[59\]
  4. Envío a la DGII, que devuelve un TrackID; la DGII responde Aceptado, Aceptado Condicional, Rechazado o En proceso.\[20\]
  5. Envío al receptor electrónico, que devuelve un acuse de recibo (ARECF) y, si quiere, una aprobación o rechazo comercial (ACECF), que también comunica a la DGII.\[20\]
  6. Las facturas de consumo **E32 menores de RD$250,000** no se envían completas: se envía un resumen (RFCE) y el XML completo se conserva.\[20\]\[46\]\[60\]
  7. **Código de seguridad:** los primeros 6 caracteres del hash del SignatureValue.\[20\]\[21\]
  8. **Representación impresa** con código QR que apunta a la consulta de timbre de la DGII (mínimo 22×22 mm), con el código de seguridad y la fecha de firma debajo.\[20\]
  9. **Anulación (ANECF):** solo para rangos sin usar o e-CF firmados que no se enviaron. Cualquier otra corrección se hace con nota de crédito o de débito.\[20\] Un e-CF firmado y enviado **no se puede modificar** (art. 7).\[54\]
  10. **Contingencia (Decreto 587-24, arts. 40-43):**
      - sin conexión: se emite y se envía en un máximo de **72 horas**, con la leyenda "e-CF emitido en modalidad de contingencia";\[20\]
      - si no es posible emitir e-CF: se usan secuencias en papel autorizadas por un máximo de 15 días calendario, se notifica la contingencia y se regularizan los e-CF en 30 días;\[20\]\[61\]
      - si la caída es de la DGII: se guardan los e-CF y se envían cuando se restablezca el servicio.\[20\]
- **Sanciones:** las infracciones del art. 26 de la Ley 32-23 se castigan según el art. 257 del Código Tributario: multa de 5 a 30 salarios mínimos, y hasta 0.25% de los ingresos del año anterior en ciertos incumplimientos de envío de información.\[54\]\[62\] Las facturas apócrifas tienen pena de 1 a 5 años de prisión y cierre del negocio (art. 30).\[54\]
- **Incentivos (art. 41):** créditos fiscales de RD$300 mil, 200 mil, 75 mil y 25 mil según el tamaño, para quienes se habilitaron en el período voluntario.\[54\]

### 2.6 Formatos de envío de datos (NG 07-2018)

| Formato | Contenido | Plazo |
|---|---|---|
| 606 | Compras de bienes y servicios: RNC o cédula del proveedor, tipo de bien o servicio, NCF o e-NCF, NCF modificado, fechas de comprobante y de pago, montos de servicios y bienes, ITBIS facturado, retenido, sujeto a proporcionalidad, llevado al costo y por adelantar, retenciones de ISR, ISC, otros impuestos, propina legal y forma de pago (unas 23 columnas) | Día 15 del mes siguiente (se presenta aunque no haya operaciones)\[63\] |
| 607 | Ventas: identificación del cliente, NCF, tipo de ingreso, fechas, montos, ITBIS, retenciones de terceros, forma de cobro (efectivo, cheque, tarjeta, crédito, permuta) | Día 15\[64\] |
| 608 | Comprobantes anulados, con su motivo | Día 15\[65\] |
| 609 | Pagos al exterior | Día 15\[66\] |
| 623 y otros | Informativos especiales (por ejemplo, ciertas donaciones y operaciones de sectores específicos) | Según la norma |

- Validaciones que el software debe aplicar: período AAAAMM, fechas AAAAMMDD, RNC válido, tipos de comprobante coherentes con la operación, máximo de registros por archivo, cuadre 607 = IT-1 y cuadre del 606 con el crédito de ITBIS.\[36\]\[67\]
- La DGII ofrece herramientas de prevalidación; el software debe generar los TXT o Excel con el formato oficial y guardar los acuses.\[68\]
- Con e-CF, la DGII ya recibe los datos en línea, pero el 606 y el 607 complementarios siguen existiendo para documentos no electrónicos. Quien emite con el Facturador Gratuito ya no presenta el 607 de esos e-CF.\[21\]

### 2.7 Otros impuestos y regímenes

- **ISC:**
  - Alcohol y tabaco: la base ad valorem es ahora el precio final al consumidor; 20% adicional al tabaco; 55% a vapeadores.\[2\]
  - Telecomunicaciones y seguros: el ISC a seguros de vida baja a 11% en 2027 y a 6% en 2028, y queda exento en 2029.\[2\]
  - Combustibles; contribución al GLP de US$174.50 por tonelada.\[2\]
- **IPI** (patrimonio inmobiliario), sucesiones, donaciones y vehículos: importan solo para personas físicas y patrimonio; se pueden integrar más adelante.
- **Regímenes especiales:**
  - Zonas francas (Ley 8-90): ventas con B14/E44 y exención de ITBIS.
  - Proindustria (Ley 392-07).
  - Turismo (Ley 158-01).
  - MIPYMES (Ley 488-08), con clasificación por tamaño.
  - RST: modelado como "régimen" en la ficha de la empresa, con sus propias declaraciones y retenciones.
- **Calendario fiscal mensual base:**
  - día 10: IR-3, IR-17 y pago de TSS (el SUIR factura las notificaciones);
  - día 15: anticipos de ISR (según el régimen) y formatos 606/607/608/609;
  - día 20: IT-1 e ISC;
  - en el año: IR-2 e ISA a los 120 días del cierre, IR-1 el 31 de marzo, IR-13 y DIOR según la norma.
  - Si el vencimiento cae en día no laborable, pasa al siguiente día laborable.\[25\]

### 2.8 Nómina y seguridad social

**TSS (Ley 87-01), topes desde el 1-feb-2026 (Resolución 01-2025; salario mínimo nacional para topes: RD$23,223):**\[69\]\[70\]

| Seguro | Empleado | Empleador | Tope mensual |
|---|---|---|---|
| Pensiones (AFP / SVDS) | 2.87% | 7.10% | RD$464,460 (20 SM)\[71\]\[72\] |
| Seguro Familiar de Salud (SFS) | 3.04% | 7.09% | RD$232,230 (10 SM)\[73\] |
| Riesgos Laborales (SRL) | — | 1.10%–1.30%: cuota fija de 1% más 0.10%–0.30% según el nivel de riesgo (Alegra, guía TSS 2026) | RD$92,892 (4 SM) |
| INFOTEP | 0.5% de las bonificaciones (empleado) | 1% de la nómina | — |

Las fuentes secundarias no coinciden en los decimales de algunos aportes del empleador (SRL de 1.10% a 1.40%, y una partida de solidaridad incluida o no).\[74\] El sistema debe guardarlos como parámetros y verificarlos contra la notificación del SUIR.

**Código de Trabajo (Ley 16-92):**

| Concepto | Regla |
|---|---|
| Salario diario | Salario mensual ÷ 23.83\[75\] |
| Preaviso (art. 76) | 7 días (3 a 6 meses); 14 días (6 meses a 1 año); 28 días (más de 1 año)\[76\] |
| Auxilio de cesantía (art. 80) | 6 días (3 a 6 meses); 13 días (6 a 12 meses); 21 días por año (1 a 5 años); 23 días por año (más de 5 años)\[77\] |
| Vacaciones (art. 177) | 14 días laborables (1 a 5 años); 18 días (más de 5 años)\[77\] |
| Salario de Navidad o regalía (art. 219) | 1/12 de lo devengado en el año; se paga a más tardar el 20 de diciembre; exento de ISR y de TSS\[77\]\[78\] |
| Horas extra | Recargos del 35% y 100% según el tramo (art. 203); nocturnidad y días feriados según la ley |
| Exención | Preaviso y cesantía no pagan ISR (art. 86)\[76\] |

El módulo de nómina debe generar:
- el archivo de autodeterminación para el SUIR/TSS;
- el IR-3 y su anexo (IR-4/IR-13);
- las provisiones mensuales de regalía, vacaciones y prestaciones;
- el asiento contable automático por centro de costo.

### 2.9 Comparación internacional (referencias de diseño)

- **IVA y sociedades.** El ITBIS es un IVA clásico de débito menos crédito; el 27% de ISR corporativo está en el rango latinoamericano.
- **BEPS y Pillar Two.** El impuesto mínimo global del 15% alcanza a grupos con ingresos de €750 millones o más. El 5 de enero de 2026, el Marco Inclusivo (147 miembros) aprobó el paquete "Side-by-Side", que exime a los grupos con matriz en EE. UU. de partes clave de las reglas GloBE. Según Baker McKenzie, su puerto seguro Side-by-Side permite eximir a los miembros del grupo de la IIR y la UTPR en los ejercicios iniciados desde el 1 de enero de 2026. Según BDO, EE. UU. es por ahora la única jurisdicción con régimen SbS cualificado. Basta con permitir reportes país por país y tasa efectiva por jurisdicción en la consolidación.
- **Facturación electrónica en LatAm:** México (CFDI 4.0 timbrado por un PAC), Colombia (validación previa DIAN con CUFE) y Chile (DTE del SII con aceptación o reclamo). RD sigue un modelo de validación casi en tiempo real con aprobación comercial, parecido al chileno; un adaptador por país sobre un modelo de documento común permite expandirse.

---

## 3. Contabilidad de costos

### 3.1 Sistemas que conviene soportar

| Sistema | Cuándo usarlo | Requisitos del software |
|---|---|---|
| Por órdenes de trabajo | Manufactura a pedido, construcción, imprentas, servicios por proyecto | Hoja de costo por orden; consumo de materiales; horas de mano de obra; asignación de costos indirectos; productos en proceso por orden |
| Por procesos | Producción continua (alimentos, bebidas, cemento) | Unidades equivalentes; informe de costo de producción por departamento; FIFO o promedio; mermas normales y anormales |
| Estándar | Control de eficiencia | Estándares de precio y cantidad por insumo; cálculo de variaciones |
| ABC (por actividades) | Muchos productos y costos indirectos altos | Pools de actividades, inductores de costo, asignación de varias etapas |
| Directo o variable vs. absorción | Gestión (directo) vs. NIIF y fiscal (absorción) | Doble valoración del inventario; conciliación de utilidades |
| Costeo conjunto y subproductos | Agroindustria, refinación | Asignación por valor de venta en el punto de separación, unidades físicas o valor neto realizable |
| Costeo objetivo y kaizen | Diseño de producto y mejora continua | Precio meta − margen = costo meta; seguimiento de reducciones período a período |

### 3.2 Elementos y variaciones

- **Materia prima** (lista de materiales, consumos, mermas), **mano de obra** (tarifas por hora con cargas sociales: TSS, INFOTEP, provisiones) y **costos indirectos de fabricación** (tasa predeterminada = costos indirectos presupuestados ÷ base presupuestada, como horas máquina o de mano de obra).
- **Variaciones:**
  - Materiales: precio = (PR − PE) × QR; cantidad = (QR − QE) × PE.
  - Mano de obra: tarifa y eficiencia.
  - Costos indirectos: gasto (presupuesto) y volumen (capacidad).
- **NIC 2:** la asignación de costos indirectos fijos se basa en la **capacidad normal**. El costo no asignado por baja producción va a gasto y las mermas anormales no se capitalizan.

### 3.3 Valuación e inventarios

- Métodos permitidos bajo NIIF: **FIFO (PEPS)** y **promedio ponderado** (móvil o periódico). **LIFO prohibido** por la NIC 2 (US GAAP sí lo permite).
- **Perpetuo vs. periódico:** recomendar el perpetuo, con costo de ventas automático en cada despacho y conteos cíclicos.
- **Ajuste a valor neto realizable** al cierre, con reversión cuando corresponda.
- **Sectores:** construcción (NIIF 15 por grado de avance); agro (NIC 41, activos biológicos a valor razonable menos costos de venta); servicios (costeo por proyecto u hora).

### 3.4 Requisitos fiscales dominicanos sobre inventarios

- El costo de ventas del IR-2 se calcula como inventario inicial + compras − inventario final, y debe cuadrar con el 606 y las importaciones.
- El inventario final debe estar respaldado por un **conteo físico** al cierre.
- Las mermas y destrucciones deben documentarse (actas, en algunos casos con notificación a la DGII) para que sean deducibles.
- El ITBIS no acreditable va al costo.
- Las diferencias entre el inventario NIIF y el fiscal (por ejemplo, la provisión de obsolescencia no admitida) generan una partida de conciliación y, en su caso, un impuesto diferido.

---

## 4. Contabilidad administrativa / gerencial

| Herramienta | Funcionalidad que debe tener el software |
|---|---|
| Presupuesto maestro | Ventas → producción → compras → mano de obra → costos indirectos → gastos → estado de resultados y balance proyectados → flujo de caja |
| Presupuesto flexible | Recalcular el presupuesto con el volumen real; variaciones de gasto vs. volumen |
| Presupuesto base cero | Paquetes de decisión con justificación desde cero |
| Costo-volumen-utilidad | Margen de contribución, punto de equilibrio (CF ÷ MC unitario), mezcla de productos, margen de seguridad, apalancamiento operativo |
| Centros de responsabilidad | Centros de costo, ingreso, utilidad e inversión (ROI, ingreso residual, EVA) |
| Segmentos | Contabilidad por dimensiones: sucursal, línea, canal, cliente; también sirve para la NIIF 8 en empresas que cotizan |
| Precios de transferencia internos | Precio de mercado, costo más margen o negociado entre unidades; separado de los precios de transferencia fiscales con relacionados |
| Ratios y KPI | Liquidez (corriente, prueba ácida), endeudamiento, rotaciones (DSO, DIO, DPO, ciclo de caja), rentabilidad (margen bruto y operativo, ROA, ROE), EBITDA (como medida de la gerencia bajo NIIF 18) |
| Balanced Scorecard | Perspectivas financiera, de clientes, de procesos y de aprendizaje, con metas y semáforos |
| Rentabilidad | Por producto, cliente y vendedor, con costeo ABC |
| Flujo de caja proyectado | A partir de CxC (vencimientos), CxP, nómina, impuestos (calendario fiscal) y presupuesto |
| Decisiones | Costos relevantes: fabricar o comprar, pedidos especiales, cerrar líneas, recursos escasos |
| Dashboards | Tiempo real, con detalle hasta el documento y alertas (por ejemplo, ITBIS por pagar o vencimientos de la DGII) |

---

## 5. Requisitos funcionales y técnicos del software

### 5.1 Módulos y asientos automáticos

| Módulo | Asientos automáticos típicos |
|---|---|
| Ventas y facturación (e-CF) | CxC / Ingresos / ITBIS por pagar / ISC; costo de ventas / inventario |
| Cuentas por cobrar | Cobros, retenciones que nos hacen (ITBIS 30/100%, ISR), deterioro |
| Compras y CxP | Gasto o inventario / ITBIS por adelantar / CxP / retenciones por pagar; E41 y E43 autogenerados |
| Bancos y tesorería | Pagos, cobros, impuesto de 0.20%, comisiones, diferencias cambiarias |
| Inventarios y producción | Entradas, salidas, ajustes, valor neto realizable; consumos, costos indirectos aplicados, variaciones |
| Activos fijos | Altas, depreciación NIIF y fiscal, bajas, revaluación, derecho de uso |
| Nómina | Gasto por centro de costo / TSS / ISR retenido / provisiones / INFOTEP |
| Impuestos y consolidación | Liquidación de ITBIS, anticipos, ISR corriente y diferido, ISA; eliminaciones y conversión |

### 5.2 Principios de diseño obligatorios

1. **Partida doble validada en la base de datos:** cada asiento cuadra (débitos = créditos) en moneda funcional y en moneda de transacción.
2. **Inmutabilidad:** un asiento contabilizado no se edita ni se borra; solo se revierte con otro asiento (cumple además el art. 7 de la Ley 32-23 para e-CF). Usar event sourcing o tablas append-only y, si se quiere, un hash encadenado por asiento.
3. **Pista de auditoría:** quién, cuándo, desde qué IP, el valor anterior y el nuevo en los datos maestros, y aprobaciones.
4. **Períodos abiertos y cerrados por módulo,** con reapertura controlada que exige rol y motivo.
5. **Segregación de funciones** (COSO, y SOX como referencia): quien crea un proveedor no lo paga; quien registra no aprueba. Roles y permisos granulares y una matriz de conflictos.
6. **Multiempresa y multimoneda:** monedas de transacción, funcional y de presentación, con historial de tasas del BCRD.
7. **Redondeos:** cálculo de ITBIS por línea o por total según las reglas del XSD; cuentas de diferencia por redondeo; tipos decimales (nunca float).
8. **Numeración secuencial** de asientos y documentos sin huecos; control de secuencias e-NCF con alertas antes de que venzan o se agoten.
9. **Motor de reglas fiscales con vigencia temporal:** tasas, tramos, topes y retenciones en tablas con "válido desde / válido hasta", para absorber cambios como los de la Ley 30-26.
10. **Integraciones:** API REST y webhooks, importación de extractos bancarios, conexión con POS y comercio electrónico.

### 5.3 Requisitos legales del software en RD

- **DGII / e-CF:** certificación propia como emisor o como Proveedor de Servicios de Facturación Electrónica (Decreto 587-24 y NG 10-2021). Ser proveedor exige certificar el software, cumplir los servicios mínimos y responder ante la DGII; si incumple, pierde la autorización.\[79\] Para un emprendedor, una buena **estrategia en etapas** es empezar con la certificación por cliente (o aliarse con un proveedor ya certificado) y luego certificarse como proveedor.
- **Firma digital (Ley 126-02):** los certificados los emiten entidades autorizadas por INDOTEL.\[21\]\[54\] Hay que guardar el .p12 cifrado (HSM o KMS) y nunca exponer la clave privada.
- **Protección de datos (Ley 172-13):** consentimiento, finalidad, derechos de acceso, rectificación, cancelación y oposición, y seguridad de los datos personales de empleados y clientes. Cifrar en tránsito y en reposo, y firmar un contrato de encargado de tratamiento con los clientes del SaaS.
- **Conservación:** 10 años, para XML firmados, acuses, representaciones impresas y libros.\[80\]\[81\]

### 5.4 Software de referencia

- **Odoo** (multiempresa, localizaciones comunitarias para RD con NCF/e-CF y 606/607), **SAP Business One** (costos y producción, socios locales para e-CF), **QuickBooks y Xero** (buena experiencia de uso, sin localización dominicana nativa) y **Alegra** (facturación electrónica, nómina y 606/607/608 para RD).\[66\]\[82\]
- La diferenciación posible está en cumplir completo con la DGII y la TSS, en el costeo industrial y en el cierre guiado.

---

## 6. Arquitectura de módulos recomendada

- **Capa de presentación:** web y móvil, portal de clientes y proveedores, detrás de un API Gateway con IAM (roles, MFA, segregación de funciones).
- **Operaciones:** ventas/POS, compras/CxP, CxC/tesorería, inventario, producción, activos fijos, nómina (TSS).
- **Núcleo contable:** catálogo y dimensiones, libro mayor append-only, períodos y cierre, multimoneda, consolidación, libros NIIF y fiscal.
- **Cumplimiento:** motor de reglas fiscales con vigencia; servicio e-CF (XML, firma, token, TrackID, RFCE, ANECF, contingencia); generador de 606/607/608/609, IT-1, IR-17, IR-3 e IR-2.
- **Bus de eventos:** cada documento de negocio publica un evento y el motor de contabilización genera el asiento.
- **Analítica:** costos, presupuestos, KPI y dashboards sobre un data warehouse.
- **Archivo documental** inmutable por 10 años, con backups y bitácora de auditoría.

**Decisiones clave:**
- Los documentos de negocio son la fuente de la verdad y los asientos se derivan de ellos mediante plantillas de contabilización configurables.
- El servicio e-CF va aislado, con colas y reintentos, para que una caída de la DGII no bloquee la venta (contingencia de 72 horas).
- Los parámetros legales (tasas, topes, escalas, plazos) son datos versionados, no código.

---

## 7. Checklists

### 7.1 Cierre mensual

1. Emitir y enviar todos los e-CF; resolver los rechazados y los aceptados condicionales; enviar el RFCE de las E32 menores de RD$250 mil.
2. Registrar las compras del mes y validar sus e-NCF y NCF; generar los E41 y E43.
3. Conciliar bancos, incluido el impuesto de 0.20% y las retenciones de tarjetas.
4. Procesar la nómina; registrar las provisiones de regalía, vacaciones y prestaciones; pagar la TSS.
5. Correr la depreciación NIIF y la fiscal.
6. Reexpresar las partidas en moneda extranjera con la tasa del BCRD.
7. Valorar inventario y costos; analizar variaciones; ajustar a valor neto realizable.
8. Conciliar CxC, CxP, inventario y activos contra el mayor.
9. Hacer devengos y diferidos.
10. Generar 606/607/608/609 hasta el **día 15**; IR-3 e IR-17 hasta el **día 10**; IT-1 hasta el **día 20**; anticipos.
11. Revisar la balanza, cerrar el período por módulo y emitir los reportes gerenciales.

### 7.2 Cierre anual

1. Conteo físico de inventario y de activos fijos; actas de mermas.
2. Pruebas de deterioro (NIC 36); pérdida esperada o antigüedad de cartera.
3. Conciliación fiscal: gastos no admitidos, depreciación del art. 287, ajuste por inflación, pérdidas compensables.
4. ISR corriente (27% o 30%), ISA (1%) e impuesto diferido (NIC 12).
5. Asiento de cierre de resultados, reserva legal y asiento de apertura.
6. Estados financieros NIIF con notas; desde 2027, formato NIIF 18 o NIIF PYMES 2025 con comparativos reexpresados.
7. Auditoría externa y comisario; informe de gestión en 90 días; asamblea en **120 días**.
8. IR-2 con sus anexos dentro de los 120 días; IR-1 (personas físicas) el 31 de marzo; IR-13 y DIOR si aplican.
9. Archivar todo durante 10 años.

### 7.3 Checklist de cumplimiento legal del software

- [ ] Libro mayor de partida doble inmutable, con pista de auditoría completa.
- [ ] Marco contable configurable: NIIF completas o NIIF PYMES (2015 o 2025), y NIIF 18 desde 2027.
- [ ] Doble libro NIIF / fiscal para activos e inventarios; impuesto diferido.
- [ ] Emisión, recepción, acuse, aprobación comercial, RFCE, ANECF y contingencia de e-CF 31 a 47, con XSD vigentes y firma XMLDSig RSA-SHA256.
- [ ] Representación impresa con QR y código de seguridad.
- [ ] Control de secuencias e-NCF y alertas de vencimiento.
- [ ] Retenciones de ITBIS (30%, 100%, 2%) e ISR (art. 309, nuevas tasas desde el 1-jul-2026; 15% a pagos digitales al exterior).
- [ ] Generadores 606/607/608/609, IT-1, IR-17, IR-3, IR-2 e ISA, con validaciones y cuadres.
- [ ] Parámetros con vigencia: ISR 27%/30%, escalas 2026 y 2027, topes TSS 2026, tasas ITBIS 18/16%, impuesto de 0.20%, recargo de 3% e interés indemnizatorio BCRD + 30 pb.
- [ ] Nómina conforme a la Ley 87-01 y la Ley 16-92, con archivo para SUIR.
- [ ] Gobierno corporativo según la Ley 479-08: actas, accionistas, plazos de 90 y 120 días.
- [ ] Protección de datos (Ley 172-13), custodia de certificados (Ley 126-02) y conservación por 10 años.
- [ ] Calendario fiscal integrado con alertas (días 10, 15 y 20; 120 días; 31 de marzo).

---

## 8. Recomendaciones

1. **Hoja de ruta.**
   - **Versión 1 (PYMES):** libro mayor, CxC, CxP, bancos, inventario promedio o FIFO, facturación e-CF (31, 32, 33, 34, 41, 43, 45), 606/607/608, IT-1, IR-17 y nómina con TSS. Hay demanda inmediata: los Pequeños, Micro y No Clasificados que tienen que emitir e-CF antes del 15-nov-2026.\[83\]
   - **Versión 2:** activos fijos con doble libro, costos por órdenes y procesos, presupuestos, IR-2 asistido, y NIIF 18 y NIIF PYMES 2025.
   - **Versión 3:** consolidación, multimoneda avanzada, NIIF 16 y NIIF 9 completas, ABC y certificación como Proveedor de Servicios de Facturación Electrónica.
2. **Gobernanza normativa:** tener un contador CPA asesor y suscribirse a las normas y avisos de la DGII. Los reglamentos de la Ley 30-26 (RST, anticipos, percepción) todavía están pendientes y cambiarán parámetros.
3. **Validar con primarias** antes de fijar valores: el texto oficial de la Ley 30-26 (impuesto de 0.20% y tasas del art. 309), el Decreto 587-24 y las resoluciones de la TSS. En este informe se marcaron como conflictos los puntos donde las fuentes secundarias no coinciden.

## 9. Advertencias

- Parte de la información de 2026 (Ley 30-26, prórrogas de e-CF) viene de firmas de abogados, prensa y portales de proveedores (Alegra, Siempre al Día), que coinciden entre sí, y de la página oficial de la DGII sobre ISR. Algunos detalles operativos dependen de reglamentos todavía no emitidos.
- Los montos de las multas en pesos que circulan en blogs no están verificados; la regla legal es de 5 a 30 salarios mínimos (art. 257 CT).\[84\]\[85\]
- Las normas de sectores regulados (bancos, seguros, valores) y los regímenes especiales (zonas francas, turismo, Proindustria) tienen requisitos adicionales que no se detallan aquí.

## Fuentes

1. [Ley 30-26 en República Dominicana: impacto en tu negocio 2026](https://blog.alegra.com/republica-dominicana/ley-30-26-en-republica-dominicana/)
2. [Informe y recomendaciones sobre las principales modificaciones introducidas por la Ley núm. 30-26 de medidas pro crecimiento económico, simplificación fiscal y mitigación de la crisis internacional Guzmán Ariza | La Mejor Firma de Abogados en la República Dominicana](https://drlawyer.com/espanol/informe-y-recomendaciones-sobre-las-principales-modificaciones-introducidas-por-la-ley-num-30-26-de-medidas-pro-crecimiento-economico-simplificacion-fiscal-y-mitigacion-de-la-crisis-internacional/)
3. [Normas Internacionales de Información Financiera (NIIF 18): 2027 parece lejos, pero el reloj ya corre](https://www.diarioestrategia.cl/texto-diario/mostrar/5976612/normas-internacionales-informacion-financiera-niif-18-2027-parece-lejos-pero-reloj-corre)
4. [NIIF 18: cambios en los estados financieros desde 2027](https://www.contabilidadtk.es/niif-18-cambios-estados-financieros-2027-contabilidadtk)
5. [NIIF 18: Impacto clave en la presentación e información de los estados financieros - BDO](https://www.bdo.cr/es-cr/publicaciones/2025/niif-18)
6. [Sale a la luz la Tercera Edición de la NIIF para las PYMES 27 febrero de 2025](https://www.ambitojuridico.com/sites/default/files/2025-02/COM-Tercera-NIIF-PYMES-25.pdf)
7. [Publicada la tercera edición de la NIIF para Pymes](https://actualicese.com/publicada-la-tercera-edicion-de-la-niif-para-pymes/)
8. [IASB publicó hoy la versión 2025 de la NIIF para las PYMES - Comunidad Contable](https://www.comunidadcontable.com/BancoConocimiento/Contador/iasb-publico-hoy-la-version-2025-de-la-niif-para-las-pymes.asp?Miga=1&IDobjetose=24933&CodSeccion=106)
9. [Tercera Edición de la NIIF para PYMES - ERB](https://erb.com.ec/tercera-edicion-de-la-niif-para-pymes/)
10. [NIIF PARA PYMES: Resumen Interactivo 2025 - Deltech Audit](https://deltechaudit.ec/niif-para-pymes-resumen-interactivo-2025/)
11. [Aplicación de las NIIF en República Dominicana %%page%% - TPC Group](https://tpcgroup-int.com/blog/niif/las-niif-en-republica-dominicana/)
12. [Instituto de Contadores Públicos Autorizados de la República Dominicana](https://icpard.org/wp-content/uploads/2022/01/10-RESOLUCION-CONFIRMACION-IMPLEMENTACION-DE-LAS-NIIFS-ACTA-22-2014.pdf)
13. [RESOLUCIÓN DEL 07/10/2021 ACTA No. 07/2020-2022](https://icpard.org/wp-content/uploads/2022/01/2-Resolucion-No.-07-2020-2022-Control-de-Calidad-Modificada-1-1.pdf)
14. [RESOLUCIÓN DEL xx/0x/2022 ACTA NO. xx/2020-2022 QUE](https://icpard.org/wp-content/uploads/2022/07/Borrador-Resolucio%CC%81n-Cumplimiento-Decreto-723-01-Sobre-Sello-Contador.pdf)
15. [-1- Ley General de las Sociedades Comerciales y Empresas Individuales de](https://dgii.gov.do/legislacion/leyesTributarias/Documents/Otras%20Leyes%20de%20Inter%C3%A9s/479-08.pdf)
16. [Ley No. 31-11](https://dgii.gov.do/legislacion/leyesTributarias/Documents/Otras%20Leyes%20de%20Inter%C3%A9s/31-11.pdf)
17. [Obligaciones Anuales de las Sociedades Comerciales - Pellerano & Herrera](https://phlaw.com/es/obligaciones-anuales-sociedades-comerciales/)
18. [ICPARD Barahona: Rol del Comisario de Cuentas en la Ley 479-08 y la importancia del puesto](https://icpardbarahona10.blogspot.com/2010/07/rol-del-comisario-de-cuentas-de-cara-la.html)
19. [Nuevo impuesto a transferencias y cheques: estos son los casos en que se aplicará y en los que no](https://www.diariolibre.com/economia/finanzas/2026/07/02/transferencias-bancarias-conoce-cuando-aplica-y-cuando-no-el-impuesto/3587175)
20. [Informe Técnico Comprobante Fiscal Electrónico Gerencia de Facturación](https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Informe%20y%20Descripci%C3%B3n%20T%C3%A9cnica/Informe%20T%C3%A9cnico%20e-CF%20v1.0.pdf)
21. <https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Preguntas%20frecuentes/Generales/Preguntas-Frecuentes-Facturador-Gratuito.pdf>
22. [Ley 30-26 República Dominicana: qué cambia para tu negocio (2026)](https://miscuentasrd.com/blog/ley-30-26-republica-dominicana-que-cambia-pymes)
23. [Marco Legal](https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Paginas/marcoLegal.aspx)
24. [Reforma al Código Tributario en RD: Ley 30-26 - Siempre al Día](https://siemprealdia.co/republica-dominicana/impuestos/reforma-al-codigo-tributario-ley-30-26/)
25. [Impuesto sobre la Renta](https://dgii.gov.do/cicloContribuyente/obligacionesTributarias/principalesImpuestos/Paginas/impuestoSobreRenta.aspx)
26. [MINISTERIO DE HACIENDA Gastos Tributarios en República Dominicana](https://www.hacienda.gob.do/wp-content/uploads/2023/12/Estimacion_del_Gasto_Tributario_2019.pdf)
27. [Los cambios en impuestos de la Ley 30-26 que entran en vigencia en julio](https://www.elcaribe.com.do/panorama/dinero/calendario-entrada-vigencia-cambios-impositivos-ley-30-26/)
28. [Impuestos Internos on X: "El #ITBIS tiene una tasa general de 18%, una tasa reducida para algunos bienes de la canasta familiar de un 16% (yogurt y mantequilla, café, azucares y cacao y chocolate) y una tasa 0% para exportadores." / X](https://x.com/DGii/status/1156907205276385280)
29. [Calculadora de ITBIS gratis sobre ventas en República Dominicana 2026](https://blog.alegra.com/republica-dominicana/herramientas/calculadora-de-itbis/)
30. [Retenciones de ITBIS en Dominicana: tarifas y Formato 606](https://siemprealdia.co/republica-dominicana/impuestos/retenciones-de-itbis/)
31. [Tax withholding in the Dominican Republic: A complete guide by tax type for businesses and professionals - P&H Law](https://phlaw.com/tax-withholding-in-the-dominican-republic-a-complete-guide-by-tax-type-for-businesses-and-professionals/)
32. [Impuesto sobre Transferencias de Bienes Industrializados y Servicios (ITBIS)](https://dgii.gov.do/publicacionesOficiales/bibliotecaVirtual/contribuyentes/itbis/Documents/3-Revista-ITBIS.pdf)
33. [Retenciones de ITBIS en República Dominicana: quién retiene, cuánto y cómo recuperarlo](https://facturasuite.com.do/blog/retenciones-itbis-agentes-retencion-dgii-rd-2026-05-01/)
34. [República Dominicana SECRETARIA DE ESTADO DE FINANZAS](<https://dgii.gov.do/legislacion/normasGenerales/Documents/NG%20sobre%20Impuesto%20sobre%20Transferencias%20de%20Bienes%20Industrializados%20y%20Servicios%20(ITBIS)/norma02-05.pdf>)
35. [Instructivo Formato 606 DGII](https://es.scribd.com/document/490429280/6-InstructivodellenadoyenvioFormato606-pdf)
36. [Cómo Llenar el Formato 607 DGII: Guía Paso a Paso 2026](https://micromza.com/llenar-el-formato-607/)
37. [Retenciones ISR-ITBIS](https://dgii.gov.do/publicacionesOficiales/bibliotecaVirtual/contribuyentes/retencionesRetribucionesComplementarias/Documents/Retenciones-ISR-ITBIS.pdf)
38. [Cómo calcular el ISR de un empleado en República Dominicana: tabla y ejemplos 2026](https://blog.alegra.com/republica-dominicana/como-calcular-el-isr-de-un-empleado/)
39. [Número de Comprobante Fiscal (NCF): tipos y estructura](https://blog.alegra.com/republica-dominicana/numero-de-comprobante-fiscal/)
40. [Depreciación](https://ayuda.dgii.gov.do/conversations/discusiones/depreciacin/67193a0c1788a8794fe3f61c)
41. [Depreciacion](https://ayuda.dgii.gov.do/conversations/discusiones/depreciacion/63ebea71f6e2cc7d18f9a0ba)
42. [Reglamento No. 139-98 para la aplicación del Título II del ...](https://camaradecuentas.gob.do/transparencia/phocadownload/Transparencia/Base_legal_institucional/Reglamentos/Reglamento_139-98.pdf)
43. [Guía del Contribuyente No. 5 Comprobantes Fiscales](https://dgii.gov.do/publicacionesOficiales/bibliotecaVirtual/contribuyentes/facturacion/Documents/Comprobantes%20Fiscales/1-Guia%205-Comprobantes%20Fiscales.pdf)
44. [Tipos de NCF (B01, B02, e-CF): guía completa](https://contablebotrd.com/guias/tipos-de-ncf)
45. [Qué es un comprobante fiscal electrónico (e-CF)](https://cabbity.com/que-es-un-comprobante-fiscal-electronico/)
46. [Documento PDF - DGII - Descripción Técnica de Facturación Electrónica Versión 1. Mayo 2023 GERENCIA - Studocu](https://www.studocu.com/latam/document/universidad-autonoma-de-santo-domingo/contabilidad-general/documento-pdf-dgii/69920604)
47. [Ley de facturación electrónica en República Dominicana 2026](https://blog.alegra.com/republica-dominicana/ley-de-facturacion-electronica/)
48. [Fechas límite facturación electrónica DGII 2026 Rep. Dominicana](https://blog.alegra.com/republica-dominicana/fechas-limite-facturacion-electronica-dgii/)
49. [Facturación electrónica RD: Ley 32-23 y fecha límite](https://blog.alegra.com/republica-dominicana/facturacion-electronica-rd/)
50. [Facturación electrónica obligatoria: fechas y a quién aplica](https://blog.alegra.com/republica-dominicana/obligatoriedad-de-factura-electronica/)
51. <https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaciones%20Proceso%20de%20Certificaci%C3%B3n%20FE/Proceso%20de%20Certificacion%20para%20ser%20Emisor%20Electronico.pdf>
52. [Decreto 587-24: El impulso final hacia la facturación electrónica en RD - Revista Mercado](https://revistamercado.do/technology/decreto-587-24-el-impulso-final-hacia-la-facturacion-electronica-en-rd/)
53. [Se promulgó el Decreto 587-24, como marco regulatorio para el uso de la factura electrónica.](https://gosocket.net/centro-de-recursos/se-promulgo-el-decreto-587-24-como-marco-regulatorio-para-el-uso-de-la-factura-electronica/)
54. <https://dgii.gov.do/transparencia/baseLegal/Documents/Leyes/Ley%2032-23.pdf>
55. [Descripción Técnica de Facturación Electrónica Versión 1.5 Mayo 2023](https://felwiki.thefactoryhka.com.do/lib/exe/fetch.php?media=descripcion-tecnica-de-facturacion-electronica_nuevo.pdf)
56. [GitHub - moisesbenzan/ecf-rd · GitHub](https://github.com/moisesbenzan/ecf-rd)
57. [Documentación sobre e-CF](https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Paginas/documentacionSobreE-CF.aspx)
58. [Rewrite as a self-hosted DGII e-CF issuer (Next.js) by Gabbs27 · Pull Request #7 · Gabbs27/invoice-generator](https://github.com/Gabbs27/invoice-generator/pull/7)
59. <https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Instructivos%20sobre%20Facturaci%C3%B3n%20Electr%C3%B3nica/Firmado%20de%20e-CF.pdf>
60. [Descripción Técnica de Facturación Electrónica (Versión 1, Mayo 2023) - Studocu](https://www.studocu.com/latam/document/universidad-autonoma-de-santo-domingo/contabilidad-de-costos/descripcion-tecnica-de-facturacion-electronica/69920610)
61. [Dgii](https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Instructivos%20sobre%20Facturaci%C3%B3n%20Electr%C3%B3nica/Instructivo-Contingencia-FE.pdf)
62. [Ley No.11-92 Código Tributario - Pellerano & Herrera](https://phlaw.com/es/ley-no-11-92-codigo-tributario/)
63. [¿Qué es y qué se reporta en el formato 606 de la DGII?](https://siemprealdia.co/republica-dominicana/impuestos/formato-606-de-la-dgii/)
64. [Formatos 606, 607 y 608 de la DGII: guía sin errores](https://www.sj.com.do/formatos-606-607-y-608-de-la-dgii-que-son-y-como-generarlos-sin-errores/)
65. [Reportes contables 606, 607 y 608 RD: guía 2026 para cumplir con la DGII](https://blog.alegra.com/republica-dominicana/reportes-contables-606-607-608/)
66. [Todo sobre los formatos de envío de datos DGII](https://siemprealdia.co/republica-dominicana/impuestos/formatos-de-envio-de-datos/)
67. [Llenado y envío del Formato de Venta de Bienes y Servicios (607) Instructivo](https://dgii.gov.do/publicacionesOficiales/bibliotecaVirtual/contribuyentes/formatoEnvioDatos/Documents/7-LlenadoyenvioFomato607HastaAbril.pdf)
68. [Envío de datos 606 y 607 DGII: guía para pymes \[2026\]](https://bolsillopractico.com/tramites/envio-datos-606-607-dgii/)
69. [TSS informa topes de cotización para el régimen contributivo](https://eldia.com.do/tss-informa-topes-cotizacion-regimen-contributivo/)
70. [República Dominicana. La TSS presenta los nuevos topes para la cotización de Seguridad Social: Cuánto es, cómo se calcula y cuánto se descuenta - Pension Policy International](https://www.pensionpolicyinternational.com/republica-dominicana-la-tss-presenta-los-nuevos-topes-para-la-cotizacion-de-seguridad-social-cuanto-es-como-se-calcula-y-cuanto-se-descuenta/)
71. [Calculadora Nómina TSS RD 2026](https://gestiondo.com.do/calculadora-nomina-tss-rd/)
72. [Nómina TSS RD 2026: SFS AFP ISR Liquidación Art. 80](https://tufacturard.com/blog/nomina-tss-republica-dominicana-2026/)
73. [TSS 2026: tasas, topes y plazos para empleadores](https://flbetances.com/recursos/guia-obligaciones-empleador-tss/)
74. [Aportes TSS empleador en RD: porcentajes y topes \[2026\]](https://bolsillopractico.com/tramites/aportes-tss-empleador-porcentajes-rd/)
75. [Cómo Calcular tu Auxilio de Cesantía en República](https://finiquitojusto.com/derechos-laborales/auxilio-cesantia-republica-dominicana-anterior/)
76. [Cálculo de Prestaciones Laborales en RD: Guía Completa](https://www.nomigoplus.com/calculo-de-prestaciones-laborales-en-republica-dominicana/)
77. [Calculadora de Prestaciones Laborales RD 2026 — Código de Trabajo](https://finanzas-rd.com/calculadoras/prestaciones-laborales)
78. [Calculadora de Prestaciones Laborales República Dominicana 2026](https://finiquitojusto.com/calculadora-liquidacion-rd/)
79. [Decreto 587-24: Reglamento para la Facturación Electrónica en RD - Studocu](https://www.studocu.com/latam/document/universidad-tecnologica-de-santiago/pasantia/decreto-587-24-derecho-laboral/116739807)
80. [Ley 32-23 de Facturación Electrónica: multas y cómo cumplir en 2026](https://www.sj.com.do/ley-32-23-de-facturacion-electronica-en-rd-que-significa-para-tu-empresa/)
81. [Cambios facturación electrónica con la Ley 32-23](https://blog.alegra.com/republica-dominicana/cambios-facturacion-electronica/)
82. [Cómo habilitarse como facturador electrónico en la DGII 2026](https://blog.alegra.com/republica-dominicana/habilitarse-como-facturador-electronico/)
83. [Facturación Electrónica DGII para PYMES](https://facturabreve.com/facturacion-electronica-dgii/)
84. [CÓDIGO TRIBUTARIO DE LA REPÚBLICA DOMINICANA (LEY 11-92) - Guzmán Ariza](https://drlawyer.com/espanol/leyes/codigo-tributario-de-la-republica-dominicana-ley-11-92/)
85. [¿Cuáles son las sanciones que se aplican al no cumplimiento de la incorporación al RNC de sociedades EIRL?](https://ayuda.dgii.gov.do/conversations/discusiones/cules-son-las-sanciones-que-se-aplican-al-no-cumplimiento-de-la-incorporacin-al-rnc-de-sociedades-eirl/5f3c17d38cd858ce87acf870)

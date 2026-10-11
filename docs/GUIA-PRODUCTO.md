# Guía de producto — Módulo Financiero

> **Qué es este documento.** Es la estrella del norte del proyecto. Resume qué tienen en común los
> software de negocios más exitosos del mundo y lo convierte en reglas concretas para este producto.
> **Todo agente (arquitecto, revisor-critico, dev-backend, dev-frontend, qa, seguridad, documentador)
> debe validar sus decisiones contra esta guía.** Si una propuesta contradice un principio, se dice
> explícitamente por qué y se decide con Carlos.
>
> Versión 1 · **APROBADA por Carlos el 2026-10-10** · Investigación pedida por Carlos ("quiero que sea la guía para este proyecto").
> Alcance mundial: los requisitos de República Dominicana (DGII, NCF, e-CF) son de **cumplimiento**,
> no el modelo a imitar.

---

## 1. Cómo se hizo y qué tan confiable es

Se revisaron líderes globales de software contable y de gestión (QuickBooks Online, Xero, Zoho Books,
FreshBooks, Sage), ERPs para pymes (Odoo, NetSuite, SAP Business One), líderes latinoamericanos
(Alegra, Siigo, Contpaqi) y referentes de diseño y crecimiento de software de negocio (Stripe, Linear,
Notion, Salesforce, Shopify, Slack). También se revisaron estudios de compradores (Capterra, G2,
Gartner) y prácticas de onboarding y de usabilidad (heurísticas de Nielsen).

**Advertencia honesta.** Gran parte de la evidencia pública viene de los mismos fabricantes o de blogs
de comparación. Los porcentajes se citan como **orientativos**, no como verdades. Lo valioso es el
**patrón que se repite** entre productos exitosos, y eso sí es consistente. Las fuentes están al final.

---

## 2. Los hallazgos en una página

1. **Los ganadores hacen una cosa muy bien y la comunican clara.** Stripe = pagos, Linear =
   desarrollo de producto, FreshBooks = facturar fácil sin ser contador. El posicionamiento estrecho
   que el producto cumple es lo que más se repite en las empresas SaaS exitosas.
2. **La confianza es el factor de compra n.º 1.** Para Gartner, en el mundo pesa primero la
   **confianza**, luego la flexibilidad comercial y en tercer lugar las integraciones. En software
   financiero esto se multiplica, porque es el dinero del cliente.
3. **Las integraciones son el factor n.º 2 para elegir software contable** (G2, 2024). El 86 % de
   las 100 mayores SaaS tiene un catálogo público de integraciones.
4. **Por qué se van los clientes de su software contable** (Capterra): precio que sube (25 %),
   funciones que se quedan cortas (24 %), haber elegido algo muy básico o muy complejo (28 %).
   Contabilidad es la categoría con **más arrepentimiento después de comprar** (36 %).
5. **Xero se ganó a sus clientes con la conciliación bancaria:** el sistema **propone** el emparejamiento
   y la persona **confirma con un clic**, y aprende con el uso. Es la función más elogiada.
6. **FreshBooks creció diseñando para no-contadores:** lenguaje sencillo, facturar en minutos,
   recordatorios automáticos y cobro en línea. Su límite es que se queda corto cuando el negocio crece.
7. **QuickBooks domina por su ecosistema:** todos los contadores lo conocen. Tiene herramientas para
   el contador (QBO Accountant), recibos por foto, correo o app, y en 2026 agentes de IA que categorizan,
   concilian y generan reportes.
8. **Odoo gana por modularidad:** empiezas con contabilidad y agregas módulos sin cambiar de sistema.
   Ese es el mismo camino de "Finanzas + nichos" de nuestra **plataforma**.
9. **Stripe muestra cómo diseñar datos financieros:** calma y claridad para gente ansiosa por su dinero.
   Montos alineados a la derecha, rangos de fecha predefinidos, estados con icono + color y jerarquía por
   tipografía y espacio.
10. **Linear muestra la velocidad como función:** toda acción común a 1 o 2 teclas y una paleta de
    comandos (Ctrl+K) que encuentra cualquier cosa sin memorizar menús.
11. **Tendencia 2026: la IA pasa de "asistente" a "hace el trabajo"** (conciliar, cerrar, detectar
    anomalías). Pero los expertos insisten en que la IA debe **mostrar evidencia y dudas**, nunca
    inventar ni contabilizar sola.
12. **El onboarding decide la retención:** hay que medir el tiempo hasta el primer valor. Se recomienda
    una primera sesión con 3 a 5 acciones clave, checklists de 3 a 5 pasos, pantallas vacías que
    enseñan, y guías que se pueden **saltar** porque los expertos odian que los lleven de la mano.

---

## 3. Los 14 principios del producto

Cada principio tiene: **qué hacen los líderes → regla para nosotros → cómo se verifica.**

### P1. Promesa clara
- **Líderes:** Stripe, Linear y FreshBooks tienen una sola promesa que el producto cumple.
- **Regla:** nuestra promesa es *"La contabilidad de tu empresa en orden y al día con la DGII, sin tener
  que ser contador, y con tu contador trabajando en el mismo lugar."* Toda función nueva debe servir a
  esa promesa o se cuestiona.
- **Verificación:** el revisor-critico pregunta en cada plan qué parte de la promesa mejora.

### P2. Valor en los primeros 15 minutos
- **Líderes:** se mide el tiempo hasta el primer valor; Stripe aceptaba pagos con 7 líneas de código.
- **Regla:**
  - Una empresa nueva debe poder **emitir su primera factura válida en menos de 15 minutos**.
  - Asistente de configuración inicial, con un catálogo de cuentas dominicano, ITBIS, retenciones,
    diarios y secuencias de NCF **precargados**.
  - Checklist de "pendientes" de 3 a 5 pasos en el panel. Todo se puede saltar.
  - Datos de ejemplo opcionales y borrables con un clic.
- **Verificación:** qa cronometra a un "usuario nuevo" desde el primer login hasta la primera factura.

### P3. Dos audiencias, una sola herramienta
- **Líderes:** FreshBooks gana con los no-contadores y QuickBooks/Xero con los contadores. El que
  sirve a ambos se queda con el cliente cuando crece.
- **Regla:**
  - Para **el dueño**: lenguaje de negocio ("Lo que me deben", "Lo que debo", "¿Cuánto gané?").
  - Para **la contadora**: toda la profundidad (asientos, mayor, cierres, auditoría), pero detrás
    (divulgación progresiva), nunca en la cara del dueño.
  - Nunca quitarle a la contadora una función para "simplificar".
- **Verificación:** dev-frontend revisa cada pantalla con dos preguntas. ¿La entiende un dueño?
  ¿Le sirve a una contadora?

### P4. El sistema propone y la persona confirma
- **Líderes:** la conciliación de Xero y los agentes de QuickBooks proponen, la persona aprueba, y el
  sistema aprende reglas.
- **Regla:**
  - Asientos automáticos desde cada documento (factura, pago, transferencia). La contadora no debe
    hacer a mano lo que el documento ya dice.
  - En la conciliación, sugerencias ordenadas por confianza, aprobación en lote y reglas que se crean
    desde una corrección ("siempre que diga X, clasificar en Y").
  - **Nada se contabiliza en silencio:** lo automático queda visible y se puede revertir.
- **Verificación:** qa comprueba que cada automatización deja rastro en la bitácora y tiene "deshacer".

### P5. La conciliación bancaria es el corazón
- **Líderes:** es la función más elogiada de Xero; QuickBooks invierte en feeds bancarios con IA,
  incluida la lectura de estados en PDF.
- **Regla:**
  - Importar extractos (CSV/Excel hoy; PDF y conexión bancaria directa con bancos dominicanos después).
  - Pantalla de conciliación de 2 columnas: banco y sistema.
  - Emparejar uno a muchos, crear el documento faltante desde la línea del banco, y mostrar el avance
    ("faltan 12 de 140").
- **Verificación:** prueba de conciliar un mes ficticio de 100 movimientos en menos de 20 minutos.

### P6. Claridad y calma con el dinero
- **Líderes:** Stripe diseña para gente ansiosa por su dinero.
- **Regla:**
  - Montos **alineados a la derecha**, con separador de miles y moneda.
  - Negativos claramente marcados.
  - Encabezados de tabla fijos.
  - Rangos de fecha predefinidos (este mes, mes pasado, este año, año pasado).
  - Estados con **icono + color + texto**, nunca solo color.
  - Jerarquía por tipografía y espacio, no por colores chillones.
  - Microtextos que dan seguridad ("Guardado. Nadie más puede ver esto").
- **Verificación:** checklist de diseño de la sección 6.

### P7. Guiar en cada pantalla
Es el principio rector que pidió Carlos el 2026-10-10.
- **Regla:**
  - Migas de pan (dónde estás).
  - Una línea de propósito (para qué sirve la pantalla).
  - Siguiente paso sugerido.
  - Indicador de pasos en los procesos.
  - Pantallas vacías que explican y ofrecen el botón para crear el primero.
  - Errores que dicen qué pasó y cómo arreglarlo, con enlace.
  - Botón "?" con la ayuda de esa pantalla.
  - **Todo lo guiado se puede saltar** para los usuarios expertos.
- **Verificación:** prueba de "usuario nuevo sin capacitación" en cada flujo (qa).

### P8. Rápido para quien lo usa todo el día
- **Líderes:** Linear tiene la velocidad como función, atajos y paleta Ctrl+K.
- **Regla:**
  - **Paleta de comandos (Ctrl+K)**: "nueva factura", "buscar cliente Pérez", "ir a conciliación".
  - Atajos de teclado en las acciones frecuentes, visibles al pasar el mouse.
  - Formularios que se llenan solos con lo último usado (tipo de NCF del cliente, términos de pago).
  - Las pantallas responden de inmediato y nunca bloquean sin mostrar progreso.
- **Verificación:** medir los clics de las tareas frecuentes (factura, cobro, asiento). Cada versión
  debe bajarlos o mantenerlos.

### P9. El contador como aliado (canal de ventas)
- **Líderes:** Xero HQ y QuickBooks Online Accountant. El contador ve a todos sus clientes en un panel,
  quién tiene la conciliación atrasada, y trabaja con herramientas propias. Los contadores **recomiendan**
  el software a sus clientes, y por eso son el principal canal de crecimiento.
- **Regla:**
  - **Portal del contador**: un usuario ve todas las empresas que atiende, con la salud de cada una
    (conciliación pendiente, períodos abiertos, DGII por presentar).
  - Herramientas de auditoría (v0.2).
  - Solicitudes al cliente ("súbeme el estado de cuenta de marzo").
  - Programa de contadores aliados.
- **Verificación:** las 2 contadoras de prueba validan el portal antes de lanzarlo.

### P10. La confianza se diseña
Es el factor de compra n.º 1.
- **Líderes:** autenticación en dos pasos, roles con mínimo privilegio, bitácora de cambios, cifrado y
  reportes de seguridad (SOC 2) son lo esperado.
- **Regla:**
  - **2FA** disponible para todos.
  - Roles claros.
  - Bitácora visible para el administrador.
  - **Respaldos automáticos probados**, con restauración ensayada.
  - Página pública de seguridad explicada en lenguaje simple.
  - **Los datos son del cliente:** exportación completa en cualquier momento, también al cancelar.
    A FreshBooks le critican perder el acceso a facturas viejas al cancelar.
  - **Nunca quitar ni cambiar funciones sin avisar**, otra queja frecuente.
- **Verificación:** el agente seguridad audita cada release. Antes de manejar datos reales es
  obligatorio tener backups, 2FA y la exportación completa.

### P11. Cumplimiento local como ventaja, no como carga
- **Líderes:** Alegra y Siigo ganaron en Latinoamérica por la facturación electrónica y los
  impuestos de cada país resueltos dentro del producto.
- **Regla:**
  - NCF y e-CF (vía proveedor certificado).
  - 606, 607 y 608 en un clic.
  - Asistencia para el IT-1 y el IR-17.
  - Retenciones automáticas.
  - **Calendario fiscal con recordatorios.**
  - Cambios de la DGII incorporados rápido (carpeta docs/normativa-dgii).
  - Lo fiscal debe "simplemente funcionar" y estar siempre al día.
- **Verificación:** cada cambio normativo tiene su prueba e2e. Una contadora valida los formatos contra
  el validador oficial de la DGII.

### P12. Abierto e integrable
- **Líderes:** las integraciones son el factor n.º 2 al elegir software contable. Con 5 integraciones
  el cliente paga hasta un 20 % más por el mismo producto.
- **Regla:**
  - **API documentada** y webhooks.
  - Importar y exportar con Excel en todo (clientes, catálogo, saldos iniciales).
  - **Migración desde QuickBooks, Excel u otro sistema** en la entrada, porque así se baja la
    barrera para cambiarse.
  - Integración nativa con la **plataforma** (nichos) y, después, con bancos y pasarelas de pago locales.
- **Verificación:** el arquitecto mantiene la API versionada y documentada. No hay función nueva sin
  endpoint público.

### P13. Móvil para lo que se hace en la calle
- **Líderes:** QuickBooks captura recibos con foto, correo, app y Drive, y crea la transacción para
  revisarla.
- **Regla:**
  - Desde el celular: **foto del recibo → gasto propuesto**, aprobar documentos, ver el panel, enviar
    una factura y registrar un cobro.
  - La contabilidad completa se queda en la computadora.
  - Todo responsive desde ya.
- **Verificación:** qa prueba los flujos clave en un celular real.

### P14. IA útil, con evidencia y bajo control humano
- **Líderes (2026):** agentes que concilian, cierran y detectan anomalías. Los expertos advierten que
  deben mostrar evidencia e incertidumbre, nunca inventar.
- **Regla:**
  - Por fases: (1) **detección de anomalías** (duplicados, montos raros, NCF saltados),
    (2) **preguntas en lenguaje natural** ("¿por qué bajó la utilidad en marzo?") con las cifras
    citadas, (3) sugerencias de clasificación y conciliación.
  - **La IA nunca contabiliza sola.** Toda acción tiene evidencia y aprobación humana, y queda en la
    bitácora.
  - Privacidad: los datos del cliente no se usan para entrenar modelos de terceros.
- **Verificación:** seguridad y revisor-critico aprueban cada función de IA.

### Transversal: precio y crecimiento sin castigo
- **Líderes:** Xero incluye usuarios ilimitados en todos sus planes. La gente se va por precios que
  suben y por "upgrades forzados" (Capterra).
- **Regla:**
  - Planes que crecen con la empresa y no castigan al que suma usuarios: el contador y el auditor
    entran gratis.
  - Precio predecible.
  - Prueba gratis con los datos de ejemplo.
  - Pasar de plan sin migrar nada (modularidad estilo Odoo).

---

## 4. Lo que NO hay que hacer (errores de los líderes)

| Error | Quién lo sufre | Cómo lo evitamos |
|---|---|---|
| Funciones avanzadas escondidas que nadie encuentra | Xero (reseñas) | Paleta Ctrl+K, buscador, menú con nombres de negocio |
| Llevar de la mano a todos, incluso a expertos | Advertencia general de onboarding | Todo lo guiado se puede saltar o desactivar |
| Cambiar o quitar funciones sin avisar | FreshBooks (reseñas) | Notas de versión dentro del sistema, aviso previo |
| Perder los datos al cancelar | FreshBooks (reseñas) | Exportación completa siempre disponible |
| Precio que sube y obliga a subir de plan | QuickBooks (25 % se quiere ir por precio) | Precio predecible, contador y auditor gratis |
| Demasiado básico o demasiado complejo | 28 % de los arrepentidos | Divulgación progresiva (P3) |
| Datos de ejemplo bonitos pero ajenos al usuario | Advertencia de onboarding | Datos de ejemplo dominicanos y realistas, borrables |
| IA que inventa explicaciones y contabiliza | Advertencia 2026 | IA con evidencia y aprobación humana (P14) |
| Copiar la estética de Linear o Stripe sin su razón | Crítica de diseño | Copiar el **porqué**: calma con el dinero y velocidad en lo frecuente |

---

## 5. Dónde estamos hoy (v0.1, 2026-10-10)

| Principio | Estado | Nota |
|---|---|---|
| P1 Promesa clara | 🟡 | No está escrita en el producto ni en la web |
| P2 Valor en 15 min | 🔴 | Empresa vacía: sin catálogo, impuestos ni diarios precargados; sin asistente |
| P3 Dos audiencias | 🟡 | Muy completo para la contadora; lenguaje técnico para el dueño ("tercero") |
| P4 Propone y confirma | 🟡 | Hay asientos automáticos desde documentos y reglas bancarias; falta sugerir y aprender |
| P5 Conciliación | 🟡 | Existe, con importación CSV y reglas; falta flujo de 2 columnas y PDF |
| P6 Claridad con el dinero | 🟡 | Buena base (decimal.js, tema claro/oscuro); falta auditar contra la sección 6 |
| P7 Guiar en cada pantalla | 🔴 | Sin migas, sin ayuda, pantallas vacías mudas, no se crea cliente desde la factura |
| P8 Velocidad | 🔴 | Sin paleta de comandos ni atajos |
| P9 Contador aliado | 🔴 | Multiempresa en datos, pero sin portal del contador; auditoría planificada en v0.2 |
| P10 Confianza | 🟡 | Roles, bitácora interna, bloqueo de intentos y cabeceras. **Faltan 2FA, backups automáticos y exportación completa** |
| P11 Cumplimiento | 🟢 | NCF y 606/607/608 hechos; e-CF por proveedor (pendiente); falta calendario fiscal, IT-1 e IR-17 |
| P12 Integrable | 🟡 | API REST completa; falta documentación pública, webhooks e importadores |
| P13 Móvil | 🟡 | Responsive; sin captura de recibos por foto |
| P14 IA | 🔴 | No hay |

---

## 6. Checklist de aceptación por pantalla

Lo usan dev-frontend y qa. Una pantalla nueva o tocada **no se aprueba** si falla algo de esto:

- [ ] Migas de pan y una línea que dice para qué sirve la pantalla.
- [ ] La acción principal está en el mismo lugar que en las demás pantallas, visible.
- [ ] El estado vacío explica qué es y tiene el botón para crear el primero o configurar lo que falta.
- [ ] Los errores dicen qué pasó y cómo arreglarlo, en español sencillo, sin códigos técnicos.
- [ ] Botón "?" que abre la ayuda de esta pantalla.
- [ ] Los términos contables difíciles tienen una explicación al pasar el mouse.
- [ ] Montos a la derecha, con miles y moneda; los estados con icono, color y texto.
- [ ] Se puede crear lo que falta sin salir (por ejemplo, el cliente desde la factura).
- [ ] Funciona en el celular (ancho de 375 px).
- [ ] Teclado: Tab en orden lógico, Enter guarda, Esc cierra el modal.
- [ ] Prueba de "usuario nuevo": alguien sin capacitación completa la tarea sin ayuda externa.
- [ ] Respeta las convenciones del socio (ver docs/PLAN-v0.2.md).

---

## 7. Prioridades recomendadas

**Ahora (v0.2):**
- P7: experiencia guiada y ayuda integrada.
- P2: asistente de configuración con catálogo dominicano precargado.
- Crear desde la factura.
- P9: herramientas de auditoría.
- Mejoras de razones financieras.
- P10 mínimo: backups automáticos.

**Siguiente (v0.3):**
- P10: 2FA y exportación completa.
- P8: paleta Ctrl+K.
- P5: conciliación de 2 columnas.
- P11: calendario fiscal e IT-1/IR-17.
- P12: importadores de Excel y migración desde QuickBooks.
- e-CF por proveedor.

**Después:**
- P9: portal del contador multiempresa.
- P13: recibos por foto.
- P14: IA (anomalías, luego preguntas, luego sugerencias).
- P12: API pública y webhooks.
- Conexión bancaria directa.

---

## 8. Fuentes

Evidencia mayormente de fabricantes y blogs especializados: se usa como orientación de patrones.

- Comparativas de software contable 2026: [business.com](https://www.business.com/categories/accounting-software/), [Acculink CPA](https://acculinkcpa.com/blog/quickbooks-online-vs-xero-vs-sage-vs-freshbooks-vs-zoho-books-complete-comparison), [Sonary](https://sonary.com/content/zoho-books-vs-quickbooks-which-accounting-software-is-better-for-small-business/), [Certum](https://www.certumsolutions.com/library/best-accounting-software-for-small-business-guide)
- Xero: [Xero small business](https://www.xero.com/us/small-businesses/), [G2 pros y contras](https://www.g2.com/products/xero/reviews?qs=pros-and-cons), [The Retail Exec](https://theretailexec.com/tools/xero-review/), [Xero HQ](https://www.xero.com/nz/xero-hq/)
- QuickBooks 2026: [Novedades agosto 2026](https://quickbooks.intuit.com/r/product-update/whats-new-quickbooks-online-august-2026/), [Agentes de IA](https://quickbooks.intuit.com/r/product-update/ai-agents-innovation/), [Captura de recibos](https://quickbooks.intuit.com/learn-support/en-us/help-article/import-transactions/upload-receipts-bills-quickbooks-online/L862MmZHn_US_en_US), [Reseña de la captura de recibos](https://invoicedataextraction.com/blog/quickbooks-online-receipt-capture-reviews)
- FreshBooks: [FitGap](https://us.fitgap.com/products/freshbooks), [Airframe](https://www.airframe.ai/product/freshbooks-com/analysis), [Capterra](https://www.capterra.com/p/142390/FreshBooks/reviews/?page=13)
- ERP: [ERP Research](https://www.erpresearch.com/en-us/erp-for-small-business-smb-sme), [Houseblend](https://www.houseblend.io/articles/erp-comparison-netsuite-odoo-sap-quickbooks), [ERP Implementation EU](https://www.erpimplementation.eu/en/odoo-vs-sap-vs-netsuite-honest-comparison-sme-2026/)
- Latinoamérica: [Software Advice Alegra](https://www.softwareadvice.com.au/software/315483/alegra), [Capterra Siigo](https://www.capterra.co.uk/software/209269/siigo), [WMP comparativa](https://wmp.mx/en/?p=3716)
- Abandono y compra: [Capterra cambiar de software contable](https://www.capterra.com/resources/switching-accounting-software-problems-risks/), [Capterra elegir entre 500+ opciones](https://www.capterra.com/resources/how-to-choose-accounting-software-when-you-have-500-options/)
- Integraciones: [Partnerfleet, estadísticas de integración](https://partnerfleet.io/blog/valuable-integration-statistics-to-know), [Chief Martec](https://chiefmartec.com/2022/07/marketers-keep-replacing-major-martech-apps-integration-1-factor-for-replacements), [Pipedrive](https://www.pipedrive.com/en/newsroom/pipedrive-marketplace-survey-businesses-leveraging-integrations-win-about-1-5-times-more-deals)
- Crecimiento SaaS: [Eleken PLG](https://www.eleken.co/blog-posts/product-led-growth-strategies), [How Notion Grows](https://www.howtheygrow.co/p/how-notion-grows), [Better Launch](https://www.betterlaunch.co/blog/best-saas-companies), [Datacose](https://www.datacose.com/blog/most-successful-saas-companies)
- Onboarding: [Appcues buenas prácticas](https://www.appcues.com/blog/user-onboarding-best-practices), [Appcues ejemplos](https://www.appcues.com/blog/saas-user-onboarding), [UXCam](https://uxcam.com/blog/saas-onboarding-best-practices/)
- Diseño: [Stripe dashboard](https://www.925studios.co/blog/stripe-dashboard-design-breakdown), [Linear](https://www.925studios.co/blog/linear-design-breakdown-saas-ui-2026), [Paletas de comandos](https://dev.to/thekitbase/cmdk-is-the-new-hamburger-menu-why-command-palettes-are-taking-over-saas-81d), [Heurísticas de Nielsen para B2B](https://www.saashero.net/design/nielsen-10-usability-heuristics-explained/)
- Seguridad y confianza: [Airtable Trust](https://airtable.com/company/trust-and-security), [SOC 2 para SaaS](https://www.tcsa.in/frameworks/soc-2/for-saas)
- Tendencias 2026: [GRF CPAs](https://www.grfcpa.com/resource/2026-finance-tech-trends-ai-updates-cfos-should-watch/), [Numeric, cierre contable](https://www.numeric.io/blog/financial-close-software), [TechnologyAdvice ERP](https://technologyadvice.com/blog/accounting/erp-industry-trends/), [StackAI](https://www.stackai.com/blog/the-top-ai-agent-use-cases-for-accounting-audit-in-2026)

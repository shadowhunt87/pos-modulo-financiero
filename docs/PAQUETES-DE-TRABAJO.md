# Paquetes de trabajo — repartir el desarrollo entre varias IA y personas

> Versión 1.0 · 2026-10-12 · Deriva de [PLAN-v0.2](PLAN-v0.2.md) y [PLAN-v0.3](PLAN-v0.3.md) (v1.2).
> Objetivo: terminar la parte financiera lo antes posible. El socio de Carlos desarrolla una **vertical** aparte;
> la parte financiera la lleva Carlos y la reparte entre varias IA.
> Cada paquete se puede entregar a una IA (o a una persona) con un encargo completo, sin leer toda la conversación.
> Tablero para importar a GitHub Projects: [tablero-paquetes.csv](tablero-paquetes.csv).

**Requisito previo — una base común:** hoy todo el trabajo vive en la rama local `fase-1`, que aún no está en GitHub. Antes de
entregar paquetes hay que (1) subir `fase-1`, (2) terminar el último QA de la Fase 1 y fusionarla a la rama principal, y (3) dar
acceso al repositorio a las IA o personas que lo usarán (cuentas propias, nunca la clave del servidor). Es el punto 2 que
Carlos dejó en espera (organización de GitHub con el socio).

**Antes de repartir nada:** el plan v0.3 y sus decisiones (D29, D34–D40) los aprueba Carlos. Los paquetes marcados
«espera decisión» no arrancan hasta entonces; los de la **Ola 0** sí pueden empezar ya.

---

## 1. Reglas para cualquier IA o persona que tome un paquete

1. **Leer primero**, en este orden: `CLAUDE.md`, `docs/GUIA-PRODUCTO.md` (sección 6), `docs/GUIA-CONTABLE-FISCAL.md`
   (R1–R12 y sección 8) y las secciones del plan que cita el paquete.
2. **Una rama por paquete**, con el nombre que dice el tablero (`wp/N1-reverso`, etc.), saliendo de la rama principal
   al día. Un paquete = un PR. No mezclar paquetes.
3. **Solo se tocan los archivos del alcance.** Si hace falta tocar otro, se anota en el PR y se avisa antes. Los
   «archivos calientes» (sección 4) se tocan lo mínimo y se avisa.
4. **Línea del socio:** módulos en `src/<modulo>/` con controller, service, module y dto; `class-validator`;
   `JwtAuthGuard` + `RolesGuard` + `@Roles`; `writeAudit` dentro de la misma transacción; frontend Angular standalone,
   OnPush, signals. Imitar el código que ya existe; mismo nivel de comentarios.
5. **Pruebas obligatorias** (sin ellas el PR no se revisa):
   - Backend: `npm run build`, `npm test` y `npm run test:e2e` contra una base de pruebas **propia** (nunca la de las
     contadoras). Cada IA usa su propia base y su propio puerto.
   - Frontend: `ng build`, `ng test` y `node scripts/verificar-ayuda.mjs` (Node ≥ 22; en este servidor, con Docker).
6. **Solo datos ficticios.** Nunca claves, `.env`, `.credenciales-pruebas.txt`, respaldos ni datos de personas reales.
   Si el paquete necesita un secreto, se pide a Carlos; no se inventa ni se copia de otro lado.
7. **Dinero y leyes:** los valores fiscales son datos con vigencia (R9), nunca constantes en el código. Decimales
   exactos, nunca `float` (R7).
8. **Pantallas:** cumplir el checklist de la sección 6 de la Guía de producto (migas, estado vacío, errores claros,
   «?», 375 px, teclado).
9. **Entrega:** el PR dice qué hizo, qué archivos tocó, qué decisiones tomó, cómo probarlo y qué falta. Sin decir
   «listo» si una prueba falla.
10. **Si algo no cuadra con el plan, parar y preguntar.** No se rediseña por cuenta propia.

---

## 2. Qué nivel de IA para cada tipo de trabajo

| Nivel | Para qué | Ejemplos | Quién |
|---|---|---|---|
| **N1 · Máxima capacidad** | Lógica contable o fiscal, permisos y roles, migraciones, aislamiento entre empresas, seguridad, decisiones de diseño | Reverso de asientos, parámetros con vigencia, 2FA, importación de XML, auditoría de seguridad | Claude Opus o equivalente de primer nivel |
| **N2 · Intermedio** | Endpoints y pantallas con patrón ya definido, pruebas e2e, devops, manuales con revisión | Pantallas Angular, semáforo, calendario, copia de respaldo | Claude Sonnet u otra IA de nivel alto |
| **N3 · Local o básico** | Trabajo mecánico y acotado con revisión humana o de N1/N2 | Textos del manual, `ayuda.json`, estados vacíos con un patrón dado, renombrar textos, traducciones | IA local (Ollama + Cline) u otras |

**Mi criterio, no una regla del plan:** un modelo local de 9 mil millones de parámetros se equivoca con facilidad en
bases de código grandes y en lógica contable. Úsenlo solo para N3, con un ejemplo concreto a imitar y siempre con una
revisión. **La revisión de seguridad y la revisión crítica final no se delegan a N3.**

**Privacidad:** el repositorio es privado. Si un paquete va a una IA de un tercero, el código sale del servidor.
Carlos decide cuáles herramientas se usan. Nada que no sea el código del repositorio (sin `.env`, sin datos) se
comparte con ellas.

---

## 3. Los carriles y su orden

Seis carriles que casi no se pisan. Entre paréntesis, a quién se sugiere.

| Carril | Contenido | Sugerido |
|---|---|---|
| **N · Núcleo fiscal** (backend) | v0.3: reverso, parámetros con vigencia, cuadres, calendario, 609/IT-1/IR-17 | IA-N |
| **E · Experiencia** | v0.2 Fases 2 a 4: arranque guiado, semáforo, pantallas guiadas | IA-E (y la IA local para E4-a a E4-d) |
| **A · Auditoría** | v0.2 Fases 5 y 6 | IA-A (carril casi independiente) |
| **S · Puerta de datos reales** | 2FA, exportación completa, copia externa | IA-S (necesita D17 y D18); Claude hace antes el anexo S0 |
| **V · Vertical** | Contrato para que la vertical del socio se conecte al núcleo | Claude escribe el contrato (V0); el resto, IA-N e IA-E |
| **D · Documentación** | Manual, `ayuda.json`, notas de versión | IA local, con revisión |
| **Q · Puertas de calidad** | QA, seguridad, revisor, despliegue | **Claude**; no se delega a IA local |
| **Facturación electrónica** (N3, N7) | e-CF mínimo, importación de XML, emisión con el proveedor | **Claude**; las demás IA no la tocan |

### Orden por olas

| Ola | Qué puede arrancar | Condición |
|---|---|---|
| **0 · Ya** | S0, V0, A1, E3-back, E4-a a E4-d (lo que no toca lo fiscal), D1, D3 | La base común (abajo); S0 y V0 esperan la aprobación del plan v0.3 |
| **1** | N1, N2a, N2b, S1, S5, A2, V1a, V4, V2, E1a | N1 espera D34; S1 espera el anexo S0 aprobado; V4 y V2 esperan a V1a (V4 también la decisión P4 del contrato de verticales) |
| **2** | N2c, N2d, E1b, E1c, S2, S3, A3, E3-front, V1b, V3 | N2c y E1b esperan a N2a; S3 espera D17 y D18; V1b espera N1 y V1a; V3 espera V1b, V2 y V4 |
| **3** | N3, N4, N5, S4, A4, E2 | N3 espera N1; N4 y N5 esperan N2c |
| **4** | N6, A5, D2, E4 fiscal | N6 espera N4 y N5, y las casillas validadas |
| **5** | Q-cierre de v0.2 y v0.3; **N7 (e-CF con proveedor) cuando haya documentación** | — |

**Límite de trabajo simultáneo:** no más de **5 paquetes abiertos a la vez**. Cada PR necesita revisión y las puertas
de calidad son el cuello de botella real; abrir 15 ramas a la vez solo produce choques de migraciones y de archivos.

---

## 3.1 Quién hace qué (Carlos, 2026-10-12)

Carlos cuenta con **tres herramientas**. Según lo que entiendo (si algo no es así, se corrige este cuadro):

| Etiqueta | Qué es | Fortaleza | Límite |
|---|---|---|---|
| **Claude-servidor** | La sesión de Claude en el servidor (la que escribe este plan) | Máxima capacidad; ve el servidor y el ambiente de pruebas | Su cupo de uso se agota; es el recurso más escaso |
| **Claude-PC** | Claude en la PC de Carlos | La misma calidad de modelo, trabaja en paralelo con la otra | Si es la misma cuenta, **comparte el cupo** con Claude-servidor: se gana paralelismo, no capacidad. No ve el servidor |
| **Ollama** | Modelo local (por ejemplo qwen 9B, con Cline) | Gratis, sin límite y 100 % privado | Se equivoca fácil en código grande y en cuentas; solo trabajo mecánico, con revisión |

**Regla del reparto:** Claude-servidor se queda con lo más fundamental, es decir, lo que más daño hace si sale mal y lo que
desbloquea a los demás. Claude-PC lleva el resto del trabajo de programación. Ollama lleva solo lo mecánico.

| Quién | Paquetes | Por qué |
|---|---|---|
| **Claude-servidor** | **S0, V0** (diseños, ya hechos; falta aplicar correcciones) · **N1** corregir sin borrar · **N2a** y **N2c** parámetros fiscales y cálculo con vigencia · **S1** y **S2** verificación en dos pasos y exportación · **V1a** enganches de verticales · **N3** y **N7** facturación electrónica · **todas las puertas de calidad** | Dinero, permisos, seguridad y lo que espera el socio con su vertical |
| **Claude-PC** | **N2b, N2d, N4, N5, N6** núcleo fiscal restante · **V1b, V4, V2, V3** verticales · **E1a, E1b, E1c, E2, E3-back, E3-front, E4-a, E4-e** experiencia · **A1 a A5** auditoría · **S3, S4, S5** puerta de datos y cabeceras · **D3** valores fiscales | Programación con un patrón definido por una ficha; es mucho trabajo, por eso va por colas (abajo) |
| **Ollama** | **D1, D2, D4** manual y notas · **E4-b, E4-c, E4-d** pantallas guiadas de Contabilidad, Bancos, Reportes y Configuración | Mecánico con un ejemplo a imitar (lo crea E4-a) |

### Orden de trabajo de Claude-PC (cola, según lo que desbloquea)

1. **Ahora, sin esperar a nadie:** **A1** (Auditoría base), **E3-back** (semáforo), **E4-a** (crea el componente de estado vacío que Ollama necesita), **S5** (cabeceras), **D3** (valores fiscales con la contadora).
2. **Cuando termine N2a:** **N2b** (cargador).
3. **Taller integrado (propuesto en `docs/INTEGRACION-TALLER.md` v1.1, pendiente de Carlos; reemplaza a V4 → V2 → V1b → V3,
   que quedan en pausa por D-T5):** **T0b** (si no la hace el socio) → **T2a** → **T2b** y **T2d** → **T3d** → **T3b** →
   **T3c** → **T4** → **T5a**. Fechas en INTEGRACION-TALLER §6 (primer recorrido ≈ 10–13 nov). V1b queda sin prisa al final.
4. **Después:** **A2, E1a, E3-front, A3, A4**, y luego **N4, N5, E1b, E1c, S3, S4, A5, E2**, y al final **N6, E4-e**.

**Costo de este orden:** el taller suma ≈10–11 días de trabajo a Claude-PC y la pausa de V2, V3 y V4 le quita ≈4,5: la cola
crece ≈5–6 días netos y corre lo que estaba detrás (A2, E1a, E3-front, A3, A4 y siguientes). Carlos puede invertirlo.

Ollama arranca con **D1**, y con **E4-b, E4-c y E4-d** cuando exista E4-a. Cada pantalla de E4 es un encargo aparte y pequeño.

### Revisión (para no depender solo de Claude-servidor)

- **QA** de lo que programa Ollama: lo corre **Claude-PC**.
- **Seguridad y revisor crítico:** siguen en **Claude-servidor**, solo en los paquetes que tocan dinero, permisos, archivos subidos o aislamiento: N1, N2a–c, N3, N5, N6, S1–S3, A1, A2, E1c, V1a, V1b, V4.
- **Pantallas y documentación** de Claude-PC: la revisión de QA basta salvo que toquen permisos.

### Cómo se pasa el código a cada herramienta

- **Claude-PC y Ollama necesitan el repositorio.** Dos caminos: (1) subir la rama a GitHub (requiere la autorización de Carlos) y clonar; o (2) copiar la carpeta con WinSCP. Con el segundo camino, **no copiar** `.env*`, `.credenciales-pruebas.txt`, la carpeta `financiero-backups` ni `node_modules`.
- Las dos herramientas son de Carlos o de Anthropic: no hay un tercero nuevo, así que el riesgo de privacidad que discutimos ya no aplica.
- Cada herramienta trabaja en su rama `wp/<ID>-…` y el trabajo se junta por GitHub o con `git bundle`. **Una sola persona (Carlos) fusiona.**
- Cada una recibe `AGENTS.md` y la ficha del paquete.

### 3.2 Calibración (reducida)

Ollama hace primero **D1** en una sola sección del manual y **E4-b** en una sola pantalla (por ejemplo, la lista de
asientos). Claude-PC revisa con la lista de siempre: ¿compila?, ¿pasan las pruebas?, ¿tocó solo lo permitido?
Si el resultado es bueno, se le encarga el resto de su carril; si no, esos paquetes pasan a Claude-PC.

### 3.3 Cómo trabaja cada una

- **Una ficha por paquete** en `docs/paquetes/<ID>.md`: se pega a la herramienta junto con `AGENTS.md`.
- **Ninguna herramienta hace push a la rama principal.**
- Avisan el PR a Carlos («revisa el PR de N1»); la revisión sigue el cuadro anterior.

---

## 4. Choques que hay que evitar (para cualquier cantidad de IA)

**Migraciones de Prisma.** Dos ramas que cambian `prisma/schema.prisma` chocan seguro.
- Una migración por paquete, con nombre propio; quien se fusiona segundo hace `rebase` y regenera la suya.
- Se fusiona **de uno en uno** (cola de fusión) y después de cada fusión corre toda la suite e2e.
- Los paquetes de modelos nuevos (A1, N2a, N3) no se fusionan el mismo día.

**Archivos calientes** (los toca casi todo el mundo; cambios mínimos y avisados):
`prisma/schema.prisma`, `src/app.module.ts`, `test/security.e2e-spec.ts`, `frontend/src/app/app.routes.ts`,
`frontend/src/app/layout/nav.ts`, `frontend/src/app/shared/labels.ts`, `frontend/public/manual/ayuda.json`,
`src/posting/posting.service.ts`, `src/invoicing/invoicing.service.ts`.
- `ayuda.json`: cada paquete agrega **sus** entradas al final de su bloque; el documentador consolida.
- `posting.service.ts` e `invoicing.service.ts` son de la base del socio y los tocan N1 y N2c: cada uno en su PR, con explicación. Como el socio sigue en su vertical, se le avisa de esos cambios antes de fusionar.

**Pantallas fiscales.** Impuestos, NCF, DGII, Panel y empresa los tocan E4, N2 y N5. Se hacen en ese orden, en una
sola rama por área, para que no haya dos versiones de `tax-rates.ts` o `ncf.ts`.

---

## 5. Paquetes

Leyenda: **T** = tamaño (S horas · M ≈ 1 día · L 2–3 días). **Plan** = tareas de los planes. Salvo que diga otra cosa,
cada paquete incluye sus pruebas e2e, y la **puerta Q** (sección 7) se corre después.

### Carril S · Puerta de datos reales (prioridad: es lo que habilita clientes reales)

| ID | Paquete | Nivel | T | Depende de | Plan |
|---|---|---|---|---|---|
| **S0** | **Anexo de diseño de 2FA y exportación completa** (secretos, códigos de recuperación, qué incluye la exportación). Lo revisan revisor-critico y seguridad antes de programar | N1 (arquitecto) | M | Plan v0.3 aprobado | v0.3 0.5 |
| **S1** | 2FA en el backend: activar, verificar, códigos de recuperación, bitácora | N1 | L | S0 | v0.3 3.1 |
| **S2** | Exportación completa por empresa (datos, adjuntos, XML), solo ADMIN | N1 | L | S0 | v0.3 3.2 |
| **S3** | Copia de respaldo **fuera del servidor**, cifrada, con aviso de fallo y restauración ensayada desde la copia | N2 (devops) | M | **D17 y D18 de Carlos** | v0.3 3.3, v0.2 11.2 |
| **S4** | Pantallas de 2FA y de exportación | N2 | M | S1, S2 | v0.3 3.4 |
| **S5** | Seguridad pendiente de la Fase 1: cabeceras duplicadas helmet/nginx (SEG-7) y vigilancia de `exceljs` | N2 | S | — | Informe de seguridad Fase 1 |

### Carril N · Núcleo fiscal (backend, v0.3)

| ID | Paquete | Nivel | T | Depende de | Plan |
|---|---|---|---|---|---|
| **N1** | **Corregir sin borrar (R2)**: `voidEntry` con reverso por llamador, cierre de año intacto, nota de crédito en meses cerrados, endpoint de asientos limitado a `sourceType = MANUAL`, apertura y conciliación, ajuste de las pruebas del socio. Incluye su pantalla «Corregir» (N2 front) | N1 + front N2 | L+M | D34 | v0.3 Fase 1 (1.1–1.5), §4 |
| **N2a** | **Parámetros fiscales con vigencia**: tablas de solo inserción, `valueAt` (que ignora filas reemplazadas), migración, ficha de empresa | N1 | M | Plan aprobado | v0.3 2.1 |
| **N2b** | **Cargador** del catálogo: `--dry-run`, esquema estricto, fecha mínima, informe por `fiscalParameterId` + el catálogo JSON | N1 + N2 | L+S | N2a, valores de la contadora | v0.3 2.2, 2.3 |
| **N2c** | `build()` con la tasa y la base del parámetro, trazabilidad (`appliedRate`, `fiscalParameterId`), nota de crédito hereda la tasa original, umbral del 607 | N1 | M | N2a, **D37** | v0.3 2.4 |
| **N2d** | Sugerencias de enlace de `TaxRate`, `effective?date`, avisos de ficha. Pantallas «Valores fiscales», «Impuestos», «Datos fiscales» | N2 | M+L | N2c | v0.3 2.5, 2.7 |
| **N3** | **e-CF mínimo + importación de XML**: `EcfDocument`, bloqueo de edición, importar XML (lector seguro, 10 archivos, e-NCF sin choques, «No verificado») y su pantalla | N1 + front N2 | L+L | N1, N2a | v0.3 Fase 4 (4.1, 4.2, 4.5) |
| **N4** | Ajustes del 606/607/608 y **cuadres netos** («revisión del mes») | N1 | L | N2c | v0.3 4.3 |
| **N5** | **Calendario fiscal**: obligaciones, feriados, presentaciones, avisos en el Panel, bloqueo de las B con fecha real y contingencia | N1 + N2 | L+M | N1, N2a | v0.3 Fase 5 |
| **N6** | **609, IT-1 e IR-17 asistidos** | N1 + N2 | L+L | N4, N5, casillas validadas por la contadora | v0.3 Fase 6 |
| **N7** | **e-CF con el proveedor**: armador de XML, adaptador, trabajador con reintentos, contingencia. **Bloqueado** | N1 | L+L | Documentación del proveedor y XSD | v0.3 Fase 7 |

### Carril E · Experiencia guiada (v0.2 Fases 2 a 4)

| ID | Paquete | Nivel | T | Depende de | Plan |
|---|---|---|---|---|---|
| **E1a** | `src/guidance/`: estado del arranque (5 grupos), flujos de factura y cierre de mes | N2 | M+M | — | v0.2 2.1, 2.4 (con su e2e 2.5) |
| **E1b** | **Plantilla de plan de cuentas e impuestos base** para la empresa nueva (reutiliza el catálogo RD ya cargable) | N1 | L | N2c, plan de cuentas validado por contadoras (D14) | v0.2 2.2 |
| **E1c** | **Datos de ejemplo** que se borran con un clic, con borrado seguro | N1 | L | E1b | v0.2 2.3 |
| **E2** | Asistente `/setup` de 5 grupos, guía de NCF, pendientes en el Panel, cierre de mes guiado. Meta: primera factura en menos de 15 minutos | N2 | L+L+L | E1a, E1b | v0.2 2.6–2.8 |
| **E3-back** | Semáforo: `src/financial-analysis/`, límites, tendencia, comparación, indicadores | N2 (revisa N1) | M+L+L | — (límites D5 por validar) | v0.2 3.1–3.4 |
| **E3-front** | Pantallas del semáforo, tendencia, comparar y franja de indicadores en el Panel | N2 | L+L | E3-back | v0.2 3.5, 3.6 |
| **E4-a** | Pantallas guiadas — **Ventas** (estados vacíos, ayudas de campo, errores con enlace, botón principal único) | N3 con revisión N2 | L | Patrón de la Fase 1 | v0.2 4.1–4.3 |
| **E4-b** | Ídem — **Contabilidad** | N3 + N2 | L | idem | idem |
| **E4-c** | Ídem — **Bancos** | N3 + N2 | L | idem | idem |
| **E4-d** | Ídem — **Reportes** y **Configuración** (sin impuestos ni NCF) | N3 + N2 | L | idem | idem |
| **E4-e** | Ídem — pantallas **fiscales** (Impuestos, NCF, DGII, Panel, empresa) | N2 | L | N2d, N5 | idem |

### Carril A · Auditoría (v0.2 Fases 5 y 6)

| ID | Paquete | Nivel | T | Depende de | Plan |
|---|---|---|---|---|---|
| **A1** | Rol AUDITOR (migración propia del enum), modelos de encargos, papeles y procedimientos, plantillas | N1 | M+L+M | — | v0.2 5.1–5.3 |
| **A2** | Hallazgos, respuesta de gerencia, visibilidad y **pruebas de lo que el auditor no puede hacer** (`security.e2e-spec.ts`) | N1 | L+M | A1 | v0.2 5.4, 5.5 |
| **A3** | Pantallas de auditoría I: rol, menú, encargos, papeles, hallazgos | N2 | M+L | A1, A2 | v0.2 5.6, 5.7 |
| **A4** | Marcas, archivos, partidas revisadas e **informe PDF/Excel** | N2 (revisa N1) | S+L+M+L+M | A1 | v0.2 6.1–6.5 |
| **A5** | Pantallas de auditoría II: partidas con marcas, archivos, informe | N2 | L | A4 | v0.2 6.6 |

### Carril V · Vertical e integración (lo que necesita el socio)

| ID | Paquete | Nivel | T | Depende de | Plan |
|---|---|---|---|---|---|
| **V0** | **Contrato de integración**: documento que dice cómo una vertical usa el núcleo financiero. Debe responder: ¿cómo genera asientos (`PostingService.post`)?; ¿cómo se extiende `SourceDocumentType` sin que cada vertical migre el enum?; ¿cómo reutiliza clientes/proveedores, impuestos, NCF, centros de costo y adjuntos?; ¿cómo registra sus permisos, su menú y su ayuda?; ¿qué versión del núcleo requiere?; ¿qué cosas **no** puede hacer (editar lo contabilizado, saltarse períodos)? | N1 (arquitecto) | M | Plan v0.3 aprobado | Nuevo; `docs/CONTRATO-VERTICALES.md` |
| **V1a** | **Enganches** (Claude-servidor): origen `VERTICAL` + `sourceModule`, origen en facturas, `createInTx`, `findBySource`, `nextFor`, registro y versión, pruebas con módulos extra, enlaces en pantallas. No espera a N1 | N1 | L | V0 | Contrato §7.1; ficha V1 |
| **V1b** | **Validaciones** (Claude-PC): cliente y centro de costo de la empresa en `post` y `build`; cuentas prohibidas para asientos de verticales; según decisiones, cobro en la transacción | N1 | M | N1, V1a | Contrato §7.2; ficha V1 |
| **V4** | **Activación por empresa** (Claude-PC): cada empresa ve solo las verticales que contrató; apagar no impide corregir lo existente | N1 | M | V1a, decisión P4 | Contrato §3.5, §7.3; ficha V4 |
| **V2** | **Plantilla de módulo vertical** (Claude-PC): carpeta ejemplo que la IA del socio copia | N2 | M | V1a | Contrato §8.3 |
| **V3** | **Pruebas de contrato** (Claude-PC): suite que verifica que cualquier vertical respeta las reglas, con revisiones automáticas del código | N1 | L | V1b, V2, V4 | Contrato §8.4 |

### Carril D · Documentación y contenido (casi todo apto para N3 con revisión)

| ID | Paquete | Nivel | T | Depende de | Plan |
|---|---|---|---|---|---|
| **D1** | Manual de las pantallas ya construidas (secciones 6 a 9) y `ayuda.json` de campos y errores | N3 + revisión N2 | M | — | v0.2 4.4 |
| **D2** | Manual y `ayuda.json` de cada paquete cuando se cierra (arranque, semáforo, auditoría, 2FA, calendario, declaraciones) | N3 + revisión N2 | M c/u | el paquete correspondiente | v0.2 2.9, 3.7, 5.8, 6.7; v0.3 manuales |
| **D3** | Valores fiscales con su fuente para N2b (histórico desde la fecha mínima), con la contadora | N2 + contadora | M | Documentos de la DGII de Carlos | v0.3 0.1 |
| **D4** | Notas de versión dentro del sistema | N3 + revisión | S | cierre de cada versión | v0.2 7.3 |

### Tareas que solo puede hacer una persona

| Quién | Tarea | Bloquea |
|---|---|---|
| Carlos | Aprobar el plan v0.3 y decidir D29, D34–D40 | S0, V0, N1, N2c |
| Carlos | Decidir D17 (destino de la copia externa) y D18 (quién guarda la frase secreta) | S3 |
| Carlos | Bajar de la DGII los instructivos 606/607/608/609, IT-1, IR-17, feriados 2026–2027 y los XSD de e-CF | D3, N5, N6, N7 |
| Carlos | Pedir al proveedor de e-CF su documentación técnica y su ambiente de pruebas | N7 |
| Contadoras | Validar plan de cuentas RD (D14), límites del semáforo (D5), plantillas de auditoría, valores «Por validar» | E1b, E3, A1, N2b |
| Carlos y socio | Organización de GitHub (punto 2), protección de la rama principal, tablero | Todos (para fusionar con orden) |
| Socio | Decidir qué carriles toma; revisar PR que tocan sus archivos | N1, N2c |

---

## 6. Plantilla para entregar un paquete a una IA

Copiar, completar lo que está entre corchetes y pegar como primer mensaje:

```text
Eres parte de un equipo que desarrolla el Módulo Financiero (NestJS + Prisma en la raíz, Angular en frontend/).
Tu paquete es [ID] — [título], del plan [PLAN-v0.2 / PLAN-v0.3], tareas [números].

LEE ANTES (en este orden): CLAUDE.md; docs/GUIA-PRODUCTO.md (sección 6); docs/GUIA-CONTABLE-FISCAL.md (R1–R12 y sección 8);
docs/PAQUETES-DE-TRABAJO.md (sección 1: reglas); y las secciones [X] del plan.

OBJETIVO: [una frase].
ALCANCE: puedes crear o modificar solo estos archivos/carpetas: [lista]. Si necesitas tocar otro, detente y dilo.
NO HAGAS: [lo que queda fuera, p. ej. «no cambies posting.service.ts», «no uses datos reales», «no cambies migraciones existentes»].
RAMA: [wp/ID-nombre], salida desde [rama principal al día].
ENTREGABLES: [código, pruebas e2e en test/, manual en frontend/public/manual/, entradas de ayuda.json].
CRITERIOS DE ACEPTACIÓN: [lista medible, copiada de la tabla].
CÓMO PROBAR: npm run build; npm test; npm run test:e2e (base de pruebas propia, puerto [N]);
frontend: ng build, ng test, node scripts/verificar-ayuda.mjs.
AL TERMINAR: no hagas push a la rama principal. Abre el PR con: qué hiciste, archivos tocados, decisiones, cómo probarlo, qué queda pendiente.
Nunca incluyas claves, .env ni datos reales. Si algo contradice el plan o las guías, pregunta antes de decidir.
```

---

## 7. Puertas de calidad (cada paquete, antes de fusionar)

No se delegan a N3. Se corren en este orden y cada una puede devolver el paquete:

1. **QA** (N2): suite completa, casos límite, pantallas contra el checklist (sección 6 de la Guía de producto).
2. **Seguridad** (N1): obligatoria para los paquetes que tocan permisos, migraciones, archivos subidos, tokens, dinero o aislamiento entre empresas. Lista: N1, N2a–c, N3, N5, N6, S1–S3, A1, A2, E1c, V1a, V1b, V4, **T2a, T3a, T5a, T5b** (taller integrado).
3. **Revisor crítico** (N1): al cerrar cada fase y cada versión, contra las dos guías y el plan.
4. **Documentación** (N3 + revisión): el manual del paquete está en el PR.
5. **Revisión humana**: Carlos aprueba la fusión; si el PR toca archivos del socio (`posting`, `invoicing`), se le avisa a él.
6. **Despliegue en pruebas**: con respaldo previo y con autorización de Carlos. Datos reales: **no** hasta que S1, S2 y S3 estén aprobados y Carlos lo diga.

---

## 8. Cuánto se puede ganar (estimación mía, a confirmar con el arquitecto)

- El plan actual termina en **19–21 semanas** de calendario con un solo equipo de agentes.
- Con los carriles N, E, A y S trabajando a la vez y un límite de 5 paquetes abiertos, una meta razonable es
  **10 a 14 semanas** para tener todo menos N7. La fecha depende de la capacidad de revisión, no de programar.
- **No se acorta:** la validación de las contadoras, los documentos de la DGII, la documentación del proveedor de
  e-CF (N7 suma unas 3 semanas desde que llegue) ni las decisiones de Carlos.
- **La vertical del socio es el taller**, una aplicación aparte que se integra por API (`docs/INTEGRACION-TALLER.md` v1.1,
  pendiente de Carlos). Fechas propuestas: ambiente integrado con semilla ≈ 27 oct; primer recorrido orden → factura →
  asiento ≈ 10–13 nov; integración robusta ≈ 24 nov; lado de la integración listo para la puerta de datos reales ≈ 5–9 dic.
  Para producción espera además S1–S3 (datos reales), N1 y, para e-CF, N3 y N7.

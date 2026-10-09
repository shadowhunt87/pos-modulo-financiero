# Plan técnico — Módulo financiero (producto comercial multiempresa)

Fecha: 2026-10-08 · Autor: Arquitecto · Versión 2 (incorpora la revisión del revisor-critico)
Estado: **PROPUESTA, pendiente de aprobación de Carlos.**
El veredicto de calidad de cada fase es de `qa`; la aprobación de negocio, de Carlos.

Alcance confirmado:
1. Presupuestos (presupuesto vs. real por cuenta y centro de costo).
2. Reportes DGII 606 (compras) y 607 (ventas) en el formato oficial vigente.
3. Facturación electrónica e-CF: **no se construye propia** (sin firma XML, certificado ni
   certificación DGII). La hace un proveedor externo. Aquí: conexión con ese proveedor e
   importación de XML e-CF (Fase 5).
4. Revisión y corrección de lo existente.
5. Toda la parte visual (hoy no existe ninguna pantalla).

Cambios de la versión 2: copias de seguridad a la Fase 0; Fase e-CF recortada y diseñada contra
el proveedor real, con compras E41/E43 e importación de XML; Fase 1 ampliada (bloqueo de serie B,
duplicados RNC+NCF, auditoría de solo agregar, reapertura de períodos, aislamiento por RLS);
reordenamiento (modelo fiscal antes de la pantalla de facturas; presupuestos como trabajo
adelantable); Caddy eliminado; GitHub endurecido; estimación y versión mínima vendible.

---

## 1. Diagnóstico del backend actual

### 1.1 Qué hay (resumen para Carlos)

Es un backend contable **bien encaminado**. Cuida lo esencial: partida doble validada en el
programa y en la base de datos, períodos cerrados que bloquean cambios, numeración de NCF sin
huecos ni duplicados aunque dos personas facturen a la vez, auditoría en la misma operación que
el cambio, y filtro por empresa en las consultas.

| Módulo | Qué hace | Estado |
|---|---|---|
| Acceso | Login, roles (Admin, Contador, Aprobador, Solo lectura) | Funciona; faltan protecciones (1.3) |
| Contabilidad | Plan de cuentas, períodos, asientos, balance de comprobación | Funciona, con inconsistencias (1.3) |
| Maestros | Terceros, impuestos, NCF, diarios, numeraciones, cuentas por defecto | Funciona |
| Facturación | Ventas, compras, notas de crédito/débito, retenciones, asiento automático | Funciona, con riesgos fiscales (1.3) |
| Cobros y pagos | Pagos a varias facturas, anticipos, diferencia cambiaria, antigüedad | Funciona |
| Tesorería | Bancos, caja chica, extractos CSV, reglas, conciliación | Funciona |
| Reportes | Diario, mayor, auxiliares, resultados, balance, flujo de efectivo | Funciona |
| **Presupuestos** | Tablas creadas, **código vacío** | **No existe** |
| 606 / 607 | Solo dos campos de clasificación en la factura | **No existe** |
| e-CF | Solo los códigos E31–E47 en un catálogo | **No existe** (y emitir tipos E hoy es peligroso) |
| Pantallas | — | **No existe** |

### 1.2 Pruebas técnicas realizadas (sin base de datos, en una copia aparte)

| Prueba | Resultado |
|---|---|
| `npm ci` | **Falla**: `package-lock.json` desincronizado con `package.json` (falta typescript 5.9.3). |
| Versión de Node | Servidor con Node 20; varias dependencias exigen **Node 22+**. |
| Tipos (TypeScript) | OK, sin errores. |
| Compilación (`nest build`) | OK. |
| Pruebas unitarias | 1 sola, el "Hello World" de plantilla. **Cobertura unitaria real: cero.** |
| Pruebas e2e | ~133 en 7 archivos; **no se corrieron** (necesitan base de datos). |
| Lint | 7 advertencias menores. |
| `postinstall: prisma skills sync` | Ver 1.5. Hoy no hace nada, pero se elimina. |

### 1.3 Problemas encontrados

**Críticos (riesgo fiscal, contable o de datos)**
1. **Facturas E31–E47 se "emiten" sin e-CF**: consumen un número local sin pasar por la DGII.
   Comprobante inválido. Hay que bloquearlas.
2. **Plazo legal de e-CF.** Aviso DGII 06-26 (06/05/2026, copia en
   `docs/normativa-dgii/`): prórroga única de 6 meses desde el 15/05/2026 para Pequeños,
   Micros y No clasificados, o sea **hasta el 15/11/2026**; después aplican las sanciones del
   art. 27 de la Ley 32-23. Consecuencia: los clientes del producto ya emitirán e-CF con algún
   proveedor **antes** de que este producto esté listo. El producto debe convivir con eso.
3. **Anulación de facturas**: hoy se anula cualquier factura emitida. Un e-CF aceptado no se
   anula; se corrige con nota de crédito (E34).
4. **El `.env` apunta a `localhost:5432`**, ocupado en el servidor por un Postgres de otro
   proyecto. Correr migraciones o pruebas así tocaría una base ajena.
5. **`financial-backend-3.zip` contiene el `.env` con credenciales reales** (git lo ignora).
   Sacarlo de la carpeta y cambiar esas claves.
6. **Asientos manuales por otro camino**: sin número, diario ni período; aceptan cuentas "de
   agrupación"; al anularlos no guardan quién/cuándo/por qué. Hay que unificar.
7. **Asientos en fechas sin período fiscal** se aceptan en silencio.
8. **Sin control de duplicados en la base**: el NCF repetido de un proveedor solo se revisa en
   el programa, no hay restricción en la base de datos.

**Importantes**
9. **Multiempresa incompleto**: un usuario = una empresa; email único global; no se pueden crear
   empresas ni hay administrador de plataforma.
10. **Aislamiento entre empresas solo "por disciplina"**: cada consulta debe acordarse de
    filtrar por empresa. Ya hay huecos: el motor de asientos no verifica que centros de costo y
    terceros de cada línea sean de la empresa. Y hay SQL directo (`$queryRaw`) que ningún filtro
    automático del ORM cubre.
11. **Montos con coma flotante**: entradas como número de JavaScript, y en
    `src/invoicing/invoicing.service.ts` líneas ~222–232 (editar) y ~280–286 (emitir) se
    convierten montos guardados con `Number(...)` antes de recalcular. Pueden perder precisión.
12. **La auditoría se puede modificar o borrar** desde la aplicación (no es de solo agregar).
13. **Reabrir períodos cerrados** no exige motivo ni deja constancia más allá de un cambio de
    estado; cualquier admin puede reabrir cualquier período.
14. **Faltan servicios básicos**: centros de costo (necesarios para presupuestos), tasas de
    cambio, usuarios, datos de empresa, adjuntos, **cierre de año**, importación de plan de
    cuentas y **saldos iniciales** (imprescindible para que un cliente migre a mitad de año).
15. **Seguridad de acceso**: sin límite de intentos de login, sin cabeceras de seguridad, sin
    cierre de sesión real, token en cabecera (el frontend tendría que guardarlo en el navegador),
    auditoría sin IP.
16. **Dependencias que sobran**: `bull`/`@nestjs/bull` (Redis, sin uso), `@nestjs/observe`
    (telemetría a un servicio externo), `@nestjs/mau` (despliegue AWS).
17. **`docker-compose.yml`** con contraseñas fijas, pgAdmin "latest", sin contenedor de API.
18. `JWT_EXPIRES_IN="8h"` en `.env` no se lee (el código usa `JWT_EXPIRES_IN_SECONDS`).

**Menores**: una sola secuencia NCF por tipo; cliente Prisma generado dentro de git; README de
plantilla; seed con datos fijos ("Yovanny", "Sirtech"); archivos vacíos.

### 1.4 Puertos (verificado con `ss -ltnp` y `docker ps`, sin tocar nada)

| Puerto | Estado | Propuesta |
|---|---|---|
| 127.0.0.1:5432 | **OCUPADO** (Postgres de otro servicio) | No usar. Postgres del proyecto **sin publicar** (red interna Docker); si hace falta para herramientas: `127.0.0.1:5442` (libre). |
| 127.0.0.1:5050 | Libre | pgAdmin ahí, **solo bajo demanda** (perfil `tools`). |
| 127.0.0.1:8040 | Libre | **Única entrada**: NestJS sirve pantallas y `/api`. |

Nada se expone a internet. Para ver las pantallas: túnel SSH o VPN privada (decisión 4).

### 1.5 Qué hace `postinstall: "prisma skills sync || exit 0"` (verificado)

- En Prisma 7.10.0 (la versión instalada) `skills` **no es un comando válido**: responde
  "Unknown command" y el `|| exit 0` oculta el error. **Hoy no hace nada.**
- Pero el CLI de Prisma trae un "ofrecimiento de skills" que, en una terminal interactiva fuera
  de contenedores/CI, propone ejecutar `npx --yes skills@1.5.14 add prisma/skills --agent
  cursor claude-code codex windsurf ...`: **descarga un paquete de internet y escribe archivos
  de instrucciones para asistentes de IA en `.claude/skills/`**, y envía un evento de
  telemetría a Prisma. El CLI además hace "checkpoint" (telemetría de versión).
- Acción (Fase 0): eliminar el `postinstall`, definir `CHECKPOINT_DISABLE=1` en el entorno y en
  Docker, e instalar en Docker con `npm ci --ignore-scripts` + `prisma generate` explícito.

---

## 2. Decisión de stack del frontend

### Recomendación
**React + Vite + TypeScript + Tailwind CSS**, componentes **shadcn/ui** copiados al repo, sin
CDN. Se compila a archivos estáticos que **sirve el propio NestJS** (`@nestjs/serve-static`,
paquete oficial MIT) en el mismo puerto y dominio que la API (`/api`).

Librerías (maduras, MIT, sin CDN): TanStack Query/Router/Table, React Hook Form + Zod,
Recharts, decimal.js (montos exactos en pantalla), Playwright (pruebas de pantallas).

**Por qué, en términos de negocio**
- Un solo lenguaje (TypeScript) en backend y pantallas.
- La contabilidad es muy interactiva (asiento de N líneas que cuadra en vivo, factura con
  impuestos en vivo, conciliación); React tiene el mayor ecosistema probado para eso.
- Pantallas internas detrás de login: no se necesita servidor de renderizado.
- Tailwind + shadcn/ui: apariencia premium con **un solo sistema de diseño**.

### Por qué NestJS sirve las pantallas (y no Caddy)
La versión 1 proponía Caddy delante. Se **quita**: hoy todo es privado en 127.0.0.1, así que
Caddy no aporta nada que NestJS no haga (archivos estáticos, compresión, cabeceras de seguridad
con `helmet`). Una pieza menos que configurar, actualizar y auditar. Mismo origen = sin CORS y
cookie de sesión simple. Cuando se exponga a internet, la terminación HTTPS se decide en la
Fase 7 (el servidor ya tiene un proxy de otro proyecto que **no** se toca sin autorización).

### Alternativas descartadas
| Opción | Por qué no |
|---|---|
| Next.js | Segundo servidor Node con renderizado que aquí no aporta. Más superficie. |
| htmx + plantillas en el servidor (base habitual) | El backend es API JSON; los formularios contables dinámicos se vuelven difíciles. |
| Angular / Vue | Válidos; menos componentes listos para tablas y formularios complejos. |
| Reescribir el backend en Python | Semanas para rehacer algo que funciona bien. |

### Aviso de deuda técnica
Este proyecto **no usa la base técnica estándar** del equipo (FastAPI + htmx). Se mantiene
NestJS porque ya está escrito y es de buena calidad. Costo: el equipo mantiene dos stacks entre
proyectos. Costo de no aceptarlo: reescribir el backend. **Recomiendo aceptarlo.**

### Integración
```
Navegador ──> 127.0.0.1:8040  NestJS
                 ├── /        → pantallas (archivos estáticos compilados)
                 └── /api/*   → API
                                  └── Postgres (red interna, sin publicar)
```
- Sesión **solo por cookie** segura (httpOnly, Secure cuando haya HTTPS, SameSite=Strict) con
  protección CSRF. Se elimina el token en cabecera: sin doble método de transición.
- Repositorio único con `backend/` y `frontend/`; una imagen Docker que compila ambos.

### Tipos de la API para el frontend (promesa ajustada)
Hoy los servicios devuelven los objetos de la base tal cual, sin "contratos de respuesta"
declarados. Por eso, generar el cliente de la API automáticamente **solo da tipos de
entrada** al principio; los de respuesta saldrían vacíos. Promesa realista:
- **Fase 0 (S)**: documentación OpenAPI de las **entradas** (vía plugin de NestJS, sin tocar
  cada archivo) en `/api/docs`, solo en red privada.
- **Fases 2–4 (M en total, repartido)**: contratos de respuesta **módulo por módulo, a medida
  que el frontend consume cada uno**. Los montos viajan siempre como texto decimal.

---

## 3. Plan por fases

**Orden**: primero sanear y proteger datos; luego núcleo y pantallas base; después el modelo
fiscal (606/607 + estados e-CF) **antes** de la pantalla de facturas, para no construirla dos
veces; luego operación, e-CF y 606/607. **Presupuestos es trabajo adelantable**: se hace en
cualquier hueco mientras se espera a terceros (proveedor e-CF, contador).

Tamaños: **S** = horas · **M** ≈ 1 día · **L** = varios días.

### Fase 0 — Saneamiento, copias de seguridad y repositorio (≈1 semana)
**Entregable para Carlos:** backend corriendo con su propia base, documentación de la API por
túnel, informe "pruebas X de X en verde", primera copia de seguridad restaurada con éxito,
repositorio privado con el socio invitado.

| # | Agente | Tarea | Tam. |
|---|---|---|---|
| 0.1 | devops | Mover el zip fuera del proyecto (previa aprobación). Reorganizar en `backend/` + `frontend/`. | S |
| 0.2 | devops | `docker-compose.yml` nuevo: Postgres 18 sin publicar, pgAdmin bajo demanda en 127.0.0.1:5050 con versión fija, contenedor de la app (Node 22 LTS) en 127.0.0.1:8040; claves solo por variables. | M |
| 0.3 | devops | **Copias de seguridad automáticas**: volcado diario de la base, cifrado, fuera del volumen de Docker, retención 14 diarias + 8 semanales, **prueba de restauración documentada**. Destino fuera del servidor según decisión de Carlos. | M |
| 0.4 | devops | Base de datos de **pruebas separada**. | S |
| 0.5 | dev-backend | Lockfile regenerado, Node 22 en `engines`, quitar `bull`, `@nestjs/bull`, `@nestjs/observe`, `@nestjs/mau` y el `postinstall`; `CHECKPOINT_DISABLE=1`; `.env.example` correcto; cliente Prisma generado en el build. | S |
| 0.6 | dev-backend | Prefijo `/api` y documentación OpenAPI **de entradas** en `/api/docs` (ver sección 2). | S |
| 0.7 | qa | Correr las ~133 pruebas e2e contra la base de pruebas; reportar fallas. | M |
| 0.8 | seguridad | Escaneo de secretos de todo el historial antes del primer push; rotar JWT_SECRET y clave de BD. | S |
| 0.9 | devops | GitHub: repo privado; **doble factor obligatorio** para Carlos y el socio; **rama `main` protegida** (sin push directo ni force-push, cambios por pull request con pruebas en verde); escaneo de secretos antes de cada push (gitleaks local si el plan de GitHub no incluye el escaneo del servidor). | S |
| 0.10 | documentador | README real en español: qué es, cómo arrancar, puertos, pruebas, copias de seguridad. | S |

Nota GitHub: proteger ramas en un repositorio **privado** requiere GitHub Pro (cuenta personal)
o Team (organización), de pago. Decisión 4.
**Terminado cuando:** `npm ci`, build y e2e pasan en Docker; nada escucha fuera de 127.0.0.1;
una restauración de copia de seguridad funcionó; `seguridad` firma que no hay secretos en git;
rama protegida y 2FA activos.

### Fase 1 — Núcleo, seguridad, aislamiento y multiempresa (≈3–4 semanas)
**Entregable:** informe de qa con cada corrección probada; servicios nuevos visibles en la
documentación de la API.

**Barrera de aislamiento entre empresas — decisión: Postgres RLS (Row Level Security).**
- Qué es: la propia base de datos rechaza leer o escribir filas de otra empresa, aunque el
  programa olvide el filtro. La aplicación se conecta con un usuario de base de datos **sin**
  permiso para saltarse la regla; en cada petición se fija "empresa activa = X" dentro de la
  transacción.
- Por qué RLS y no un filtro centralizado en el ORM: (a) el código ya usa SQL directo
  (`$queryRaw` en NCF) y los reportes tienden a usarlo; un filtro del ORM no lo cubre;
  (b) un filtro del ORM tampoco cubre referencias por id en relaciones anidadas, que es
  exactamente el hueco ya encontrado (centros de costo/terceros de otra empresa); (c) para un
  producto que guarda la contabilidad de muchas empresas, la garantía debe estar en la base, no
  en la disciplina de cada programador.
- Costo: ≈1 semana. Se agrega `companyId` a las tablas hijas que no lo tienen (líneas de asiento,
  líneas de factura, retenciones, aplicaciones de pago, movimientos bancarios, emparejamientos,
  líneas de presupuesto) para que las reglas sean simples y rápidas; login y administración de
  plataforma usan un camino aparte y acotado; las migraciones corren con otro usuario.
- Se mantienen además los filtros por empresa en el código (doble protección).

| # | Agente | Tarea | Tam. |
|---|---|---|---|
| 1.1 | dev-backend | Asientos manuales por el motor único (`PostingService`); anulación con quién/cuándo/por qué. | M |
| 1.2 | dev-backend | Exigir período fiscal abierto para cualquier asiento. | S |
| 1.3 | dev-backend | **Reapertura de períodos**: solo Admin, motivo obligatorio, registro (quién, cuándo, motivo) en el período y en auditoría; prohibida si el año fiscal está cerrado; aviso si ya se generó 606/607 de ese mes. | S |
| 1.4 | dev-backend | **RLS** según el diseño de arriba + validación de pertenencia de centros de costo y terceros en motor de asientos y facturas. | L |
| 1.5 | dev-backend | Montos como texto decimal exacto en todas las entradas; **eliminar los `Number(...)` de `invoicing.service.ts`** (~222–232 y ~280–286) trabajando con decimales de punta a punta. | M |
| 1.6 | dev-backend | **Bloquear tipos E** hasta que la empresa tenga e-CF configurado. **Bloquear emisión de tipos B** a partir de una fecha configurable por empresa (por defecto la de su obligación e-CF); en compras, un NCF B de proveedor con fecha posterior genera advertencia. | S |
| 1.7 | dev-backend | **Duplicados por RNC + NCF en la base**: guardar el RNC del emisor en la factura e índice único parcial (empresa, RNC emisor, NCF) excluyendo anuladas. | S |
| 1.8 | dev-backend | **Auditoría de solo agregar**: el usuario de la app sin permiso de modificar/borrar la tabla, más un disparador en la base que lo impide. | S |
| 1.9 | dev-backend | Multiempresa: membresía usuario↔empresa con rol por empresa, cambio de empresa activa, rol administrador de plataforma, alta de empresas. Migración que conserva usuarios. | L |
| 1.10 | dev-backend | Servicios faltantes: centros de costo, tasas de cambio, usuarios, datos de empresa, **importación de plan de cuentas y saldos iniciales**. | M |
| 1.11 | dev-backend | Seguridad: límite de intentos de login, `helmet`, **sesión solo por cookie** + CSRF + cierre de sesión real, IP/navegador en auditoría, 2FA para administradores. | M |
| 1.12 | dev-backend | Cierre de año fiscal (si Carlos lo aprueba en esta fase; si no, pasa a Fase 7). | M |
| 1.13 | qa | Pruebas unitarias de reglas contables; **prueba de aislamiento**: conectado como empresa A, intentar leer/escribir/referenciar datos de B en cada tabla (también por SQL directo). | L |
| 1.14 | seguridad | Revisión de RLS, roles, cookie/CSRF, fuerza bruta al login. | M |
| 1.15 | documentador | Reglas contables del sistema en lenguaje de contador. | S |

**Terminado cuando:** todo con prueba automática; la base rechaza accesos entre empresas aunque
se salte el programa; la auditoría no se puede alterar; `seguridad` y `qa` aprueban.

### Fase 2 — Base visual, configuración y contabilidad (≈3 semanas)
**Entregable:** Carlos entra por el túnel, inicia sesión, elige empresa y usa: tablero, plan de
cuentas, asientos, períodos, terceros, impuestos, NCF, usuarios, importación de saldos iniciales.

| # | Agente | Tarea | Tam. |
|---|---|---|---|
| 2.1 | dev-frontend | Proyecto Vite + React + TS + Tailwind; **sistema de diseño** (tema, tipografía autoalojada, componentes base); formatos es-DO; cliente de API. | M |
| 2.2 | dev-frontend | Login (+2FA), selector de empresa, menú, permisos por rol, páginas de error. | M |
| 2.3 | dev-frontend | Tablero (bancos, CxC/CxP, ventas del mes, alertas de NCF). | M |
| 2.4 | dev-frontend | Plan de cuentas en árbol, períodos (cierre/reapertura con motivo), asientos (N líneas que cuadran en vivo), balance de comprobación. | L |
| 2.5 | dev-frontend | Maestros, usuarios, datos de empresa, importación de plan de cuentas y saldos iniciales. | L |
| 2.6 | dev-backend | Contratos de respuesta de los módulos que consume esta fase; ajustes de filtros. | M |
| 2.7 | qa | Playwright de flujos principales; revisión visual laptop/tablet. | M |
| 2.8 | documentador | Guía de configuración inicial de una empresa. | S |

**Terminado cuando:** una empresa nueva se configura de cero solo con pantallas.

### Fase 3 — Modelo fiscal de la factura (606/607 + estados e-CF) (≈1 semana)
Va **antes** de la pantalla de facturas para que esta se construya una sola vez.
**Requisito previo:** plantillas e instructivos oficiales 606/607 vigentes guardados en
`docs/normativa-dgii/` con su fecha (el sitio de la DGII bloquea la descarga automática; se
bajan desde un navegador).
**Entregable:** tabla de mapeo "campo DGII → dato del sistema" revisada por el contador.

| # | Agente | Tarea | Tam. |
|---|---|---|---|
| 3.1 | dev-backend | Mapeo campo por campo de 606 y 607 contra la plantilla oficial vigente (606 modificada 28/10/2025; 607 31/05/2023). Enviar al contador. | S |
| 3.2 | dev-backend | Migración con los campos fiscales faltantes (606: servicios vs. bienes, ITBIS retenido / proporcionalidad / llevado al costo / percibido, tipo y monto de retención ISR, ISR percibido, ISC, otros impuestos, propina legal, fecha y forma de pago; 607: fecha de retención, retenciones de terceros, percibidos, forma de cobro). | M |
| 3.3 | dev-backend | Campos de estado e-CF en la factura (no aplica, pendiente, enviado, aceptado, aceptado condicional, rechazado, error; código de seguridad, fecha de firma, QR, referencia externa, último error) y origen del documento (creado aquí / importado de XML). Solo modelo de datos; la conexión es Fase 5. | S |
| 3.4 | qa | Revisar que la migración no altera facturas existentes. | S |

**Terminado cuando:** el contador aprueba el mapeo por escrito y la migración pasa las pruebas.

### Fase 4 — Pantallas de operación y reportes (≈4 semanas)
**Entregable:** facturar, cobrar, pagar, conciliar y ver estados financieros desde pantalla,
con PDF y Excel.

| # | Agente | Tarea | Tam. |
|---|---|---|---|
| 4.1 | dev-frontend | Facturas de venta y compra, notas, con totales en vivo, **campos fiscales 606/607** y **estado e-CF** visible. | L |
| 4.2 | dev-frontend | Cobros y pagos, notas de crédito aplicadas, estado de cuenta, antigüedad. | L |
| 4.3 | dev-frontend | Tesorería: extracto CSV con vista previa, reglas, conciliación. | L |
| 4.4 | dev-frontend | Reportes con navegación del saldo al asiento de origen. | L |
| 4.5 | dev-backend | PDF generado en el servidor y Excel; adjuntos en disco del servidor; contratos de respuesta pendientes. | M |
| 4.6 | qa | Un mes contable completo verificado contra el cálculo manual del contador. | M |
| 4.7 | documentador | Manual de operación diaria. | M |

**Terminado cuando:** un contador cierra un mes de una empresa de prueba solo con pantallas y
los estados cuadran con su cálculo independiente.

### Fase 5 — e-CF con proveedor externo (≈1,5 semanas importación + 2–3 semanas conexión)
Recortada respecto a la versión 1: **sin** adaptador genérico multiproveedor, **sin** webhooks
y **sin** proveedor simulado general. Se diseña **contra la documentación del proveedor que se
elija**, que todavía no existe.

**5A — Importación de XML e-CF (no depende del proveedor)**
El XML e-CF tiene **formato estándar definido por la DGII**, igual para todos los proveedores.
Por eso esta parte se puede hacer ya:
- **Compras**: importar los XML e-CF que envían los suplidores → crea la factura de compra con
  RNC, e-NCF, montos e impuestos, valida duplicados (RNC + NCF) y queda lista para 606.
- **Ventas emitidas fuera** (en el portal del proveedor): importar sus XML → crea la factura de
  venta y el asiento, lista para 607.
- Lectura con una librería XML madura (p. ej. `fast-xml-parser`, MIT); validación de campos
  obligatorios contra la especificación técnica DGII guardada en `docs/normativa-dgii/`.

**5B — Conexión con el proveedor elegido (cuando exista su documentación)**
- Emitir desde este sistema: ventas E31/E32, notas E33/E34, regímenes especiales/gubernamental
  según aplique, y **compras E41 (proveedores informales) y E43 (gastos menores)**, que los
  emite el comprador.
- Bandeja de salida en Postgres (envíos con intentos y respuestas): si el proveedor está
  caído, no se pierde nada; reintento en segundo plano. Consulta de estado por sondeo
  (sin webhooks salvo que el proveedor solo funcione así).
- Reglas: e-CF aceptado no se anula (nota de crédito E34); rechazado se corrige y reenvía;
  credenciales cifradas.

**Alternativa evaluada: "solo importar lo emitido en el portal del proveedor"**
| | Solo importar (5A) | Emitir desde el sistema (5A + 5B) |
|---|---|---|
| Tiempo | ≈1,5 semanas, sin esperar a nadie | +2–3 semanas **después** de tener la documentación y acceso de pruebas del proveedor |
| Riesgo fiscal para nosotros | Bajo: la emisión es responsabilidad del portal del proveedor | Mayor: un error nuestro produce un comprobante fiscal |
| Experiencia del cliente | Doble trabajo: factura en el portal y luego importa (o lo hace automático si el proveedor permite descargar XML por API) | Factura una sola vez, todo integrado: **es lo que hace "premium" al producto** |
| Atadura a un proveedor | Ninguna (XML estándar) | Sí, con el proveedor elegido |
**Recomendación:** 5A dentro de la versión mínima vendible (funciona con cualquier proveedor y
ya aporta 606/607 automáticos); 5B como siguiente versión, con el proveedor elegido.

**Criterios para elegir proveedor e-CF** (preguntas que Carlos debe hacerles por escrito):
1. ¿Tienen **API** documentada y **ambiente de pruebas**? ¿Nos dan acceso antes de firmar?
2. **¿Ustedes arman el XML** a partir de un JSON nuestro, o debemos enviarles el XML armado?
3. **¿Quién numera** los e-NCF: ustedes administran las secuencias autorizadas o las llevamos
   nosotros?
4. **¿Credenciales por empresa o como integrador?** (¿una cuenta nuestra para todos los
   clientes, o cada cliente contrata y nos da sus credenciales?)
5. ¿Quién gestiona el **certificado digital** de cada empresa y su renovación?
6. ¿Permiten **descargar por API los XML** emitidos en su portal y los **recibidos de
   suplidores**? (sirve también para la alternativa de solo importar)
7. ¿Cómo manejan la **aprobación comercial** y los e-CF recibidos?
8. Precio por comprobante, mínimos, contrato, tiempo de respuesta de soporte, disponibilidad
   garantizada, dónde guardan los datos.
9. ¿Están autorizados por la DGII como proveedores de servicios de facturación electrónica?

| # | Agente | Tarea | Tam. |
|---|---|---|---|
| 5.1 | dev-backend | 5A: importación de XML e-CF de compras (suplidores) y de ventas emitidas fuera; duplicados; asiento. | L |
| 5.2 | dev-frontend | Pantalla de importación (arrastrar archivos, vista previa, errores, confirmar). | M |
| 5.3 | qa | XML reales de ejemplo (proveedor piloto) y XML malformados. | M |
| 5.4 | dev-backend | 5B (cuando haya documentación): conexión con el proveedor, emisión de E31/E32/E33/E34/E41/E43, bandeja de salida, estados. | L |
| 5.5 | dev-frontend | 5B: emitir, reintentar, ver rechazo, QR en impresión, configuración del proveedor. | M |
| 5.6 | seguridad | Cifrado de credenciales del proveedor; validación de archivos XML subidos (tamaño, entidades externas). | S |
| 5.7 | documentador | Guías de importación y de conexión con el proveedor. | S |

**Terminado cuando (5A):** XML reales de un mes se importan sin errores y sin duplicados.
**(5B):** el ambiente de pruebas del proveedor acepta todos los tipos emitidos y ninguna
factura E queda emitida sin pasar por el proveedor.

### Fase 6 — Reportes DGII 606 y 607 (≈2 semanas)
**Requisitos previos (bloqueantes):**
- **Respuesta escrita del contador** sobre cómo se reportan en 606/607 los comprobantes
  **electrónicos** (la DGII ya los recibe del proveedor) y los casos dudosos del mapeo.
- Aviso 06-26 citado y archivado: `docs/normativa-dgii/2026-10-08_Aviso-06-26_prorroga-FE.pdf`.
- Plantillas oficiales vigentes guardadas con su fecha (ver Fase 3).

**Entregable:** botón "Generar 606/607" por mes con vista previa, errores a corregir y descarga
del TXT para la Oficina Virtual. Opcional barato: 608 (anulados).

| # | Agente | Tarea | Tam. |
|---|---|---|---|
| 6.1 | dev-backend | Generadores 606 y 607 con validaciones (RNC/cédula con dígito verificador, NCF válido y no duplicado, NCF modificado en notas, fechas del período). | L |
| 6.2 | dev-backend | Pruebas con archivos de referencia validados en la plantilla Excel oficial. | M |
| 6.3 | dev-frontend | Pantalla de generación con vista previa y errores. | M |
| 6.4 | qa | Validar un mes de prueba con la herramienta de pre-validación DGII. | M |
| 6.5 | documentador | Guía "cómo enviar el 606/607 cada mes". | S |

**Terminado cuando:** los TXT de un mes pasan la validación oficial sin errores y el contador
los aprueba.

### Fase 7 — Endurecimiento para la venta (≈2 semanas)
- seguridad: revisión completa antes de exponer a internet; decisión de HTTPS.
- devops: monitoreo, procedimiento de actualización sin pérdida de datos, copia de seguridad
  fuera del servidor verificada.
- dev-backend/dev-frontend: asistente de alta de empresa (plan de cuentas base dominicano,
  ITBIS y retenciones precargados, NCF/e-CF); cierre de año si no se hizo en Fase 1.
- qa: rendimiento con volumen realista (p. ej. 100.000 asientos por empresa).
- documentador: manual completo y notas de versión.

### Trabajo adelantable — Presupuestos (≈2 semanas)
Se hace cuando el equipo esté esperando a terceros (proveedor e-CF, contador). Requiere la
Fase 1 (centros de costo) y, para la pantalla, la Fase 2 (sistema de diseño).
**Entregable:** presupuesto anual por cuenta y centro de costo, mes a mes; aprobación;
reporte presupuesto vs. real con diferencias en monto y %, alertas y gráfico.
- Reutiliza `Budget`/`BudgetLine`; agrega centro de costo opcional a la línea; unicidad
  (presupuesto, cuenta, centro de costo, mes) tratando "sin centro" como valor.
- Estados: borrador → aprobado (bloqueado) → archivado.
- Real = asientos contabilizados por cuenta/centro/mes con el signo de la naturaleza de la
  cuenta (reutiliza la lógica de reportes).
- Carga rápida: copiar del real del año anterior (± %), importar/exportar Excel.

| # | Agente | Tarea | Tam. |
|---|---|---|---|
| P.1 | dev-backend | Migración + servicio de presupuestos con estados y permisos. | M |
| P.2 | dev-backend | Reporte presupuesto vs. real (mes, acumulado, anual). | M |
| P.3 | dev-backend | Copiar del año anterior; Excel. | M |
| P.4 | dev-frontend | Captura tipo hoja de cálculo (cuentas × 12 meses), aprobación, reporte con gráfico. | L |
| P.5 | qa | Real del reporte = mayor al centavo; bloqueo al aprobar. | M |
| P.6 | documentador | Guía de presupuestos. | S |

---

## 3bis. Estimación y versión mínima vendible

Supuestos: el equipo de agentes trabajando de forma continua, Carlos revisando cada entregable
en 1–2 días. **No incluye** esperas de terceros (contador, proveedor e-CF, certificación del
proveedor), que pueden sumar semanas.

| Fase | Semanas |
|---|---|
| 0 Saneamiento + copias + GitHub | 1 |
| 1 Núcleo, RLS, multiempresa, seguridad | 3–4 |
| 2 Base visual y contabilidad | 3 |
| 3 Modelo fiscal | 1 |
| 4 Operación y reportes | 4 |
| 5A Importación XML e-CF | 1,5 |
| 6 606/607 | 2 |
| 7 Endurecimiento | 2 |
| **Versión mínima vendible** | **≈17–19 semanas (≈4–4,5 meses)** |
| 5B Emisión e-CF vía proveedor | +2–3 (después de tener su documentación) |
| Presupuestos (adelantable, puede solaparse) | +0–2 |
| **Todo lo pedido** | **≈20–24 semanas (≈5–6 meses)** |

**Versión mínima vendible (VMV)** — lo mínimo para cobrarle a una empresa real:
- Multiempresa con aislamiento garantizado por la base, roles, 2FA para administradores.
- Alta de empresa con plan de cuentas, impuestos y **saldos iniciales importados**.
- Contabilidad completa (asientos, períodos, reapertura controlada), facturas de compra y
  venta, cobros y pagos, CxC/CxP, bancos y conciliación, estados financieros con PDF/Excel.
- e-CF por **importación de XML** (ventas emitidas en el portal del proveedor + compras de
  suplidores), con emisión serie B bloqueada desde la fecha de cada empresa.
- **606 y 607** validados con la herramienta oficial y aprobados por el contador.
- Copias de seguridad probadas, revisión de seguridad aprobada, manual de usuario.

**Fuera de la VMV** (siguiente versión): emisión e-CF desde el sistema (5B), presupuestos,
608, cierre de año (necesario antes del primer cierre anual de un cliente).

---

## 4. Lo que Carlos (o su socio) deben decidir o conseguir

**(!) Frenan el avance:**
1. **Propiedad del código.** El código menciona "Sirtech" y "Yovanny". ¿Quién lo escribió, con
   qué acuerdo, y es Carlos (y su socio) dueño para venderlo? Sin esto por escrito, todo lo que
   se construya encima queda en riesgo legal. Incluye el acuerdo entre socios.
2. **¿Este módulo vive dentro del proyecto "plataforma" de Carlos (Next.js + Payload) o es un
   producto independiente?** Cambia la organización del repositorio, el inicio de sesión
   (¿compartido?) y quizá el stack de pantallas. (No se ha revisado ese proyecto; solo se deja
   la pregunta.)
3. **Contador asesor** que apruebe el mapeo 606/607 y responda **por escrito** cómo se
   reportan los e-CF en 606/607.
4. **Proveedor e-CF** (para 5B; para la VMV basta con que los clientes tengan uno): hacerle las
   9 preguntas de la Fase 5, conseguir documentación de API y acceso de pruebas.
5. **Cómo ver las pantallas sin publicarlas**: túnel SSH o VPN privada (se dará paso a paso).
6. **Permiso para mover el zip** con claves reales y cambiarlas.
7. **Dónde guardar las copias de seguridad fuera del servidor** (otro servidor o almacenamiento
   de Carlos).

**Otras decisiones:**
8. Nombre y marca del producto (logo, colores).
9. GitHub: cuenta u organización; usuario del socio; lectura o escritura; **aceptar GitHub Pro o
   Team (de pago)** para poder proteger la rama principal en un repo privado.
10. Modelo de venta: una instalación multiempresa para todos (recomendado) o una por cliente.
11. ¿Un usuario puede entrar a varias empresas? (Recomendado: sí.)
12. Empresa piloto con datos reales o de prueba, y XML e-CF reales de ejemplo.
13. Confirmar la versión mínima vendible y el orden.
14. Opcionales: cierre de año en Fase 1 o después; 608.
15. Presupuestos: ¿solo ingresos y gastos? ¿versiones? ¿quién aprueba?
16. Monedas: solo pesos o también dólares (ya soportado).

---

## 5. Riesgos y mitigación

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Propiedad del código no clara | No se puede vender legalmente | Decisión 1 antes de invertir más |
| Clientes ya facturan e-CF en otro lado antes de la VMV | Doble trabajo para ellos | Importación de XML estándar (5A), sin depender de proveedor |
| Proveedor e-CF tarda o no tiene API buena | 5B se retrasa | 5B fuera de la VMV; criterios de selección por escrito |
| Reglas fiscales mal interpretadas | Multas a clientes | Contador por escrito + validación con herramienta DGII + normativa archivada con fecha |
| Fuga de datos entre empresas | Gravísimo | RLS en la base + filtros en código + pruebas de aislamiento por tabla |
| Pérdida de datos | Gravísimo | Copias desde la Fase 0, restauración probada, copia fuera del servidor |
| Tocar la base de otro proyecto | Daño a otro servicio | Base propia sin publicar; base de pruebas separada |
| Errores de centavos | Estados que no cuadran | Decimales exactos de punta a punta (sin `Number()`) |
| Credenciales filtradas | Acceso no autorizado | Zip fuera, claves rotadas, escaneo de secretos, 2FA y rama protegida |
| Auditoría alterada | Sin trazabilidad ante DGII o cliente | Auditoría de solo agregar en la base |
| Cambios de formato DGII | Archivos rechazados | Plantillas oficiales archivadas con fecha; pruebas con archivos de referencia |

## 6. Impacto en diseño visual

Proyecto sin pantallas previas: la tarea 2.1 **establece** el sistema de diseño (un tema
Tailwind con colores de marca, tipografía autoalojada, componentes base). Toda pantalla usa solo
esos componentes; ningún estilo suelto. Sin marca decidida, se arranca con un tema neutro que se
cambia en un solo lugar.

---

## Fuentes normativas

- Aviso DGII 06-26 (06/05/2026), copia en `docs/normativa-dgii/2026-10-08_Aviso-06-26_prorroga-FE.pdf`.
  Origen: https://dgii.gov.do/publicacionesOficiales/avisosInformativos/Documents/2026/06-26.pdf
- Nota de prensa DGII de la prórroga: https://dgii.gov.do/noticias/Paginas/DGII-otorga-prorroga-seis-meses-Peque%C3%B1os-Micros-y-no-clasificados.aspx
- Formatos de envío de datos (606/607): https://www.dgii.gov.do/herramientas/formularios/formatoEnvioDatos/Paginas/default.aspx
- Instructivo 606: https://dgii.gov.do/publicacionesOficiales/bibliotecaVirtual/contribuyentes/formatoEnvioDatos/Documents/6-InstructivodellenadoyenvíoFormato606.pdf
- Instructivo 607: https://dgii.gov.do/publicacionesOficiales/bibliotecaVirtual/contribuyentes/formatoEnvioDatos/Documents/5-InstructivoLlenadoyenvioFomato607.pdf

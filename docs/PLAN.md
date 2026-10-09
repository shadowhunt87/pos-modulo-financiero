# Plan técnico — Finanzas dentro de la plataforma comercial multiempresa

Fecha: 2026-10-08 · Autor: Arquitecto · **Versión 3**
Estado: **PROPUESTA, pendiente de aprobación de Carlos.**
El veredicto de calidad de cada fase es de `qa`; la aprobación de negocio, de Carlos.

## Qué cambia respecto a la versión 2

La v2 trataba Finanzas como un producto suelto con sus propias pantallas (React + Vite) y su
propio inicio de sesión. Carlos confirmó otra estrategia:

- Software para **nichos**; **Finanzas es la base** de todos; el atractivo es la
  **personalización** sin copiar código por cliente.
- **Una sola instalación** para todas las empresas (multiempresa).
- Capas: (1) **Núcleo** = plataforma (sesión, empresas, permisos, diseño, suscripciones,
  copias) + Finanzas; (2) **módulos por nicho**; (3) **personalización por configuración**.
- **Opción A**: el backend NestJS **no** se reescribe; se une a `plataforma` como servicio
  aparte, y sus pantallas se construyen **dentro del Next.js de plataforma**.

Consecuencias en este plan:
| Tema | v2 | v3 |
|---|---|---|
| Pantallas | React + Vite servido por NestJS en 127.0.0.1:8040 | **Next.js de plataforma** (127.0.0.1:8032); NestJS **sin puerto publicado** |
| Inicio de sesión, 2FA, límite de intentos, cierre de sesión | En NestJS | En **plataforma** (Payload ya trae sesiones y bloqueo por intentos) |
| Usuarios y empresas | Tablas propias de NestJS | **Dueño: plataforma**. Finanzas guarda solo una referencia |
| Base de datos | Postgres 18 propio | **Mismo servidor Postgres de plataforma**, base de datos **separada** |
| RLS (aislamiento en la base) | Diseñado en Finanzas | Se mantiene igual en Finanzas; en plataforma, aislamiento por la aplicación (ver 2.5) |
| Personalización | No existía | Campos personalizados, marca, roles a medida, funciones por plan, plantilla de factura |
| Estimación VMV | 17–19 semanas | **21–24 semanas** (ver sección 6) |

Se **conservan** de la v2 (revisadas por el revisor-critico y siguen valiendo): copias de
seguridad en Fase 0; bloqueo de tipos E sin e-CF y de serie B desde la fecha de cada empresa;
duplicados RNC + NCF en la base; auditoría de solo agregar; reapertura de períodos con motivo;
RLS en Finanzas; montos decimales exactos; modelo fiscal antes de la pantalla de facturas;
e-CF por proveedor externo con importación de XML (5A) en la VMV y emisión (5B) después;
606/607 con contador y herramienta oficial; presupuestos como trabajo adelantable; GitHub
endurecido; eliminación del `postinstall` de Prisma y de dependencias sobrantes.

---

## 0. Resumen para Carlos (una página)

1. **Plataforma hoy es casi una plantilla vacía.** Funciona (responde en 127.0.0.1:8032), pero
   no tiene empresas, ni roles, ni migraciones, ni copias de seguridad, ni historial de
   cambios (git). Hay que construirle el "núcleo" antes de montar Finanzas encima.
2. **Quién manda en qué**: plataforma es la dueña de **personas, empresas, permisos, planes y
   marca**. Finanzas es la dueña de **todo lo contable**. Finanzas nunca guarda contraseñas.
3. **Cómo se hablan**: el navegador solo habla con plataforma. Plataforma, por dentro del
   servidor, le pasa a Finanzas un "pase" firmado que dura 60 segundos y dice quién es el
   usuario, en qué empresa está y qué puede hacer. Finanzas no es accesible desde fuera.
4. **Datos**: un solo servidor de base de datos (más fácil de respaldar), con **dos bases
   separadas** (una de plataforma, otra de negocio/finanzas) y usuarios de base de datos
   distintos, para que un error en una no pueda tocar la otra.
5. **Personalización**: se construye **solo lo que un cliente real va a usar en la primera
   versión** (campos personalizados, logo/colores, roles a medida, funciones según plan,
   plantilla de factura ajustable). Los flujos de aprobación y las conexiones para nichos se
   construyen **cuando exista el primer nicho**, diseñados contra él y no contra uno imaginario.
6. **Tiempo**: ≈ **21–24 semanas** para una versión vendible de "Finanzas premium" (sin
   nicho). El primer módulo de nicho se estima cuando Carlos lo defina; conviene decidirlo
   antes de la semana 8.

---

## 1. Estado real (verificado hoy, solo lectura)

### 1.1 Plataforma (`/home/claude/claude-docker/proyectos/Software/plataforma`)

| Tema | Estado real |
|---|---|
| Contenedores | `plataforma-app` (Node 24, **modo desarrollo** `next dev`, `npm install` en cada arranque) y `plataforma-db` (Postgres 16 + imagen pgvector). Arriba 3–4 semanas. Solo 127.0.0.1:8032. |
| Versiones | Next.js 16.3.4, Payload 3.88.0, React 19.2.6, Tailwind 4. Fijadas exactas. |
| Historial de cambios | **No hay repositorio git.** Ningún respaldo del código ni forma de deshacer cambios. |
| Esquema de base | `push: true` (Payload cambia la base solo al cambiar el código). **Sin migraciones.** Aceptable hoy porque no hay datos reales; **inaceptable** con datos de clientes. |
| Usuarios | Colección `users` de plantilla: email + contraseña, **sin roles, sin empresa**. 1 usuario. Ids numéricos (1, 2, 3...). Payload ya trae sesiones en servidor (`users_sessions`) y bloqueo por intentos fallidos (columnas `login_attempts`, `lock_until`). |
| Empresas / multiempresa | **No existe nada.** El roadmap del README lo lista como pendiente ("RLS multi-tenant"), sin empezar. |
| Archivos (`media`) | Lectura **pública** para cualquiera. Con varias empresas, el logo o adjunto de una sería visible para otra. |
| Sistema de diseño | Inicio: Tailwind 4 con colores base en `@theme` y 2 componentes (Button, Card) estilo shadcn/ui. Conviven restos de la plantilla que lo contradicen (fondo negro en `html`, color inválido `rgb(1000,1000,1000)`, `lang="en"`, título "Payload Blank Template"). |
| Error real | `src/app/(frontend)/page.tsx` pasa una función `onClick` desde un componente de servidor a `Button`: con sesión iniciada la página falla. Página de prueba, no de producto. |
| Usuario de base de datos | La app se conecta con el **superusuario** de Postgres. Si Finanzas comparte servidor, esto debe cambiar (ver 2.4). |
| Variables | `DATABASE_URI` en docker-compose y `DATABASE_URL` en `app/.env` (la que realmente se usa). Dos nombres para lo mismo. El `.env` raíz es de `root` con permisos 644 (legible por todos los usuarios del sistema). |
| IA / RAG | `RAG-LOCAL.md` describe cosas que **no existen** (`/api/chat`, Ollama dentro del contenedor). `config/rag-ollama-config.js` no lo usa nadie y trae una opción de API externa contraria a la regla de privacidad. La extensión pgvector **no** está activada en la base. Mismo patrón que la entrada falsa ya corregida en `PROGRESO.md`. |
| Imagen de producción | `app/Dockerfile` es un borrador razonable (multi-etapa, usuario sin privilegios); no se usa. |
| Propiedad de archivos | Varias carpetas de `app/` pertenecen a `root` (config, logs, .next, node_modules, package-lock). Los agentes no pueden modificarlas sin ajustar permisos. |

**Conclusión:** la base técnica es buena (versiones modernas, aislada, solo local), pero el
"núcleo de plataforma" que la estrategia supone **está por construir**. Es la primera inversión.

### 1.2 Finanzas (este repositorio) — diagnóstico de la v2, vigente

Backend contable **bien encaminado**: partida doble validada en programa y base, períodos que
bloquean, NCF sin huecos con concurrencia, auditoría en la misma transacción, filtro por empresa.

| Módulo | Estado |
|---|---|
| Acceso (login, roles) | Funciona, **pero se reemplaza** por la sesión de plataforma (2.3) |
| Contabilidad, Maestros, Facturación, Cobros/pagos, Tesorería, Reportes | Funcionan, con los problemas de 1.3 |
| Presupuestos | Tablas creadas; módulo vacío y no registrado en `app.module.ts` |
| 606/607, e-CF | No existen |
| Pantallas | No existen |
| Catálogo de productos/servicios | **No existe**: cada línea de factura lleva descripción y cuenta a mano. Necesario para la operación diaria y para que un nicho facture "conceptos" |

Pruebas técnicas de la v2 (sin cambios): `npm ci` falla por lockfile desincronizado;
dependencias exigen Node 22+ (se unifica en **Node 24**, el de plataforma); tipos y build OK;
**cobertura unitaria real: cero**; ~133 pruebas e2e sin correr; 7 advertencias de lint.

### 1.3 Problemas de Finanzas (de la v2) y qué pasa con cada uno

| # | Problema | En v3 |
|---|---|---|
| 1 | Facturas E31–E47 se "emiten" sin e-CF | Igual: bloquear (1B.6) |
| 2 | Plazo e-CF 15/11/2026 (Aviso 06-26) | Igual: los clientes ya tendrán proveedor; importación XML (5A) |
| 3 | Se anula cualquier factura emitida | Igual: e-CF aceptado se corrige con nota de crédito |
| 4 | `.env` apunta a `localhost:5432` (Postgres de otro proyecto) | **Se resuelve** al usar el Postgres de plataforma por red interna |
| 5 | `financial-backend-3.zip` con `.env` de claves reales | Igual: sacarlo y rotar claves (requiere permiso) |
| 6 | Asientos manuales por otro camino | Igual (1B.1) |
| 7 | Asientos sin período fiscal | Igual (1B.2) |
| 8 | Sin control de duplicados RNC+NCF en la base | Igual (1B.7) |
| 9 | Multiempresa incompleto | **Pasa a plataforma** (1A); Finanzas solo recibe la empresa activa |
| 10 | Aislamiento solo "por disciplina" | Igual: RLS (1B.4) |
| 11 | Montos con coma flotante (`Number(...)` en `invoicing.service.ts` ~222–232 y ~280–286) | Igual (1B.5) |
| 12 | Auditoría modificable | Igual (1B.8) |
| 13 | Reapertura de períodos sin control | Igual (1B.3) |
| 14 | Faltan servicios básicos (centros de costo, tasas, saldos iniciales, cierre de año...) | Igual, **sin** "usuarios" (es de plataforma); **más** catálogo de productos/servicios |
| 15 | Seguridad de acceso (intentos, cookie, 2FA, cierre de sesión) | **Pasa a plataforma** (1A) |
| 16 | Dependencias sobrantes (`bull`, `@nestjs/observe`, `@nestjs/mau`) | Igual (0.5); además sobran `bcrypt`, `passport-jwt` y el login propio |
| 17 | `docker-compose.yml` propio con claves fijas | **Se reemplaza**: Finanzas entra al compose de plataforma |
| 18 | `JWT_EXPIRES_IN` no se lee | **Desaparece** con el login propio |

### 1.4 Puertos

| Puerto | Uso |
|---|---|
| 127.0.0.1:8032 | **Única entrada**: plataforma (pantallas de todo, incluido Finanzas) |
| — | NestJS (Finanzas): **ningún puerto publicado**, solo red interna `plataforma_net` |
| — | Postgres: sin publicar (como hoy) |
| 127.0.0.1:5050 | pgAdmin solo bajo demanda (perfil `tools`), versión fija |
| 127.0.0.1:5432 | **Ocupado por otro proyecto. No se usa.** |
| 127.0.0.1:8040 | Ya no hace falta (era de la v2) |

### 1.5 `postinstall: prisma skills sync` (de la v2, vigente)
Hoy no hace nada (comando inválido oculto con `|| exit 0`), pero el CLI de Prisma puede ofrecer
descargar paquetes y escribir instrucciones para asistentes de IA, y envía telemetría. Se
elimina el `postinstall`, se fija `CHECKPOINT_DISABLE=1` y se instala con
`npm ci --ignore-scripts` + `prisma generate` explícito.

---

## 2. Arquitectura de integración

### 2.1 Quién es dueño de qué

| Dato / función | Dueño | Por qué |
|---|---|---|
| Personas (email, contraseña, 2FA, sesiones) | **Plataforma** (Payload) | Un solo inicio de sesión para todos los módulos. Payload ya trae sesiones y bloqueo por intentos. |
| Empresas (tenants), estado, plan | **Plataforma** | Es el "contrato" con el cliente; existe aunque no use Finanzas. |
| Pertenencia persona ↔ empresa y roles | **Plataforma** | Un usuario puede estar en varias empresas con roles distintos. |
| Catálogo de permisos | Lo **declara cada módulo** (Finanzas declara `fin.factura.emitir`, etc.); plataforma lo usa para armar roles | Cada módulo sabe qué acciones tiene. |
| Planes y funciones activas por empresa | **Plataforma** | Es comercial, no contable. |
| Marca (logo, colores) | **Plataforma** | Afecta a todas las pantallas. |
| Contabilidad, facturas, impuestos, bancos, reportes | **Finanzas** (NestJS) | Ya está construido ahí y necesita las garantías de la base (RLS, transacciones). |
| Campos personalizados de documentos contables | **Finanzas** | Se validan y guardan en la misma operación que la factura, bajo RLS. |
| Plantillas de factura | **Finanzas** | El PDF se genera junto a los datos fiscales que no se pueden omitir. |

**Definición de "empresa" (recomendada):** 1 empresa en plataforma = 1 empresa legal con su
RNC = 1 compañía en Finanzas, **con el mismo identificador**. Un grupo de empresas se maneja
dando al mismo usuario acceso a varias empresas. Sencillo y suficiente; los reportes
consolidados de grupo quedan fuera (pregunta 2).

### 2.2 Esquema general

```
Navegador ── cookie de sesión ──> 127.0.0.1:8032  plataforma-app (Next.js + Payload)
                                     │  pantallas del cliente  (/app/...)
                                     │  panel interno de Carlos (/admin, Payload)
                                     │  puente a Finanzas      (/api/fin/...)
                                     │
                                     │  "pase" firmado de 60 s (red interna Docker)
                                     ▼
                                  finanzas-api (NestJS, sin puerto publicado)
                                     │
                    plataforma-db (Postgres 16, un servidor, sin publicar)
                      ├── base "plataforma"  ← usuario de BD de Payload
                      └── base "negocio"     ← usuarios de BD de Finanzas (dueño / app sin RLS bypass)
```

### 2.3 Cómo NestJS confía en la sesión de plataforma

**Recomendación: patrón "plataforma intermediaria" con pase firmado.**
1. El navegador **solo** habla con plataforma. La sesión es la cookie de Payload, configurada
   `httpOnly`, `SameSite=Strict`, `Secure` cuando haya HTTPS.
2. Cuando una pantalla necesita datos contables, el servidor de Next.js (nunca el navegador):
   - valida la sesión con Payload;
   - comprueba que el usuario **pertenece** a la empresa activa (la empresa elegida va en una
     cookie, pero se re-verifica en cada petición; la cookie sola nunca da acceso);
   - calcula permisos efectivos y funciones del plan;
   - firma un **pase** (JWT con firma Ed25519, librería `jose`, MIT, sin dependencias) con:
     emisor `plataforma`, destinatario `finanzas`, usuario, empresa, permisos, funciones del
     plan, IP y navegador del usuario, identificador único y **vencimiento de 60 segundos**;
   - llama a NestJS por la red interna con ese pase.
3. NestJS solo tiene la **clave pública**: puede verificar pases, **no fabricarlos**. Un fallo
   en Finanzas no permite suplantar a nadie.
4. Dos caminos, una sola función de firma:
   - **Desde el servidor** (componentes de servidor y acciones de Next.js): la mayoría de pantallas.
   - **Puente `/api/fin/*`** para componentes interactivos (p. ej. buscar cuentas mientras se
     escribe un asiento): valida sesión, verifica origen de la petición (protección CSRF),
     limita tamaño, firma el pase y reenvía. Nunca reenvía rutas `/internal/*`.
5. Rutas internas de Finanzas (`/internal/...`: alta de empresa) exigen un permiso que solo el
   código de administración de plataforma pone en el pase.

**En Finanzas desaparece**: login, registro, contraseñas, `bcrypt`, `passport-jwt`, el secreto
JWT compartido y el `RolesGuard` por rol fijo. **Aparece**: un guardia que verifica el pase,
uno de **permisos** (`@RequierePermiso('fin.factura.emitir')`) y uno de **funciones del plan**
(`@RequiereFuncion('fin.presupuestos')`).

**Usuarios en Finanzas**: la tabla `User` pasa a ser una **referencia** (id de plataforma +
nombre y email de cortesía, sin contraseña, sin rol, sin empresa), creada automáticamente la
primera vez que esa persona hace algo. Así se conservan "creado por / aprobado por / anulado
por" en asientos, facturas y auditoría sin duplicar la gestión de usuarios.

**Ids**: plataforma pasa a ids **UUID** (Payload lo permite con `idType: 'uuid'`). Hoy hay 1
usuario de prueba: cambiarlo ahora cuesta horas; después, con datos, costaría una migración
delicada. Finanzas ya usa UUID.

**Alternativas descartadas**
| Opción | Por qué no |
|---|---|
| NestJS lee directamente la cookie de Payload con el mismo secreto | Finanzas tendría el secreto que **fabrica** sesiones; se ata a detalles internos de Payload; Finanzas tendría que consultar pertenencias y permisos por su cuenta. |
| El navegador llama a NestJS directo (dos orígenes) | Exige publicar NestJS, CORS, segunda cookie o token en el navegador. Más superficie de ataque. |
| Proveedor de identidad aparte (Keycloak, Authentik) | Otro servicio grande que operar y actualizar, para un problema que Payload ya resuelve. Se reconsidera solo si un cliente exige inicio de sesión corporativo (SSO). |

### 2.4 Base de datos: compartida o separada

**Recomendación: mismo servidor Postgres (`plataforma-db`), dos bases de datos separadas.**
- Base `plataforma`: la usa Payload.
- Base `negocio`: la usa Finanzas (y luego los módulos de nicho, cada uno en su propio
  *schema*: `finanzas`, `nicho_x`...). Prisma maneja varios schemas.
- **Usuarios de base de datos distintos**: Payload deja de usar el superusuario; Finanzas usa
  `negocio_owner` (solo para migraciones) y `negocio_app` (la aplicación: **sin** permiso para
  saltarse RLS, no dueño de las tablas). Payload no puede entrar a `negocio` ni Finanzas a
  `plataforma`.
- Postgres 16 soporta todo lo necesario (RLS existe desde la 9.5). La v2 proponía Postgres 18;
  se descarta para no operar dos servidores. Subir de versión será una tarea única de devops.

Por qué así:
- **Un servidor** = una sola copia de seguridad programada, un solo monitoreo, un solo lugar.
- **Dos bases** = el `push` automático de Payload (mientras exista) y sus migraciones nunca
  pueden tocar tablas contables; un error de una aplicación no lee datos de la otra.
- Lo que se pierde: no hay "llave foránea" entre empresa de plataforma y compañía de Finanzas.
  Se compensa con el **mismo UUID** y un alta explícita e idempotente (2.6).

| Alternativa | Por qué no |
|---|---|
| Una sola base, mismas tablas compartidas | Payload podría alterar tablas contables; mezcla dueños; RLS más difícil. |
| Una sola base, schemas distintos | Mejor que lo anterior, pero el usuario de Payload tendría que estar muy bien recortado y `push` opera por base. Ganancia (llaves foráneas cruzadas) no compensa. |
| Dos servidores Postgres | Doble operación y doble copia, sin ganancia real de seguridad frente a dos bases con usuarios separados. |

### 2.5 Aislamiento entre empresas (RLS) coherente en ambos lados

**Finanzas (base `negocio`) — garantía en la base de datos (decisión de la v2, se mantiene):**
- Todas las tablas con datos de empresa llevan `companyId` (se agrega a las tablas hijas que
  no lo tienen) y una regla RLS: "solo filas de la empresa activa".
- En cada petición, dentro de la transacción: `set_config('app.empresa_id', <empresa del pase>, true)`.
  La empresa sale **del pase firmado**, nunca de lo que mande el navegador.
- Implementación con una extensión del cliente Prisma (patrón documentado por Prisma para RLS).
- SQL directo (`$queryRaw`) queda cubierto porque la regla está en la base.
- Se mantienen además los filtros por empresa en el código (doble protección).

**Plataforma (base `plataforma`) — garantía por la aplicación, de forma explícita:**
- Plugin **oficial** `@payloadcms/plugin-multi-tenant` (MIT, misma versión 3.88.0): agrega la
  empresa a cada colección marcada y filtra por ella en el control de acceso de Payload.
- RLS dentro de Payload **no se recomienda**: Payload/Drizzle usa conexiones compartidas sin un
  punto limpio para fijar la empresa por petición; habría que pelear con el framework.
- Regla de arquitectura para que esto sea aceptable: **en plataforma solo vive información de
  configuración** (empresas, pertenencias, planes, marca, textos). **Ningún dato de negocio
  sensible** (clientes del cliente, montos, pacientes, etc.) se guarda en colecciones de Payload:
  va a la base `negocio`, con RLS.
- Pruebas automáticas de acceso por colección (empresa A no ve nada de B) en cada cambio.

Esto se le dice claro a Carlos: **el aislamiento "a prueba de errores del programador" está
donde están los datos que importan (contabilidad y nichos); en plataforma depende de reglas de
la aplicación bien probadas.**

### 2.6 Comunicación y alta de empresas

- **Pantallas → Finanzas**: HTTP JSON por red interna con pase firmado (2.3). Montos siempre
  como texto decimal. Tipos de la API generados desde la documentación OpenAPI de NestJS
  hacia plataforma (las entradas desde la Fase 0; las respuestas módulo por módulo, como en
  la v2).
- **Alta de empresa en Finanzas**: cuando en plataforma se activa Finanzas para una empresa,
  plataforma llama a `PUT /internal/empresas/{id}` (crear o actualizar, se puede repetir sin
  duplicar). Si falla, la empresa queda "Finanzas: pendiente" con botón de reintentar en el
  panel interno. Sin colas ni servicios extra.
- **Cambios de datos de la empresa** (nombre, RNC): mismo llamado, desde un *hook* de Payload.
- **Bajas**: una empresa suspendida en plataforma no obtiene pases; sus datos contables no se
  borran (obligación de conservación).

### 2.7 Repositorios y despliegue

- **Dos repositorios por ahora** (respeta la regla de carpetas separadas):
  `financial-backend` (GitHub `modulo-financiero`) y `plataforma` (a crear, privado).
- Finanzas produce una **imagen Docker** con versión (`finanzas-api:<versión>`); el
  `docker-compose.yml` de plataforma la usa como un servicio más, sin puerto publicado.
  Plataforma no lee archivos de la carpeta de Finanzas.
- Cuando llegue el primer nicho se reevalúa unir ambos en un solo repositorio (hoy no aporta).
- Node 24 LTS en ambos.

---

## 3. Personalización y puntos de extensión

Regla rectora: **configuración con límites claros**, nunca un "constructor de aplicaciones".
Cada punto de extensión tiene un tope explícito. Ver aviso de deuda en 7.

### 3.1 Funciones por plan (feature flags) — VMV
- Plataforma: colección `planes` (funciones incluidas y límites: usuarios, empresas,
  documentos al mes) y, por empresa, plan + excepciones puntuales.
- Las funciones activas viajan en el pase; NestJS las exige con `@RequiereFuncion(...)`;
  las pantallas ocultan menús. Los límites se aplican donde vive el recurso.
- Nombres de función con prefijo de módulo: `fin.presupuestos`, `fin.ecf.emision`,
  `fin.multimoneda`, `nicho_x....`.
- Descartado: Unleash / GrowthBook (servicio extra pensado para experimentos, no para planes).

### 3.2 Roles a medida — VMV
- Cada módulo declara su catálogo de permisos (lista fija en código).
- Plataforma trae roles base (Administrador, Contador, Aprobador, Solo lectura) y permite a
  cada empresa crear **roles propios** marcando permisos del catálogo.
- 2FA obligatorio para administradores de empresa y de plataforma.

### 3.3 Marca y colores — VMV
- Por empresa: logo, color principal y de acento, nombre comercial.
- Se aplican cambiando las **variables de color del tema Tailwind** en tiempo de ejecución; el
  resto del sistema de diseño no cambia. Colores validados por contraste (legibilidad).
- Archivos de marca en `media` **con dueño por empresa y sin lectura pública**.

### 3.4 Campos personalizados — VMV
- En Finanzas: definiciones por empresa (documento: factura, tercero, línea de factura,
  asiento; nombre; tipo: texto, número, fecha, sí/no, lista; obligatorio; mostrar en
  impresión / en reportes).
- Valores en una columna JSONB en cada documento, **validados contra la definición** en la
  misma transacción. Índice para filtrar en reportes.
- Tope: 25 campos por tipo de documento. Sin fórmulas ni campos calculados en la primera versión.
- Las pantallas dibujan esos campos automáticamente a partir de la definición.
- Descartado: tablas genéricas "atributo-valor" (lentas y complejas de consultar).

### 3.5 Plantilla de factura y reportes — VMV (versión acotada)
- **Primera versión**: 2–3 diseños base; por empresa se elige diseño, logo, colores, textos
  de encabezado/pie, columnas visibles y campos personalizados a mostrar.
- Los elementos **fiscales obligatorios** (RNC, NCF/e-NCF, ITBIS, QR y código de seguridad
  e-CF) **no se pueden quitar**.
- Cada factura guarda la versión de plantilla con que se emitió (reimpresión idéntica).
- PDF generado en el servidor de Finanzas **sin navegador** (librería a confirmar con prueba
  corta; candidata `@react-pdf/renderer`, MIT). Descartado Chromium dentro del contenedor
  (≈300 MB extra y más superficie).
- **Después de la VMV**, si los clientes lo piden: edición libre con un motor de plantillas
  seguro (p. ej. `liquidjs`, MIT, sin ejecución de código).
- Reportes: columnas y filtros guardables por usuario/empresa ("vistas guardadas"); no un
  diseñador de reportes.

### 3.6 Flujos de aprobación — después de la VMV (salvo que Carlos lo pida antes)
- Diseño previsto, simple: reglas por empresa del tipo "factura de compra mayor a X requiere
  aprobación de un rol Y". Estados: borrador → pendiente de aprobación → aprobada → emitida.
- Ya existe base: rol Aprobador y "aprobado por" en asientos.
- Descartado: motores de flujo (Camunda, Temporal): enormes para esta necesidad.

### 3.7 Conexión de módulos de nicho con Finanzas — con el primer nicho
**Dónde viven los nichos (recomendación):** como **módulos dentro del mismo servicio NestJS**
(el servicio pasa a ser "backend de negocio"), cada uno con su schema en la base `negocio` y
las mismas reglas RLS. Ventaja decisiva: un nicho puede crear "la cita cobrada **y** su
factura" en **la misma transacción**: o se guarda todo o nada.

Descartado: nichos como colecciones de Payload (rápido de construir, pero sus datos quedarían
sin RLS y sin transacción común con Finanzas); un servicio por nicho (más piezas que operar).

**Lo que Finanzas ofrecerá a los nichos:**
1. **Interfaz pública interna** (una "puerta" documentada; los nichos no tocan tablas
   contables): crear tercero, crear/emitir factura, registrar cobro, contabilizar asiento
   según reglas, consultar saldo de cliente.
2. **Origen e idempotencia**: cada documento guarda `módulo de origen` + `referencia de
   origen`, con índice único: si un nicho reintenta, no se factura dos veces. (Los campos se
   agregan ya en la Fase 4 para no migrar facturas dos veces; la puerta se construye con el nicho.)
3. **Catálogo de conceptos** (productos/servicios con precio, impuesto y cuenta contable): el
   nicho factura "Consulta general", no cuentas contables. Se construye en la Fase 1B porque
   lo necesita la operación diaria de todos modos.
4. **Avisos de eventos**: tabla de eventos en la base, escrita en la misma transacción
   (`factura.emitida`, `factura.anulada`, `cobro.registrado`, `periodo.cerrado`); los nichos
   la leen periódicamente. Sin Redis ni colas externas.
5. La misma puerta expuesta por HTTP solo si algún día un módulo externo la necesita.

---

## 4. Pantallas: Next.js dentro de plataforma

**Decisión (de Carlos, opción A)**: las pantallas de Finanzas se construyen en el Next.js de
plataforma, en un grupo de rutas propio de la aplicación del cliente (`/app/...`), separado
del panel interno `/admin` de Payload, que queda **solo para el equipo de Carlos**.

Librerías (maduras, MIT, sin CDN, se instalan con aprobación): componentes shadcn/ui copiados
al repo (ya iniciado), React Hook Form + Zod (formularios), TanStack Table (tablas grandes),
TanStack Query (solo para componentes muy interactivos; el resto, componentes de servidor),
Recharts (gráficos), decimal.js (montos exactos en pantalla), `jose` (pase firmado),
Playwright (pruebas de pantallas). Tipografía autoalojada.

Queda descartado lo de la v2: React + Vite servido por NestJS (ahora duplicaría sesión,
diseño y despliegue).

---

## 5. Plan por fases

Tamaños: **S** = horas · **M** ≈ 1 día · **L** = varios días. Cada fase termina con el
veredicto de `qa` y la aprobación de Carlos.

### Fase 0 — Saneamiento de ambos proyectos, git y copias de seguridad (≈1,5 semanas)
**Entregable:** los dos proyectos con historial en GitHub privado; Finanzas corriendo como
servicio dentro de plataforma con su base `negocio`; primera copia de seguridad **restaurada
con éxito**; informe "pruebas e2e X de X en verde".

| # | Agente | Tarea | Tam. |
|---|---|---|---|
| 0.1 | devops | Plataforma: crear repositorio git (previo permiso), `.gitignore` revisado, escaneo de secretos antes del primer commit. Ajustar dueños de archivos de `root` a `claude` y `.env` a permisos 600 (previo permiso). | S |
| 0.2 | devops | Finanzas: mover el zip fuera del proyecto (previo permiso); escaneo de secretos del historial; rotar claves de la v2. | S |
| 0.3 | dev-backend | Finanzas: lockfile regenerado, Node 24, quitar `bull`, `@nestjs/bull`, `@nestjs/observe`, `@nestjs/mau` y el `postinstall`; `CHECKPOINT_DISABLE=1`; imagen Docker de producción. | M |
| 0.4 | devops | Postgres de plataforma: crear base `negocio`, usuarios `negocio_owner` / `negocio_app` (sin bypass de RLS) y usuario propio de Payload (deja de usar el superusuario). Unificar `DATABASE_URL`. | M |
| 0.5 | devops | Compose de plataforma: servicio `finanzas-api` (imagen versionada, sin puertos, red interna), pgAdmin bajo demanda con versión fija. **Sin reiniciar nada sin autorización.** | M |
| 0.6 | devops | **Copias de seguridad** de ambas bases a la vez: diarias, cifradas, fuera del volumen Docker, 14 diarias + 8 semanales, **prueba de restauración documentada**; destino externo según decisión de Carlos. | M |
| 0.7 | devops | Base de pruebas separada para Finanzas. | S |
| 0.8 | dev-backend | Finanzas: prefijo `/api/v1`, OpenAPI de entradas en `/api/docs` (solo red interna). | S |
| 0.9 | qa | Correr las ~133 e2e contra la base de pruebas (aún con el login viejo); reportar fallas. | M |
| 0.10 | devops | GitHub: repos privados, 2FA obligatorio, rama `main` protegida, gitleaks local antes de cada push. | S |
| 0.11 | documentador | README real de ambos; marcar `RAG-LOCAL.md` y `config/rag-ollama-config.js` como "no implementado" o retirarlos (previo permiso). | S |

**Terminado cuando:** e2e corridas e informadas; nada escucha fuera de 127.0.0.1; restauración
probada; `seguridad` firma que no hay secretos en git.

### Fase 1A — Núcleo de plataforma (≈3 semanas)
**Entregable:** Carlos crea una empresa en el panel interno, invita a un usuario con un rol,
ese usuario entra (con 2FA si es administrador), elige empresa y ve una pantalla de prueba que
trae datos **reales de Finanzas** a través del pase firmado.

| # | Agente | Tarea | Tam. |
|---|---|---|---|
| 1A.1 | dev-backend | Payload: ids UUID; pasar de `push` a **migraciones** (línea base); imagen de producción con el `Dockerfile` existente. | M |
| 1A.2 | dev-backend | Colecciones: empresas, pertenencias con roles (vía plugin multi-tenant oficial), roles y catálogo de permisos, planes y funciones, administrador de plataforma. `media` por empresa y sin lectura pública. | L |
| 1A.3 | dev-backend | Sesión endurecida: cookie Strict/Secure, bloqueo por intentos (ya existe en Payload, configurarlo), cierre de sesión real, 2FA TOTP para administradores (librería mantenida, p. ej. `otpauth`, MIT). | M |
| 1A.4 | dev-backend | **Puente**: firma del pase (Ed25519, `jose`), cliente de servidor hacia Finanzas, ruta `/api/fin/*` con control de origen y tamaño; claves en variables de entorno. | M |
| 1A.5 | dev-backend | Alta/actualización idempotente de empresa en Finanzas desde un *hook*, con estado "pendiente" y reintento. | S |
| 1A.6 | dev-frontend | **Sistema de diseño**: limpiar restos de la plantilla, tokens de color/tipografía/espaciado, tipografía autoalojada, componentes base (campo, selector, tabla, diálogo, aviso, pestañas, menú, fecha, buscador), formatos es-DO, `lang="es"`. | L |
| 1A.7 | dev-frontend | Login del cliente, selector de empresa, menú según permisos y funciones, páginas de error; marca por empresa vía variables de color. Eliminar la página de prueba con el error de `onClick`. | M |
| 1A.8 | qa | Pruebas de acceso por colección (empresa A no ve nada de B, ni archivos); pase vencido/alterado/de otra audiencia rechazado. | M |
| 1A.9 | seguridad | Revisión de sesión, pase, puente y permisos. | M |

### Fase 1B — Núcleo financiero (≈3 semanas; ≈1,5 en paralelo con 1A)
**Entregable:** informe de qa con cada corrección probada; Finanzas solo acepta pases válidos y
la base rechaza accesos entre empresas aunque se salte el programa.

| # | Agente | Tarea | Tam. |
|---|---|---|---|
| 1B.0 | dev-backend | **Reemplazar el login propio** por: guardia de pase, guardia de permisos, guardia de funciones; `User` → referencia sin contraseña; `Company.id` = id de empresa de plataforma; endpoint `/internal/empresas`; utilidad de pruebas que fabrica pases con clave de prueba y adaptación de las e2e. | L |
| 1B.1 | dev-backend | Asientos manuales por el motor único; anulación con quién/cuándo/por qué. | M |
| 1B.2 | dev-backend | Período fiscal abierto obligatorio. | S |
| 1B.3 | dev-backend | Reapertura de períodos: permiso específico, motivo obligatorio, registro, prohibida con año cerrado, aviso si ya hubo 606/607. | S |
| 1B.4 | dev-backend | **RLS** (2.5) + validación de pertenencia de centros de costo y terceros en asientos y facturas. | L |
| 1B.5 | dev-backend | Montos decimales de punta a punta; eliminar los `Number(...)` de `invoicing.service.ts`. | M |
| 1B.6 | dev-backend | Bloquear tipos E sin e-CF configurado; bloquear serie B desde fecha configurable por empresa; advertencia en compras B posteriores. | S |
| 1B.7 | dev-backend | Duplicados RNC emisor + NCF con índice único parcial (excluye anuladas). | S |
| 1B.8 | dev-backend | Auditoría de solo agregar (sin permiso de modificar/borrar + disparador); IP y navegador desde el pase. | S |
| 1B.9 | dev-backend | Servicios faltantes: centros de costo, tasas de cambio, datos contables de empresa, **catálogo de conceptos**, importación de plan de cuentas y **saldos iniciales**. | M |
| 1B.10 | dev-backend | Cierre de año fiscal (si Carlos lo aprueba aquí; si no, Fase 8). | M |
| 1B.11 | qa | Pruebas unitarias de reglas contables; **prueba de aislamiento** tabla por tabla, también por SQL directo. | L |
| 1B.12 | seguridad | Revisión de RLS, usuarios de base de datos y guardias. | M |
| 1B.13 | documentador | Reglas contables del sistema en lenguaje de contador. | S |

### Fase 2 — Personalización base (≈2 semanas)
**Entregable:** el administrador de una empresa cambia su logo y colores, crea un rol propio,
define campos personalizados para facturas y terceros; Carlos asigna planes y ve cómo se
encienden y apagan funciones.

| # | Agente | Tarea | Tam. |
|---|---|---|---|
| 2.1 | dev-backend | Campos personalizados en Finanzas (3.4): definiciones, JSONB, validación, índice. | M |
| 2.2 | dev-frontend | Componente que dibuja campos personalizados en formularios y tablas. | M |
| 2.3 | dev-frontend | Pantallas de administración de empresa: marca, usuarios e invitaciones, roles a medida. | L |
| 2.4 | dev-backend | Planes: aplicación de funciones y límites en ambos lados. | M |
| 2.5 | qa | Un campo personalizado de A no aparece en B; un plan sin función bloquea pantalla **y** API. | M |
| 2.6 | documentador | Guía "cómo personalizar tu empresa". | S |

### Fase 3 — Pantallas de contabilidad y configuración (≈2,5 semanas)
**Entregable:** una empresa nueva se configura de cero solo con pantallas: tablero, plan de
cuentas, asientos, períodos, terceros, impuestos, NCF, conceptos, importación de saldos.

| # | Agente | Tarea | Tam. |
|---|---|---|---|
| 3.1 | dev-frontend | Tablero (bancos, CxC/CxP, ventas del mes, alertas de NCF). | M |
| 3.2 | dev-frontend | Plan de cuentas en árbol, períodos (cierre/reapertura con motivo), asientos (N líneas que cuadran en vivo), balance de comprobación. | L |
| 3.3 | dev-frontend | Maestros, conceptos, datos contables de empresa, importación de plan de cuentas y saldos iniciales. | L |
| 3.4 | dev-backend | Contratos de respuesta de los módulos que consume esta fase. | M |
| 3.5 | qa | Playwright de flujos principales; revisión visual laptop/tablet. | M |
| 3.6 | documentador | Guía de configuración inicial. | S |

### Fase 4 — Modelo fiscal y trazabilidad de origen (≈1 semana)
Antes de la pantalla de facturas, para construirla una sola vez.
**Requisito previo:** plantillas e instructivos oficiales 606/607 vigentes en
`docs/normativa-dgii/` con fecha (se bajan desde un navegador; la DGII bloquea la descarga automática).

| # | Agente | Tarea | Tam. |
|---|---|---|---|
| 4.1 | dev-backend | Mapeo campo por campo 606 (plantilla modificada 28/10/2025) y 607 (31/05/2023). Enviar al contador. | S |
| 4.2 | dev-backend | Migración con campos fiscales faltantes (606: servicios/bienes, ITBIS retenido / proporcionalidad / al costo / percibido, retención e ISR, ISC, otros impuestos, propina legal, fecha y forma de pago; 607: fecha de retención, retenciones de terceros, percibidos, forma de cobro). | M |
| 4.3 | dev-backend | Estado e-CF en la factura (no aplica, pendiente, enviado, aceptado, aceptado condicional, rechazado, error; código de seguridad, fecha de firma, QR, referencia externa, último error) y origen (creado aquí / importado de XML). | S |
| 4.4 | dev-backend | **Origen e idempotencia** (3.7.2): módulo y referencia de origen con índice único; versión de plantilla usada. | S |
| 4.5 | qa | La migración no altera facturas existentes. | S |

**Terminado cuando:** el contador aprueba el mapeo por escrito y la migración pasa las pruebas.

### Fase 5 — Operación, reportes y plantilla de factura (≈4,5 semanas)
**Entregable:** facturar, cobrar, pagar, conciliar y ver estados financieros desde pantalla,
con PDF de factura en la plantilla de la empresa, y Excel.

| # | Agente | Tarea | Tam. |
|---|---|---|---|
| 5.1 | dev-frontend | Facturas de venta y compra, notas, totales en vivo, campos fiscales, estado e-CF, campos personalizados. | L |
| 5.2 | dev-frontend | Cobros y pagos, notas aplicadas, estado de cuenta, antigüedad. | L |
| 5.3 | dev-frontend | Tesorería: extracto CSV con vista previa, reglas, conciliación. | L |
| 5.4 | dev-frontend | Reportes con navegación al asiento de origen y vistas guardadas. | L |
| 5.5 | dev-backend | PDF en servidor con plantillas configurables (3.5) y Excel; adjuntos en disco del servidor; contratos de respuesta pendientes. | L |
| 5.6 | dev-frontend | Pantalla de configuración de plantilla con vista previa. | M |
| 5.7 | qa | Un mes contable completo verificado contra el cálculo manual del contador. | M |
| 5.8 | documentador | Manual de operación diaria. | M |

### Fase 6 — e-CF con proveedor externo
**6A — Importación de XML e-CF (≈1,5 semanas, en la VMV)**. El XML e-CF tiene formato
estándar DGII, igual para todos los proveedores: compras de suplidores y ventas emitidas en el
portal del proveedor se importan, se validan duplicados RNC+NCF, se contabilizan y quedan
listas para 606/607. Lectura con `fast-xml-parser` (MIT), con protección contra entidades
externas y límite de tamaño.

**6B — Emisión desde el sistema (+2–3 semanas, después de tener documentación y ambiente de
pruebas del proveedor elegido)**: E31/E32/E33/E34, regímenes especiales/gubernamental según
aplique, compras E41/E43; bandeja de salida en Postgres con reintentos; consulta de estado por
sondeo; e-CF aceptado no se anula (nota E34); credenciales cifradas.

| | Solo importar (6A) | Emitir desde el sistema (6A + 6B) |
|---|---|---|
| Tiempo | ≈1,5 semanas, sin esperar a nadie | +2–3 semanas después de la documentación del proveedor |
| Riesgo fiscal propio | Bajo | Mayor: un error nuestro produce un comprobante |
| Experiencia del cliente | Factura en el portal y luego importa | Factura una sola vez: **lo "premium"** |
| Atadura a proveedor | Ninguna | Sí |

**Preguntas por escrito al proveedor e-CF** (de la v2, vigentes): 1) ¿API documentada y
ambiente de pruebas antes de firmar? 2) ¿Ustedes arman el XML desde un JSON nuestro? 3) ¿Quién
numera los e-NCF? 4) ¿Credenciales por empresa o como integrador? 5) ¿Quién gestiona y renueva
el certificado digital? 6) ¿Descarga por API de XML emitidos y recibidos? 7) ¿Aprobación
comercial y e-CF recibidos? 8) Precio, mínimos, contrato, soporte, disponibilidad, dónde
guardan los datos. 9) ¿Autorizados por la DGII?

| # | Agente | Tarea | Tam. |
|---|---|---|---|
| 6.1 | dev-backend | 6A: importación de XML de compras y de ventas emitidas fuera. | L |
| 6.2 | dev-frontend | Pantalla de importación (arrastrar, vista previa, errores, confirmar). | M |
| 6.3 | qa | XML reales de ejemplo y XML malformados. | M |
| 6.4 | seguridad | Validación de archivos subidos; cifrado de credenciales (6B). | S |
| 6.5 | dev-backend + dev-frontend | 6B cuando haya documentación. | L |
| 6.6 | documentador | Guías de importación y conexión. | S |

### Fase 7 — Reportes DGII 606 y 607 (≈2 semanas)
**Bloqueantes:** respuesta escrita del contador sobre cómo se reportan los e-CF en 606/607 y
casos dudosos; plantillas oficiales archivadas con fecha.
**Entregable:** "Generar 606/607" por mes con vista previa, errores y TXT para la Oficina
Virtual. Opcional barato: 608.

| # | Agente | Tarea | Tam. |
|---|---|---|---|
| 7.1 | dev-backend | Generadores con validaciones (RNC/cédula con dígito verificador, NCF válido y no duplicado, NCF modificado en notas, fechas). | L |
| 7.2 | dev-backend | Pruebas con archivos de referencia validados en la plantilla oficial. | M |
| 7.3 | dev-frontend | Pantalla de generación. | M |
| 7.4 | qa | Un mes de prueba validado con la herramienta de pre-validación DGII. | M |
| 7.5 | documentador | Guía "cómo enviar el 606/607 cada mes". | S |

### Fase 8 — Endurecimiento y salida a internet (≈2 semanas)
- seguridad: revisión completa de plataforma + Finanzas antes de exponer; HTTPS. Publicar
  requiere tocar el proxy compartido del servidor: **solo con autorización expresa de Carlos**.
- devops: monitoreo, actualización sin pérdida de datos, copia externa verificada.
- dev-backend/dev-frontend: asistente de alta de empresa (plan de cuentas base dominicano,
  ITBIS y retenciones precargados, NCF/e-CF); cierre de año si no se hizo en 1B.
- qa: rendimiento con volumen realista (p. ej. 100.000 asientos por empresa, 50 empresas).
- documentador: manual completo y notas de versión.

### Trabajo adelantable — Presupuestos (≈2 semanas)
Igual que en la v2: presupuesto anual por cuenta y centro de costo, mes a mes; borrador →
aprobado → archivado; reporte presupuesto vs. real; copiar del año anterior; Excel. Requiere
1B (centros de costo) y 1A (sistema de diseño). Se activa por plan (`fin.presupuestos`).

### Con el primer nicho — Conexión de nichos (≈1 semana + el módulo)
Puerta pública interna de Finanzas, avisos de eventos, permisos y funciones del nicho (3.7).
El módulo de nicho en sí se estima cuando Carlos lo defina.

---

## 6. Estimación y versión mínima vendible

Supuestos: equipo de agentes continuo; Carlos revisa cada entregable en 1–2 días. **No incluye**
esperas de terceros (contador, proveedor e-CF), que pueden sumar semanas.

| Fase | Semanas |
|---|---|
| 0 Saneamiento, git, copias, integración en compose | 1,5 |
| 1A Núcleo de plataforma | 3 |
| 1B Núcleo financiero (se solapa ≈1,5 con 1A) | +1,5 a +3 |
| 2 Personalización base | 2 |
| 3 Pantallas de contabilidad | 2,5 |
| 4 Modelo fiscal y origen | 1 |
| 5 Operación, reportes, plantilla de factura | 4,5 |
| 6A Importación XML e-CF | 1,5 |
| 7 606/607 | 2 |
| 8 Endurecimiento y salida | 2 |
| **VMV "Finanzas premium"** | **≈21–24 semanas (≈5–5,5 meses)** |
| 6B Emisión e-CF vía proveedor | +2–3 (tras su documentación) |
| Presupuestos | +0–2 (adelantable) |
| Flujos de aprobación | +1,5 |
| Cobro de suscripciones en línea | +2 (si se elige pasarela) |
| Conexión de nichos + primer módulo de nicho | +1 + (a estimar; orientativo 4–8) |

**Por qué sube respecto a la v2 (17–19):** se suma el núcleo de plataforma que hoy no existe
(empresas, permisos, planes, marca, puente, migraciones) y la personalización (≈+6 semanas);
se compensa en parte porque Payload ya trae sesiones, bloqueo por intentos y panel interno, y
desaparecen la instalación de Vite y el login propio de Finanzas (≈−2).

**VMV "Finanzas premium"** — lo mínimo para cobrarle a una empresa real, aún sin nicho:
- Una instalación multiempresa; aislamiento garantizado por la base en todo dato contable;
  roles base y a medida; 2FA para administradores.
- Personalización: logo y colores, campos personalizados, plantilla de factura ajustable,
  funciones según plan.
- Alta de empresa con plan de cuentas, impuestos, conceptos y **saldos iniciales**.
- Contabilidad completa, facturas, cobros y pagos, CxC/CxP, bancos y conciliación, estados
  financieros con PDF/Excel.
- e-CF por **importación de XML**; serie B bloqueada desde la fecha de cada empresa.
- **606 y 607** validados con la herramienta oficial y aprobados por el contador.
- Copias de seguridad probadas, revisión de seguridad aprobada, manual de usuario.

**Fuera de la VMV:** emisión e-CF (6B), presupuestos, flujos de aprobación, 608, cobro de
suscripciones en línea, edición libre de plantillas, conexión de nichos.
**Cierre de año**: imprescindible antes del primer cierre anual de un cliente.

**Recomendación de calendario:** decidir el primer nicho **antes de la semana 8** (fin de la
Fase 2). Así su módulo puede empezar en paralelo con las Fases 5–7 y el primer producto de
nicho llegaría ≈2–3 meses después de la VMV en vez de empezar de cero entonces.

---

## 7. Avisos de deuda técnica (para que Carlos decida con los ojos abiertos)

1. **Dos tecnologías de servidor** (Next.js/Payload y NestJS) y **ninguna** es la base técnica
   estándar del equipo (FastAPI + htmx). Se acepta porque ambas ya existen y son de calidad
   y porque Carlos eligió la opción A. Costo: el equipo mantiene dos formas de programar y el
   puente entre ellas. Costo de no aceptarlo: reescribir uno de los dos (meses).
2. **El mayor riesgo de calendario es la personalización sin límites.** "Que cada cliente
   configure todo" puede convertir el producto en un constructor de aplicaciones que nunca se
   termina. Por eso cada punto de extensión tiene topes (3.x). Ampliarlos debe ser una
   decisión de negocio explícita, con su costo en semanas.
3. **Aislamiento en plataforma por la aplicación, no por la base** (2.5). Aceptable solo si se
   respeta la regla "en Payload no se guardan datos de negocio". Si algún día se quiere poner
   un nicho dentro de Payload "porque es más rápido", hay que volver a esta decisión.
4. **Payload en modo desarrollo sin migraciones** no puede recibir ningún dato real. La Fase
   1A.1 es obligatoria antes del primer cliente piloto.
5. **Documentos de plataforma con información falsa** (`RAG-LOCAL.md`): confunden a cualquier
   persona o IA que trabaje después. Corregirlos es barato (0.11).

---

## 8. Riesgos y mitigación

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Propiedad del código de Finanzas no clara ("Sirtech", "Yovanny") | No se puede vender legalmente | Decisión 1 antes de invertir más |
| Fuga de datos entre empresas | Gravísimo | RLS en `negocio`; usuarios de BD separados; plugin + pruebas en plataforma; la empresa sale del pase firmado, nunca del navegador |
| Suplantación entre servicios | Grave | Finanzas solo tiene la clave pública; pases de 60 s con audiencia; Finanzas sin puerto publicado |
| Pérdida de datos | Gravísimo | Copias desde Fase 0 de ambas bases a la vez, restauración probada, copia fuera del servidor |
| Plataforma sin historial de código | Cambios irrecuperables | git + GitHub privado en Fase 0 |
| Payload altera la base sola (`push`) | Pérdida de datos | Migraciones en 1A.1; base contable separada |
| Alta de empresa a medias (plataforma sí, Finanzas no) | Cliente sin acceso a Finanzas | Alta idempotente con estado "pendiente" y reintento |
| Personalización crece sin control | Retraso de meses | Topes explícitos; ampliaciones solo con decisión de Carlos |
| Clientes ya facturan e-CF en otro lado | Doble trabajo | Importación de XML estándar (6A) |
| Reglas fiscales mal interpretadas | Multas a clientes | Contador por escrito + herramienta DGII + normativa archivada |
| Errores de centavos | Estados que no cuadran | Decimales de punta a punta |
| Auditoría alterada | Sin trazabilidad | Auditoría de solo agregar |
| Publicar en internet toca el proxy compartido | Afectar otros proyectos de Carlos | Solo en Fase 8 y con autorización expresa |

## 9. Impacto en diseño visual

Hay un inicio de sistema de diseño en plataforma (Tailwind 4 + Button/Card estilo shadcn/ui).
La tarea 1A.6 lo **completa y limpia** (quita los estilos sueltos de la plantilla) y pasa a
ser **el único** sistema: todas las pantallas de Finanzas y de los nichos usan solo esos
componentes y tokens. La marca de cada empresa solo cambia variables de color y logo; nunca
estilos sueltos por cliente. Sin marca del producto decidida, se arranca con un tema neutro
que se cambia en un solo lugar.

---

## 10. Lo que Carlos debe decidir o conseguir

**(!) Frenan el avance:**
1. **Propiedad del código de Finanzas.** ¿Quién lo escribió y con qué acuerdo? ¿Son tú (y tu
   socio) dueños para venderlo? Incluye el acuerdo entre socios. Sin esto por escrito, todo lo
   construido encima queda en riesgo legal.
2. **¿Una cuenta por empresa?** Propuesta: cada empresa con su RNC es una cuenta; si un
   cliente tiene varias empresas, la misma persona entra a todas y cambia de una a otra.
   ¿Te sirve, o necesitas reportes que sumen varias empresas de un grupo?
3. **Permisos de esta etapa**: crear el historial de cambios (git) de plataforma y su
   repositorio privado en GitHub; mover el zip con claves y cambiar esas claves; corregir
   permisos de archivos de `root`; retirar los documentos de IA que describen cosas que no
   existen.
4. **Dónde guardar las copias de seguridad fuera del servidor.**
5. **Contador asesor** que apruebe el mapeo 606/607 y responda por escrito cómo se reportan los e-CF.

**Del negocio:**
6. **¿Vendemos "Finanzas premium" sola** mientras se define el nicho, o esperamos al nicho
   para salir al mercado?
7. **¿Cuál es el primer nicho y para cuándo lo decides?** Recomendado: antes de la semana 8.
8. **Planes**: ¿cuántos (p. ej. Básico / Profesional) y qué incluye cada uno? ¿Límites de
   usuarios o facturas por mes?
9. **Cobro de las suscripciones**: al principio, ¿lo haces tú manualmente (transferencia +
   factura) o quieres cobro con tarjeta en línea desde el día uno? Recomendado: manual al inicio.
10. **¿Quién crea las cuentas de los clientes?** Recomendado al inicio: tú o tu equipo (no
    registro libre por internet).
11. **Factura personalizada**: ¿basta con elegir diseño + logo + colores + textos + qué
    columnas y campos se ven, o tus clientes esperan diseñar la factura a su gusto?
12. **¿Necesitas aprobaciones** (p. ej. "compras de más de X las aprueba el gerente") en la
    primera versión?
13. **Dominio**: ¿una sola dirección para todos (p. ej. `app.tumarca.com`) o una por cliente
    (`cliente.tumarca.com`)? Recomendado: una sola al inicio.

**De la v2, siguen abiertas:**
14. Proveedor e-CF (para 6B): hacerle las 9 preguntas de la Fase 6.
15. Cómo ver las pantallas sin publicarlas: túnel SSH o VPN privada (se dará paso a paso).
16. Nombre y marca del producto.
17. GitHub: cuenta u organización, acceso del socio, aceptar GitHub Pro/Team (de pago) para
    proteger la rama principal en repos privados.
18. Empresa piloto (datos reales o de prueba) y XML e-CF reales de ejemplo.
19. Cierre de año en la Fase 1B o en la 8; 608 sí/no.
20. Presupuestos: ¿solo ingresos y gastos? ¿versiones? ¿quién aprueba?
21. Monedas: solo pesos o también dólares (ya soportado).

---

## Fuentes normativas

- Aviso DGII 06-26 (06/05/2026), copia en `docs/normativa-dgii/2026-10-08_Aviso-06-26_prorroga-FE.pdf`.
  Origen: https://dgii.gov.do/publicacionesOficiales/avisosInformativos/Documents/2026/06-26.pdf
- Nota de prensa DGII de la prórroga: https://dgii.gov.do/noticias/Paginas/DGII-otorga-prorroga-seis-meses-Peque%C3%B1os-Micros-y-no-clasificados.aspx
- Formatos de envío de datos (606/607): https://www.dgii.gov.do/herramientas/formularios/formatoEnvioDatos/Paginas/default.aspx
- Instructivo 606: https://dgii.gov.do/publicacionesOficiales/bibliotecaVirtual/contribuyentes/formatoEnvioDatos/Documents/6-InstructivodellenadoyenvíoFormato606.pdf
- Instructivo 607: https://dgii.gov.do/publicacionesOficiales/bibliotecaVirtual/contribuyentes/formatoEnvioDatos/Documents/5-InstructivoLlenadoyenvioFomato607.pdf

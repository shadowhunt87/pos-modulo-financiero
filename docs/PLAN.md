# Plan técnico — Finanzas dentro de la plataforma comercial multiempresa

Fecha: 2026-10-08 · Autor: Arquitecto · **Versión 3.1** (v3 + correcciones del revisor-critico)
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
| Personalización | No existía | Piloto: marca, funciones por plan, campos personalizados en facturas y terceros (solo mostrar), plantilla de factura ajustable |
| Salida al mercado | Versión mínima vendible de Finanzas | **Sin lanzamiento de Finanzas sola**: piloto con 1–2 empresas; el producto comercial es Finanzas + primer nicho |
| Estimación | 17–19 semanas | Piloto **≈21–23 semanas**; primer producto de nicho ≈26–31 (ver sección 6) |

Cambios de la v3.1 (revisión del revisor-critico): RLS en Finanzas con la empresa fijada una
vez por petición (1B.4, reestimada); una sola función de pertenencia en plataforma y
prohibición automática de consultas de Payload que salten el control de acceso; puente con
lista cerrada de rutas; el pase solo lleva permisos `fin.*`; ambiente de pruebas separado;
prueba de restauración con desincronización entre bases; quitar el superusuario antes de
cualquier dato de Finanzas; alcance del piloto recortado; nicho y contador se consiguen ya;
importación XML imprescindible; propiedad del código resuelta.

Se **conservan** de la v2 (revisadas por el revisor-critico y siguen valiendo): copias de
seguridad en Fase 0; bloqueo de tipos E sin e-CF y de serie B desde la fecha de cada empresa;
duplicados RNC + NCF en la base; auditoría de solo agregar; reapertura de períodos con motivo;
RLS en Finanzas; montos decimales exactos; modelo fiscal antes de la pantalla de facturas;
e-CF por proveedor externo con importación de XML (6A, ahora imprescindible) y emisión (6B) después;
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
5. **Personalización en el piloto, acotada**: logo y colores, funciones según plan, campos
   personalizados en facturas y terceros (solo para mostrar) y plantilla de factura ajustable.
   Roles a medida, límites por plan, vistas guardadas y aprobaciones van después.
6. **Estrategia**: Finanzas **no** se lanza sola. Se hace un **piloto con 1–2 empresas**
   (≈21–23 semanas) y el producto comercial es **Finanzas + el primer nicho**, que se decide
   **ya** para construirlo en paralelo (≈26–31 semanas en total). El contador se consigue ya.

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
     emisor `plataforma`, destinatario `finanzas`, usuario, empresa, **solo los permisos
     `fin.*`** (nunca los de plataforma u otros módulos), funciones del plan con prefijo `fin.`,
     IP y navegador del usuario, un identificador **usado solo para auditoría** (no se
     controla su reutilización) y **vencimiento de 60 segundos**;
   - llama a NestJS por la red interna con ese pase.
   - **Una sola función de pertenencia** (`resolverAcceso(usuario, empresa)`) decide si la
     persona pertenece a la empresa y con qué permisos; es **la única** que alimenta la firma
     del pase (no hay otra forma de firmar) y tiene pruebas propias: usuario sin pertenencia,
     pertenencia suspendida, empresa suspendida, administrador de plataforma, cambio de empresa.
3. NestJS solo tiene la **clave pública**: puede verificar pases, **no fabricarlos**. Un fallo
   en Finanzas no permite suplantar a nadie.
4. Dos caminos, una sola función de firma:
   - **Desde el servidor** (componentes de servidor y acciones de Next.js): la mayoría de pantallas.
   - **Puente `/api/fin/*`** para componentes interactivos (p. ej. buscar cuentas mientras se
     escribe un asiento): valida sesión, verifica origen de la petición (protección CSRF),
     limita tamaño, firma el pase y reenvía. **Lista cerrada de rutas**: solo reenvía las
     combinaciones método + ruta escritas explícitamente en una tabla (p. ej.
     `GET /cuentas/buscar`); cualquier otra responde 404. Agregar una ruta es un cambio
     revisado en código. `/internal/*` nunca está en la lista.
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

**Regla automática en plataforma:** las consultas a Payload desde el código del servidor
(Local API) **saltan el control de acceso por defecto**. Se prohíbe cualquier llamada de la
Local API que no lleve `overrideAccess: false` y el usuario, salvo una lista corta de
excepciones justificadas (p. ej. dentro de `resolverAcceso`), con una regla de lint que hace
fallar la revisión automática si alguien lo omite.

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
- **Orden obligatorio**: quitar el superusuario a Payload y crear los usuarios separados
  (tarea 0.4) **antes** de que exista cualquier dato de Finanzas en el servidor.
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
- La empresa sale **del pase firmado**, nunca de lo que mande el navegador.
- **Cómo se fija la empresa (decisión v3.1):** **una sola vez por petición**. Al entrar la
  petición se abre **una transacción**, se ejecuta
  `set_config('app.empresa_id', <empresa del pase>, true)` y esa transacción se guarda en un
  **contexto de la petición** (`AsyncLocalStorage` de Node). Todo el código usa un cliente de
  base de datos que **toma la transacción del contexto**; si no hay contexto, falla.
  - Por qué no la "extensión del cliente Prisma": no funciona con las transacciones
    interactivas que el código ya usa (**48** llamadas `$transaction(async ...)` en 14
    archivos, más 3 de SQL directo).
  - Por qué no `set_config` en cada una de las 48 transacciones: 48 lugares donde olvidarlo
    hoy, y uno más cada vez que alguien escriba código nuevo.
  - Librería candidata: `@nestjs-cls/transactional` con su adaptador de Prisma (MIT,
    mantenida), que hace exactamente esto; si en la prueba corta no convence, son ≈150
    líneas propias.
  - Cambio en el código: las 48 `this.prisma.$transaction(async tx => ...)` pasan a usar la
    transacción de la petición (los bloques internos se conservan casi igual).
  - Redes de seguridad: (a) si una consulta llega sin empresa fijada, la regla RLS compara
    contra "vacío" y **no devuelve ni acepta filas** (falla cerrado, nunca abierto);
    (b) regla de lint que prohíbe usar `PrismaService` o `$transaction` fuera del módulo de
    base de datos; (c) prueba que recorre todas las rutas de la API y falla si alguna toca la
    base fuera del contexto.
  - Costos: cada petición ocupa una conexión durante toda su duración; se fija un tiempo
    máximo por petición y un tamaño de conjunto de conexiones medido en la prueba de
    rendimiento (Fase 8). Los reportes pesados usan transacción de solo lectura.
- SQL directo (`$queryRaw`) queda cubierto porque la regla está en la base.
- Se mantienen además los filtros por empresa en el código (doble protección).
- **Qué protege y qué no:** RLS protege contra **errores dentro de Finanzas** (una consulta
  que olvida el filtro, una referencia a un tercero de otra empresa). **No protege contra
  errores de plataforma**: si plataforma firma un pase con la empresa equivocada, Finanzas
  obedece. Esa frontera la cuidan `resolverAcceso`, la regla de `overrideAccess: false` y sus
  pruebas (2.3).

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

Esto se le dice claro a Carlos: **la base de datos protege los datos contables contra
errores del propio programa de Finanzas; quién entra a qué empresa lo decide plataforma, y
ahí la protección son reglas de la aplicación centralizadas, automáticas y probadas.**

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

### 3.1 Funciones por plan (feature flags) — piloto: solo encender/apagar
- Plataforma: colección `planes` (funciones incluidas y límites: usuarios, empresas,
  documentos al mes) y, por empresa, plan + excepciones puntuales.
- **Piloto**: solo encender/apagar funciones. **Límites medidos** (usuarios, documentos al
  mes) **después del piloto**.
- Las funciones activas viajan en el pase; NestJS las exige con `@RequiereFuncion(...)`;
  las pantallas ocultan menús. Los límites se aplican donde vive el recurso.
- Nombres de función con prefijo de módulo: `fin.presupuestos`, `fin.ecf.emision`,
  `fin.multimoneda`, `nicho_x....`.
- Descartado: Unleash / GrowthBook (servicio extra pensado para experimentos, no para planes).

### 3.2 Roles — piloto: 4 roles base; roles a medida después
- Cada módulo declara su catálogo de permisos (lista fija en código).
- **Piloto**: 4 roles base fijos (Administrador, Contador, Aprobador, Solo lectura), definidos
  como conjuntos de permisos del catálogo (así los roles a medida no exigen rehacer nada).
- **Después del piloto**: cada empresa crea **roles propios** marcando permisos del catálogo.
- 2FA obligatorio para administradores de empresa y de plataforma.

### 3.3 Marca y colores — piloto
- Por empresa: logo, color principal y de acento, nombre comercial.
- Se aplican cambiando las **variables de color del tema Tailwind** en tiempo de ejecución; el
  resto del sistema de diseño no cambia. Colores validados por contraste (legibilidad).
- Archivos de marca en `media` **con dueño por empresa y sin lectura pública**.

### 3.4 Campos personalizados — piloto: facturas y terceros, solo mostrar
- **Piloto**: solo en **facturas y terceros**; solo para **capturar y mostrar** (en pantalla y
  en la factura impresa). Sin filtros ni agrupaciones en reportes.
- Definiciones por empresa: nombre; tipo (texto, número, fecha, sí/no, lista); obligatorio;
  mostrar en impresión.
- Valores en una columna JSONB del documento, **validados contra la definición** en la misma
  transacción.
- Tope: 25 campos por tipo de documento. Sin fórmulas ni campos calculados.
- **Después del piloto**: líneas de factura y asientos; filtros en reportes (con índice).
- Las pantallas dibujan esos campos automáticamente a partir de la definición.
- Descartado: tablas genéricas "atributo-valor" (lentas y complejas de consultar).

### 3.5 Plantilla de factura — piloto (versión acotada)
- **Primera versión**: 2–3 diseños base; por empresa se elige diseño, logo, colores, textos
  de encabezado/pie, columnas visibles y campos personalizados a mostrar.
- Los elementos **fiscales obligatorios** (RNC, NCF/e-NCF, ITBIS, QR y código de seguridad
  e-CF) **no se pueden quitar**.
- Cada factura guarda la versión de plantilla con que se emitió (reimpresión idéntica).
- PDF generado en el servidor de Finanzas **sin navegador** (librería a confirmar con prueba
  corta; candidata `@react-pdf/renderer`, MIT). Descartado Chromium dentro del contenedor
  (≈300 MB extra y más superficie).
- **Después del piloto**, si los clientes lo piden: edición libre con un motor de plantillas
  seguro (p. ej. `liquidjs`, MIT, sin ejecución de código).
- Reportes: "vistas guardadas" (columnas y filtros) **después del piloto**; nunca un
  diseñador de reportes.

### 3.6 Flujos de aprobación — después del piloto (salvo que el nicho lo exija)
- Diseño previsto, simple: reglas por empresa del tipo "factura de compra mayor a X requiere
  aprobación de un rol Y". Estados: borrador → pendiente de aprobación → aprobada → emitida.
- Ya existe base: rol Aprobador y "aprobado por" en asientos.
- Descartado: motores de flujo (Camunda, Temporal): enormes para esta necesidad.

### 3.7 Conexión de módulos de nicho con Finanzas — en paralelo, con el nicho elegido
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
| 0.4 | devops | Postgres de plataforma: crear base `negocio`, usuarios `negocio_owner` / `negocio_app` (sin bypass de RLS) y usuario propio de Payload (deja de usar el superusuario). Unificar `DATABASE_URL`. **Bloqueante: debe estar hecha y verificada antes de cargar cualquier dato de Finanzas** (incluidas las pruebas 0.9). | M |
| 0.5 | devops | Compose de plataforma: servicio `finanzas-api` (imagen versionada, sin puertos, red interna), pgAdmin bajo demanda con versión fija. **Sin reiniciar nada sin autorización.** | M |
| 0.6 | devops | **Copias de seguridad** de ambas bases a la vez: diarias, cifradas, fuera del volumen Docker, 14 diarias + 8 semanales; destino externo según decisión de Carlos. **Prueba de restauración documentada que incluye la desincronización entre las dos bases**: empresas que existen en una y no en la otra, usuarios referenciados que ya no existen; procedimiento escrito para detectarlas y repararlas (reconciliación con el alta idempotente de 2.6). | M |
| 0.7 | devops | Base de pruebas separada para Finanzas. | S |
| 0.8 | dev-backend | Finanzas: prefijo `/api/v1`, OpenAPI de entradas en `/api/docs` (solo red interna). | S |
| 0.9 | qa | Correr las ~133 e2e contra la base de pruebas (aún con el login viejo); reportar fallas. | M |
| 0.10 | devops | GitHub: repos privados, 2FA obligatorio, rama `main` protegida, gitleaks local antes de cada push. | S |
| 0.11 | documentador | README real de ambos; marcar `RAG-LOCAL.md` y `config/rag-ollama-config.js` como "no implementado" o retirarlos (previo permiso). | S |

**Terminado cuando:** e2e corridas e informadas; nada escucha fuera de 127.0.0.1; restauración
probada; `seguridad` firma que no hay secretos en git.

### Fase 1A — Núcleo de plataforma (≈3,5 semanas)
**Entregable:** Carlos crea una empresa en el panel interno, invita a un usuario con un rol,
ese usuario entra (con 2FA si es administrador), elige empresa y ve una pantalla de prueba que
trae datos **reales de Finanzas** a través del pase firmado.

| # | Agente | Tarea | Tam. |
|---|---|---|---|
| 1A.1 | dev-backend | Payload: ids UUID; pasar de `push` a **migraciones** (línea base); imagen de producción con el `Dockerfile` existente. | M |
| 1A.2 | dev-backend | Colecciones: empresas, pertenencias con uno de los 4 roles base (vía plugin multi-tenant oficial), catálogo de permisos, planes con funciones encender/apagar, administrador de plataforma. `media` por empresa y sin lectura pública. | L |
| 1A.2b | dev-backend | **`resolverAcceso`**: única función de pertenencia y permisos, única entrada a la firma del pase; regla de lint que prohíbe Local API sin `overrideAccess: false` (con lista de excepciones). | M |
| 1A.3 | dev-backend | Sesión endurecida: cookie Strict/Secure, bloqueo por intentos (ya existe en Payload, configurarlo), cierre de sesión real, 2FA TOTP para administradores (librería mantenida, p. ej. `otpauth`, MIT). | M |
| 1A.4 | dev-backend | **Puente**: firma del pase (Ed25519, `jose`; solo permisos `fin.*`), cliente de servidor hacia Finanzas, ruta `/api/fin/*` con **lista cerrada de rutas**, control de origen y tamaño; claves en variables de entorno. | M |
| 1A.5 | dev-backend | Alta/actualización idempotente de empresa en Finanzas desde un *hook*, con estado "pendiente" y reintento. | S |
| 1A.6 | dev-frontend | **Sistema de diseño**: limpiar restos de la plantilla, tokens de color/tipografía/espaciado, tipografía autoalojada, componentes base (campo, selector, tabla, diálogo, aviso, pestañas, menú, fecha, buscador), formatos es-DO, `lang="es"`. | L |
| 1A.7 | dev-frontend | Login del cliente, selector de empresa, menú según permisos y funciones, páginas de error; marca por empresa vía variables de color. Eliminar la página de prueba con el error de `onClick`. | M |
| 1A.8 | qa | Pruebas de acceso por colección (empresa A no ve nada de B, ni archivos); pruebas de `resolverAcceso`; pase vencido/alterado/de otra audiencia rechazado; ruta fuera de la lista del puente devuelve 404. | M |
| 1A.10 | devops | **Ambiente de pruebas separado** (plataforma + Finanzas + su propia base, en el mismo servidor, solo 127.0.0.1, datos ficticios): cada versión se instala y valida ahí antes de llegar a las empresas reales; procedimiento escrito de "pasar a producción". | M |
| 1A.9 | seguridad | Revisión de sesión, pase, puente y permisos. | M |

### Fase 1B — Núcleo financiero (≈3,5 semanas; ≈1,5 en paralelo con 1A)
**Entregable:** informe de qa con cada corrección probada; Finanzas solo acepta pases válidos y
la base rechaza accesos entre empresas aunque se salte el programa.

| # | Agente | Tarea | Tam. |
|---|---|---|---|
| 1B.0 | dev-backend | **Reemplazar el login propio** por: guardia de pase, guardia de permisos, guardia de funciones; `User` → referencia sin contraseña; `Company.id` = id de empresa de plataforma; endpoint `/internal/empresas`; utilidad de pruebas que fabrica pases con clave de prueba y adaptación de las e2e. | L |
| 1B.1 | dev-backend | Asientos manuales por el motor único; anulación con quién/cuándo/por qué. | M |
| 1B.2 | dev-backend | Período fiscal abierto obligatorio. | S |
| 1B.3 | dev-backend | Reapertura de períodos: permiso específico, motivo obligatorio, registro, prohibida con año cerrado, aviso si ya hubo 606/607. | S |
| 1B.4a | dev-backend | Contexto de petición con transacción única y `set_config` (2.5); prueba corta de `@nestjs-cls/transactional` vs. código propio. | M |
| 1B.4b | dev-backend | Migrar las 48 `$transaction` y las 3 de SQL directo al cliente del contexto; lint que prohíbe `PrismaService`/`$transaction` fuera del módulo de base. | L |
| 1B.4c | dev-backend | Migración: `companyId` en tablas hijas, reglas RLS en todas las tablas de empresa (fallan cerradas sin empresa), permisos de `negocio_app`; validación de pertenencia de centros de costo y terceros. | L |
| 1B.4d | qa | Prueba que recorre todas las rutas y falla si alguna toca la base fuera del contexto. | M |
| 1B.5 | dev-backend | Montos decimales de punta a punta; eliminar los `Number(...)` de `invoicing.service.ts`. | M |
| 1B.6 | dev-backend | Bloquear tipos E sin e-CF configurado; bloquear serie B desde fecha configurable por empresa; advertencia en compras B posteriores. | S |
| 1B.7 | dev-backend | Duplicados RNC emisor + NCF con índice único parcial (excluye anuladas). | S |
| 1B.8 | dev-backend | Auditoría de solo agregar (sin permiso de modificar/borrar + disparador); IP y navegador desde el pase. | S |
| 1B.9 | dev-backend | Servicios faltantes: centros de costo, tasas de cambio, datos contables de empresa, **catálogo de conceptos**, importación de plan de cuentas y **saldos iniciales**. | M |
| 1B.10 | dev-backend | Cierre de año fiscal (si Carlos lo aprueba aquí; si no, Fase 8). | M |
| 1B.11 | qa | Pruebas unitarias de reglas contables; **prueba de aislamiento** tabla por tabla, también por SQL directo. | L |
| 1B.12 | seguridad | Revisión de RLS, usuarios de base de datos y guardias. | M |
| 1B.13 | documentador | Reglas contables del sistema en lenguaje de contador. | S |

### Fase 2 — Personalización del piloto (≈1,5 semanas)
**Entregable:** el administrador de una empresa cambia su logo y colores, invita usuarios con
uno de los 4 roles base y define campos personalizados para facturas y terceros; Carlos asigna
planes y ve cómo se encienden y apagan funciones.

| # | Agente | Tarea | Tam. |
|---|---|---|---|
| 2.1 | dev-backend | Campos personalizados en facturas y terceros (3.4): definiciones, JSONB, validación. | M |
| 2.2 | dev-frontend | Componente que dibuja campos personalizados en formularios y en la vista del documento. | M |
| 2.3 | dev-frontend | Pantallas de administración de empresa: marca, usuarios e invitaciones con rol base. | M |
| 2.4 | dev-backend | Planes: aplicación de funciones (encender/apagar) en pantallas y API. | S |
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

### Fase 5 — Operación, reportes y plantilla de factura (≈4 semanas)
**Entregable:** facturar, cobrar, pagar, conciliar y ver estados financieros desde pantalla,
con PDF de factura en la plantilla de la empresa, y Excel.

| # | Agente | Tarea | Tam. |
|---|---|---|---|
| 5.1 | dev-frontend | Facturas de venta y compra, notas, totales en vivo, campos fiscales, estado e-CF, campos personalizados. | L |
| 5.2 | dev-frontend | Cobros y pagos, notas aplicadas, estado de cuenta, antigüedad. | L |
| 5.3 | dev-frontend | Tesorería: extracto CSV con vista previa, reglas, conciliación. | L |
| 5.4 | dev-frontend | Reportes con navegación al asiento de origen. | L |
| 5.5 | dev-backend | PDF en servidor con plantillas configurables (3.5) y Excel; adjuntos en disco del servidor; contratos de respuesta pendientes. | L |
| 5.6 | dev-frontend | Pantalla de configuración de plantilla con vista previa. | M |
| 5.7 | qa | Un mes contable completo verificado contra el cálculo manual del contador. | M |
| 5.8 | documentador | Manual de operación diaria. | M |

### Fase 6 — e-CF con proveedor externo
**6A — Importación de XML e-CF (≈1,5 semanas) — IMPRESCINDIBLE para el piloto**: desde el
15/11/2026 las empresas piloto emitirán y recibirán e-CF con su proveedor; sin importación,
el piloto no tiene datos reales que contabilizar. El XML e-CF tiene formato
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

### Primer nicho — en paralelo desde que Carlos lo decida (≈1 semana + el módulo)
Puerta pública interna de Finanzas, avisos de eventos, permisos y funciones del nicho (3.7).
El análisis del nicho empieza en cuanto Carlos lo elija; el desarrollo del módulo arranca
tras la Fase 1B (necesita el contexto de petición y RLS) y corre en paralelo con las Fases
3–7. El módulo en sí se estima con el nicho definido (orientativo 4–8 semanas).

---

## 6. Estimación, piloto y primer producto comercial

**Estrategia (v3.1):** no hay lanzamiento comercial de Finanzas sola. Se hace un **piloto con
1–2 empresas reales** y el producto que se vende es **Finanzas + el primer nicho**.

Supuestos: equipo de agentes continuo; Carlos revisa cada entregable en 1–2 días. **No
incluye** esperas de terceros (contador, proveedor e-CF), que pueden sumar semanas: por eso
el contador se consigue **ya**.

| Fase | Semanas |
|---|---|
| 0 Saneamiento, git, copias, integración en compose | 1,5 |
| 1A Núcleo de plataforma + ambiente de pruebas | 3,5 |
| 1B Núcleo financiero con RLS por contexto (se solapa ≈1,5 con 1A) | +2 |
| 2 Personalización del piloto | 1,5 |
| 3 Pantallas de contabilidad | 2,5 |
| 4 Modelo fiscal y origen | 1 |
| 5 Operación, reportes, plantilla de factura | 4 |
| 6A Importación XML e-CF (imprescindible) | 1,5 |
| 7 606/607 | 2 |
| 8 Endurecimiento y salida | 2 |
| **Piloto de Finanzas (1–2 empresas)** | **≈21,5 → rango ≈21–23 semanas (≈5 meses)** |
| Conexión de nichos + primer módulo (en paralelo desde la semana ≈9) | 1 + 4–8 |
| **Primer producto comercial (Finanzas + nicho)** | **≈26–31 semanas (≈6–7 meses)**, según el nicho |

Qué cambió en los números: 1B.4 sube de ≈1 a ≈1,5–2 semanas (48 transacciones a migrar) y se
añade el ambiente de pruebas (+0,5); se compensa con el recorte de alcance (roles a medida,
límites por plan, campos personalizados en reportes y vistas guardadas fuera: ≈−1,5).
El primer producto comercial depende de que el nicho se decida ya: si se decide en la
semana 8, el rango sube a ≈29–35.

**Piloto de Finanzas** — lo que deben poder usar las 1–2 empresas piloto:
- Una instalación multiempresa; datos contables aislados por la base; 4 roles base; 2FA
  para administradores.
- Logo y colores; funciones según plan; campos personalizados en facturas y terceros (solo
  mostrar); plantilla de factura ajustable.
- Alta de empresa con plan de cuentas, impuestos, conceptos y **saldos iniciales**.
- Contabilidad completa, facturas, cobros y pagos, CxC/CxP, bancos y conciliación, estados
  financieros con PDF/Excel.
- **Importación de XML e-CF**; serie B bloqueada desde la fecha de cada empresa.
- **606 y 607** validados con la herramienta oficial y aprobados por el contador.
- Ambiente de pruebas separado; copias probadas (incluida la desincronización entre bases);
  revisión de seguridad aprobada; manual de usuario.

**Después del piloto:** roles a medida, límites medidos por plan, campos personalizados en
más documentos y en reportes, vistas guardadas, flujos de aprobación (salvo que el nicho los
exija), emisión e-CF (6B), presupuestos, 608, cobro de suscripciones en línea, edición libre
de plantillas. **Cierre de año**: imprescindible antes del primer cierre anual de un cliente.

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
| Fuga de datos entre empresas | Gravísimo | RLS en `negocio`; usuarios de BD separados; plugin + pruebas en plataforma; la empresa sale del pase firmado, nunca del navegador |
| Suplantación entre servicios | Grave | Finanzas solo tiene la clave pública; pases de 60 s con audiencia; Finanzas sin puerto publicado |
| Plataforma firma un pase con la empresa equivocada | Grave (RLS no lo detiene) | Única función `resolverAcceso` con pruebas; lint de `overrideAccess: false`; puente con lista cerrada |
| Código de Finanzas que consulta sin empresa fijada | Errores visibles, no fugas | RLS falla cerrado; lint; prueba que recorre todas las rutas |
| Una petición larga ocupa una conexión | Lentitud con muchos usuarios | Tiempo máximo por petición; tamaño del conjunto de conexiones medido en Fase 8 |
| Versión nueva rompe a las empresas piloto | Pérdida de confianza | Ambiente de pruebas separado y procedimiento de paso a producción |
| Copias de las dos bases no coinciden al restaurar | Empresas o usuarios "huérfanos" | Prueba de restauración con desincronización y procedimiento de reparación |
| Pérdida de datos | Gravísimo | Copias desde Fase 0 de ambas bases a la vez, restauración probada, copia fuera del servidor |
| Plataforma sin historial de código | Cambios irrecuperables | git + GitHub privado en Fase 0 |
| Payload altera la base sola (`push`) | Pérdida de datos | Migraciones en 1A.1; base contable separada |
| Alta de empresa a medias (plataforma sí, Finanzas no) | Cliente sin acceso a Finanzas | Alta idempotente con estado "pendiente" y reintento |
| Personalización crece sin control | Retraso de meses | Topes explícitos y alcance del piloto recortado; ampliaciones solo con decisión de Carlos |
| Nicho o contador se deciden tarde | El calendario se alarga semana a semana | Pedirlos ya; el nicho corre en paralelo solo si se decide antes de la semana ≈9 |
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

**Resuelto:** la propiedad del código de Finanzas es de Carlos y su socio. **Recomendación**
(no bloquea): dejar por escrito, firmado por ambos, quién es dueño de qué (Finanzas,
plataforma, módulos de nicho futuros) y qué pasa si uno de los dos se retira.

**(!) Se necesitan YA:**
1. **El primer nicho.** ¿Para qué tipo de negocio será el primer producto? Cada semana de
   espera retrasa el producto comercial.
2. **Contador asesor** que apruebe el mapeo 606/607 y responda por escrito cómo se reportan
   los e-CF.
3. **Las 1–2 empresas piloto**: ¿cuáles? ¿Aceptan usar el sistema con sus datos reales,
   acompañadas, a cambio de condiciones especiales? Y XML e-CF reales de ejemplo.
4. **¿Una cuenta por empresa?** Propuesta: cada empresa con su RNC es una cuenta; si un
   cliente tiene varias, la misma persona entra a todas y cambia de una a otra. ¿Sirve, o hacen
   falta reportes que sumen varias empresas de un grupo?
5. **Permisos de esta etapa**: crear el historial de cambios (git) de plataforma y su
   repositorio privado en GitHub; mover el zip con claves y cambiar esas claves; corregir
   permisos de archivos de `root`; retirar los documentos de IA que describen cosas que no
   existen.
6. **Dónde guardar las copias de seguridad fuera del servidor.**

**Del negocio (antes de la Fase 2):**
7. **Planes**: ¿cuántos y qué funciones incluye cada uno? (Los límites de usuarios o
   documentos llegan después del piloto.)
8. **Cobro de las suscripciones**: al principio, ¿manual (transferencia + factura) o con
   tarjeta en línea? Recomendado: manual.
9. **¿Quién crea las cuentas de los clientes?** Recomendado: tú o tu equipo.
10. **Factura personalizada**: ¿basta con elegir diseño + logo + colores + textos + columnas y
    campos visibles, o los clientes esperan diseñarla a su gusto?
11. **Aprobaciones** (p. ej. "compras de más de X las aprueba el gerente"): ¿las necesita el
    nicho elegido?
12. **Dominio**: ¿una dirección para todos (`app.tumarca.com`) o una por cliente? Recomendado:
    una sola al inicio.

**Siguen abiertas de la v2:**
13. Proveedor e-CF (para 6B): hacerle las 9 preguntas de la Fase 6.
14. Cómo ver las pantallas sin publicarlas: túnel SSH o VPN privada (se dará paso a paso).
15. Nombre y marca del producto.
16. GitHub: cuenta u organización, acceso del socio, aceptar GitHub Pro/Team (de pago) para
    proteger la rama principal en repos privados.
17. Cierre de año en la Fase 1B o en la 8; 608 sí/no.
18. Presupuestos: ¿solo ingresos y gastos? ¿versiones? ¿quién aprueba?
19. Monedas: solo pesos o también dólares (ya soportado).

---

## Fuentes normativas

- Aviso DGII 06-26 (06/05/2026), copia en `docs/normativa-dgii/2026-10-08_Aviso-06-26_prorroga-FE.pdf`.
  Origen: https://dgii.gov.do/publicacionesOficiales/avisosInformativos/Documents/2026/06-26.pdf
- Nota de prensa DGII de la prórroga: https://dgii.gov.do/noticias/Paginas/DGII-otorga-prorroga-seis-meses-Peque%C3%B1os-Micros-y-no-clasificados.aspx
- Formatos de envío de datos (606/607): https://www.dgii.gov.do/herramientas/formularios/formatoEnvioDatos/Paginas/default.aspx
- Instructivo 606: https://dgii.gov.do/publicacionesOficiales/bibliotecaVirtual/contribuyentes/formatoEnvioDatos/Documents/6-InstructivodellenadoyenvíoFormato606.pdf
- Instructivo 607: https://dgii.gov.do/publicacionesOficiales/bibliotecaVirtual/contribuyentes/formatoEnvioDatos/Documents/5-InstructivoLlenadoyenvioFomato607.pdf

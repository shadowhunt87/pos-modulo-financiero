# Anexo S0 — Verificación en dos pasos (2FA) y exportación completa de datos

> **Versión 1.0 · 2026-10-12 · Autor: Arquitecto · Estado: BORRADOR para revisión** (revisor-critico y seguridad;
> después, aprobación de Carlos). Paquete S0 (`docs/paquetes/S0.md`), tarea 0.5 de `docs/PLAN-v0.3.md`.
> **Manda sobre las fichas S1, S2 y S4.** Si una ficha y este anexo dicen cosas distintas, vale el anexo; si el anexo
> no dice algo, el desarrollador **para y pregunta** (PAQUETES-DE-TRABAJO §1, regla 10). Nada de esto se programa
> hasta que el anexo esté aprobado.
> Documentos que mandan: `CLAUDE.md`, `docs/GUIA-PRODUCTO.md` (P7, P10), `docs/GUIA-CONTABLE-FISCAL.md` (R3, R5, R12).

## Índice
0. Resumen para Carlos · 1. Lo que hay hoy en el código · 2. Librerías · 3. 2FA · 4. Exportación completa ·
5. Pantallas (S4) · 6. Pruebas exigidas · 7. Archivos del socio que se tocan · 8. Orden de despliegue ·
9. Riesgos y deuda · 10. Preguntas para Carlos · 11. Pendientes y hallazgos · Anexo A: las 18 decisiones en una tabla

---

## 0. Resumen para Carlos (una página)

**Qué se construye.**
1. **Verificación en dos pasos (2FA).** Además de la clave, la persona escribe un número de 6 dígitos que cambia cada
   30 segundos en una aplicación gratuita del teléfono (Google Authenticator, Microsoft Authenticator, Authy, 1Password…).
   Si le roban la clave, no pueden entrar sin el teléfono. Al activarla, recibe **10 códigos de emergencia** de un solo
   uso por si pierde el teléfono. Si los pierde también, **otro ADMIN** de su empresa le restablece el 2FA; si el que
   lo perdió es el **único ADMIN**, lo restablece el operador del servidor (tú o Claude) con un comando y queda anotado.
2. **Exportación completa.** El ADMIN descarga en un solo archivo `.zip` **todos** los datos de su empresa: una hoja
   (CSV, se abre en Excel) por cada tabla, todos los adjuntos y, cuando existan, los XML de las facturas electrónicas.
   Incluye un índice con huellas digitales (SHA-256) para comprobar que nada se alteró. Nunca incluye claves ni
   secretos, ni nada de otra empresa. Sirve en cualquier momento y también cuando un cliente se va.

**Qué cuesta:** S1 (2FA) ≈2–3 días, S2 (exportación) ≈2–3 días, S4 (pantallas) ≈1 día, más pruebas y revisión de
seguridad (ya contado en el plan v0.3, Fase 3). **Dos librerías pequeñas nuevas** (sección 2), que necesitan tu visto bueno.

**Lo que decides tú (sección 10):** si el 2FA es **obligatorio para los ADMIN** (recomiendo **sí**), dónde va la copia
externa (D17), quién guarda la frase secreta y la llave del 2FA (D18), quién autoriza el rescate del único ADMIN,
las dos librerías, y el nombre que aparece en la aplicación del teléfono.

---

## 1. Lo que hay hoy en el código (verificado el 2026-10-12)

| Pieza | Hoy | Consecuencia para el diseño |
|---|---|---|
| Login (`src/auth/auth.service.ts`, `login`) | Límite de intentos **antes** de tocar la BD; busca el usuario; `bcrypt.compare` contra un **hash falso** si no existe (mismo tiempo); 401 `Credenciales inválidas`; limpia `loginPairKey`; actualiza `lastLoginAt`; `buildAuthResponse` → `{ access_token, user }` | El 2FA se inserta **después** de validar la clave y **antes** de `lastLoginAt` y del token. Sin 2FA, la respuesta queda idéntica |
| Token (`buildAuthResponse`) | JWT HS256 con `sub, email, role, companyId`; dura `JWT_EXPIRES_IN_SECONDS` (8 h por defecto) | El token final no cambia de forma |
| `JwtStrategy.validate` | Acepta **cualquier** JWT HS256 firmado con `JWT_SECRET` que tenga `sub`; rechaza usuario/empresa inactivos y tokens con `iat` anterior a `passwordChangedAt` | Un token intermedio firmado con `JWT_SECRET` **sería aceptado como sesión completa**. Por eso el token intermedio se firma con **otra llave** (3.8) |
| `AttemptLimiter` (`src/auth/attempt-limiter.ts`) | En memoria, por instancia, cuenta solo fallos, ventana fija de 15 min; reglas de login (par 5, cuenta 20, IP 40) y de clave (`passwordRules`, 5); `TooManyAttemptsException` con `Retry-After` | Se reutiliza tal cual con reglas nuevas para el código (3.11) |
| `UsersService.resetPassword` / `changePassword` | Ponen `passwordChangedAt = now` (invalida sesiones); `changePassword` devuelve un token nuevo; bitácora `UPDATE` con `{ passwordReset: true }` / `{ passwordChanged: true }` | Mismo patrón para activar/desactivar/restablecer el 2FA (3.13) |
| `writeAudit` (`src/common/audit.ts`) | Escribe `companyId, userId, entityName, entityId, action, changes`. **No llena** `ipAddress` ni `userAgent`, aunque las columnas existen | Se agrega un parámetro **opcional** para IP y navegador (3.12) |
| `AuditAction` | `CREATE, UPDATE, DELETE, VOID, APPROVE, POST, CLOSE, RECONCILE, LOGIN, REJECT`. `LOGIN` existe y **nadie lo usa** | Se reutilizan; **no** se agregan valores (3.12) |
| Prueba «Política de rutas» (`test/security.e2e-spec.ts` ≈321–374) | (a) solo `POST /auth/login` va sin `JwtAuthGuard`; (b) escrituras sin `@Roles`: solo `PATCH /users/me`, `POST /auth/login`, `POST /users/me/change-password`; (c) lecturas con roles: solo `/feedback/`, `/users/`, `/users/:id` (ADMIN); (d) un VIEWER recibe 403 en toda ruta con roles que no lo incluyan | Las listas (a), (b) y (c) cambian de forma explícita (3.14 y 4.6) |
| Regresión «escrituras por id con companyId» (mismo archivo ≈390) | Busca `.update({ where: {…} })` / `.delete({ where: {…} })` sin `companyId`, con dos excepciones | El código del 2FA usa `updateMany`/`deleteMany` con `userId` del propio usuario o con `user: { companyId }` (3.10) |
| Adjuntos (`src/attachments/file-storage.ts`) | `FileStorage.read(key): Buffer`; clave `companyId/uuid` generada por el servidor; `pathOf` impide salir de la carpeta raíz; `AttachmentsModule` **no exporta** `FILE_STORAGE` | La exportación lee de a un archivo y verifica el prefijo `companyId/` (4.9) |
| Memoria | `docker-compose.pruebas.yml`: `mem_limit: 768m`, `NODE_OPTIONS=--max-old-space-size=512` | La exportación va **en flujo** (4.5) |
| Proxy (`frontend/deploy/nginx.conf`) | `location = /api/auth/login` con cuerpo ≤ 8 KB; `/api/` con 12 MB y `proxy_read_timeout 120s` | Agregar el mismo tope a `/api/auth/login/…` (S4); la descarga en flujo no se corta porque siempre llegan bytes |
| CSP (`frontend/deploy/security-headers.conf`) | `img-src 'self' data: blob:`; scripts solo propios | El QR llega como imagen `data:` SVG; la CSP no cambia (3.15) |
| Frontend (`core/auth.ts`, `core/api.ts`) | Token en `localStorage`; `Api.download` hace GET → Blob | El paso intermedio **no** se guarda en `localStorage`; la exportación necesita una descarga por POST (5) |
| Librerías | Backend sin TOTP, sin QR, sin ZIP directo (`archiver` 5.3.2 llega solo como dependencia de `exceljs`) | Sección 2 |
| Archivos de despliegue | `docker-compose.prod.yml` **sí está en el repo** y pasa al API una lista explícita de variables | Las variables nuevas se agregan ahí (3.3). La ficha S3 dice lo contrario: ver 11 |

---

## 2. Librerías (regla PLAN-v0.2 §2.3 y PLAN-v0.3 §3: toda librería nueva, con justificación escrita)

Resumen: **TOTP propio** (sin librería), **`qrcode-generator`** para el QR (backend), **`yazl`** para el ZIP (backend),
y en desarrollo solo `@types/yazl` y `yauzl` + `@types/yauzl` (para que las pruebas abran el ZIP). **Frontend: ninguna.**
Versiones **fijadas exactas** en `package.json` (sin `^`), `npm audit` limpio en el PR, y seguridad las valida.

### 2.1 TOTP (el número de 6 dígitos) → **implementación propia con `node:crypto`**

| Opción | Licencia / dependencias / mantenimiento (consultado 2026-10-12) | Veredicto |
|---|---|---|
| **Propia** (≈60 líneas: HOTP RFC 4226 + TOTP RFC 6238 + Base32 RFC 4648, con `createHmac`, `randomBytes`, `timingSafeEqual`) | Sin dependencias | **Elegida.** El algoritmo es corto, fijo desde 2011 y tiene vectores de prueba oficiales; la parte delicada (ventana, anti-reuso, límites) es nuestra de todos modos; no suma cadena de suministro a la pieza que protege el login |
| `otpauth` 9.5.2 | MIT, 1 dependencia (`@noble/hashes`), publicada 2026-09 | Buena alternativa. **Plan B** si seguridad prefiere no tener código propio: no cambia nada más del diseño |
| `otplib` 13.5.0 | MIT, 6 paquetes internos | Más piezas para lo mismo |
| `speakeasy` | Sin mantenimiento desde hace años | Descartada |

Condición de la opción propia: pruebas de unidad con los **vectores oficiales** (6.1). Si alguna falla, no se fusiona.

### 2.2 Dibujo del QR → **`qrcode-generator` 2.0.4 en el backend**

| Opción | Datos | Veredicto |
|---|---|---|
| **`qrcode-generator` 2.0.4** | MIT, **cero dependencias**, existe desde 2014, última versión 2025-08, trae tipos TypeScript y salida SVG | **Elegida.** El backend devuelve el QR como imagen `data:image/svg+xml;base64,…`; el frontend no suma librerías y la CSP no cambia |
| `uqr` 0.1.3 | MIT, cero dependencias, pero versión 0.x | Plan B |
| `qrcode` | Arrastra `pngjs`, `dijkstrajs`, `yargs` | Más dependencias |
| QR en el frontend | Rompe la regla «frontend: solo `marked`» (PLAN-v0.2 §2.3) | Descartada |
| Sin QR (solo la clave para teclear) | Falla P7: casi nadie la teclea bien | Se ofrece **además** del QR, nunca en su lugar |
| Programar el QR a mano | Reed-Solomon, máscaras: reinventar | Descartada |

### 2.3 Archivo comprimido → **`yazl` 3.3.1**

| Opción | Datos | Veredicto |
|---|---|---|
| **`yazl` 3.3.1** | MIT, 1 dependencia (`buffer-crc32`), escribe ZIP **en flujo** y soporta ZIP64 (> 4 GB o > 65 535 archivos) | **Elegida.** Poco código, mantenida por el mismo autor de `yauzl` |
| `archiver` 7 | MIT, muchas dependencias; la 5.3.2 ya está como transitiva de `exceljs` (quedarían dos copias) | Más superficie |
| `.tar.gz` propio | Windows 10 no lo abre sin programas extra | Malo para el cliente |
| ZIP propio | CRC, descriptores, ZIP64: reinventar | Descartada |

**Solo para pruebas (devDependencies):** `yauzl` (MIT, mismo autor) para abrir el ZIP en las e2e, y los tipos
`@types/yazl`, `@types/yauzl`.

---

## 3. Verificación en dos pasos (S1)

### 3.1 Decisiones del 2FA (preguntas 1–12 de la ficha)

| # | Pregunta | Opciones | Elegida | Por qué |
|---|---|---|---|---|
| 1 | Método y librería | TOTP; SMS; código por correo; llaves físicas / passkeys (WebAuthn) | **TOTP (RFC 6238), implementación propia** (2.1) | Gratis, sin proveedor ni servidor de correo (no existen hoy), funciona sin señal. SMS tiene costo y robo de SIM; correo no hay infraestructura y si roban el correo cae todo. Passkeys es lo más fuerte pero más complejo de recuperar: se deja para después (9.2) |
| 2 | Dónde y cómo se guarda el secreto | Texto plano; cifrado con llave derivada de `JWT_SECRET`; cifrado con **llave propia**; servicio de llaves externo | **Cifrado AES-256-GCM con una llave propia** (`TWO_FACTOR_ENCRYPTION_KEY`), formato con identificador de llave y rotación (3.5) | Texto plano viola R12. Derivarla de `JWT_SECRET` ataría las dos: rotar `JWT_SECRET` tras una filtración dejaría a todos sin 2FA. Un servicio externo es desproporcionado para un servidor |
| 3 | Códigos de recuperación | 8–10 cortos con bcrypt; 10 largos con SHA-256; ninguno | **10 códigos de 16 caracteres (80 bits), guardados como SHA-256, de un solo uso** (3.6) | Con 80 bits de azar, un hash rápido es seguro y la verificación es instantánea; sin códigos, perder el teléfono bloquea |
| 4 | Login en dos pasos: token intermedio | JWT con `typ` firmado con `JWT_SECRET`; token opaco guardado en BD; reenviar la clave en el paso 2; **JWT firmado con otra llave** | **JWT de desafío firmado con una llave derivada (HKDF) de `JWT_SECRET`, 5 min, solo vale en `POST /auth/login/2fa` (y 10 min en `/auth/login/2fa/enroll`)** (3.8) | Con otra llave, `JwtStrategy` **no puede** aceptarlo como sesión, sin tocar ese archivo del socio. Sin tabla nueva. Reenviar la clave obliga al navegador a retenerla |
| 5 | Límite de intentos del código | Nuevo mecanismo; **`AttemptLimiter`** | **`AttemptLimiter` con `twoFactorRules`**: 5 fallos / 15 min por usuario, 20 / 24 h por usuario, 40 / 15 min por IP (3.11) | Mismo límite que el login (5), como pide la ficha S1; el tope diario hace inviable adivinar |
| 6 | Reutilizar un código y reloj | Sin control; recordar códigos usados; **recordar el último paso de 30 s usado** | **±1 paso (±30 s) y anti-reuso por `lastUsedStep`**, actualizado de forma atómica (3.4) | Tolera relojes un poco desfasados; un código ya usado (o uno anterior) no vuelve a servir, ni en dos peticiones simultáneas |
| 7 | ¿Obligatorio para ADMIN? | Voluntario; obligatorio para ADMIN; obligatorio para todos | **Pregunta para Carlos (D41).** Recomendación: **obligatorio para ADMIN**, voluntario para los demás. Se implementa como **variable** `TWO_FACTOR_REQUIRED_ROLES` (vacía por defecto) | Sin decidir por Carlos y sin romper las e2e del socio, que entran solo con correo y clave |
| 8 | Restablecer por el ADMIN | Sin restablecimiento; ADMIN sin confirmación; **ADMIN con su clave (y su código)** | **`POST /users/:id/reset-two-factor`, solo ADMIN, misma empresa (404 si no), no a sí mismo, pidiendo la clave del ADMIN y su código si lo tiene; borra el 2FA, invalida las sesiones del usuario (`passwordChangedAt`), bitácora.** Único ADMIN sin teléfono ni códigos: comando del operador en el servidor (3.10) | Sin confirmación, un token de ADMIN robado bastaría para desactivar el 2FA de otro usuario |
| 9 | Campos en `User` o tabla aparte | Columnas en `User`; JSON en `User`; **dos tablas** | **Tablas nuevas `UserTwoFactor` (1 a 1) y `UserRecoveryCode`**, con relación a `User` (2 líneas en `User`) y borrado en cascada (3.2) | `User` casi no se toca; ninguna consulta existente puede devolver un secreto por accidente; la exportación excluye dos tablas enteras, más fácil de garantizar |
| 10 | Acciones de bitácora | Nuevos valores (`TWO_FACTOR_*`, `EXPORT`) con migración propia; **reutilizar** | **Reutilizar `UPDATE`, `LOGIN` y `CREATE`** con `entityName` y `changes.event` (3.12) | Convención del socio («acciones existentes, sin tocar `AuditAction`», PLAN-v0.2 §2.1); evita una migración `ADD VALUE` |
| 11 | Rutas nuevas del propio usuario vs «Política de rutas» | Ponerles `@Roles` con los 4 roles; **lista explícita** | **Lista explícita**: rutas propias bajo `/users/me/two-factor/…` (como `change-password`) y los dos pasos del login bajo `/auth/login/…`. Se agregan por nombre a las listas de la prueba (3.14) | Poner todos los roles es lo mismo que no ponerlos y lo prohíbe la convención; la lista explícita deja auditado qué queda abierto |
| 12 | QR sin romper la CSP | Librería en el navegador; imagen `data:` | **El backend devuelve `data:image/svg+xml;base64,…`** y el frontend lo pone en un `<img>` (3.15) | `img-src` ya permite `data:`; un SVG dentro de `<img>` no ejecuta scripts |

### 3.2 Modelo de datos (migración nueva y aditiva `prisma/migrations/<fecha>_two_factor/`)

Bloques **nuevos al final** de `schema.prisma`, más **dos líneas de relación** en `User` (`twoFactor UserTwoFactor?` y
`recoveryCodes UserRecoveryCode[]`). No se cambia ningún enum.

**`UserTwoFactor`** (una fila por usuario que empezó o tiene activado el 2FA)
| Campo | Tipo | Regla |
|---|---|---|
| `userId` | String, **@id**, relación a `User` con `onDelete: Cascade` | Uno a uno |
| `secretEnc` | String? | Secreto **activo** cifrado (3.5). Nulo mientras no se confirme |
| `enabledAt` | DateTime? | No nulo = 2FA activo. **«Tiene 2FA» se define siempre así** |
| `pendingSecretEnc` | String? | Secreto en proceso de activación o de cambio de teléfono, cifrado |
| `pendingExpiresAt` | DateTime? | 15 min (activación desde la cuenta) o 10 min (inscripción en el login) |
| `lastUsedStep` | Int? | Último paso de 30 s aceptado (anti-reuso). Entra en Int32 hasta el año ≈4000 |
| `createdAt`, `updatedAt` | DateTime | Como el resto del esquema |

**`UserRecoveryCode`**
| Campo | Tipo | Regla |
|---|---|---|
| `id` | String uuid | |
| `userId` | String, relación a `User`, `onDelete: Cascade`, índice | |
| `codeHash` | String **@unique** | SHA-256 en hexadecimal (64 caracteres) del código normalizado |
| `usedAt` | DateTime? | No nulo = gastado |
| `createdAt` | DateTime | |

Por qué con relación y cascada (y no un `userId` suelto como `Feedback`): son datos de seguridad; la base debe
garantizar que no queden huérfanos, y las limpiezas de las e2e del socio (borran usuarios) siguen funcionando.

### 3.3 Configuración (variables de entorno)

| Variable | Obligatoria | Formato | Uso |
|---|---|---|---|
| `TWO_FACTOR_ENCRYPTION_KEY` | Sí, **si** `TWO_FACTOR_REQUIRED_ROLES` no está vacía; si no, opcional | 64 caracteres hexadecimales (`openssl rand -hex 32`), distinta de `JWT_SECRET`, pasa `weakSecretReason` | Cifra los secretos TOTP |
| `TWO_FACTOR_ENCRYPTION_KEY_PREVIOUS` | No | Igual | Solo durante una rotación (3.5) |
| `TWO_FACTOR_REQUIRED_ROLES` | No (vacía por defecto) | Lista separada por comas de valores de `UserRole` | Política de obligatoriedad (D41) |
| `TWO_FACTOR_ISSUER` | No (por defecto `Finanzas`) | ≤ 40 caracteres, sin `:` | Nombre que se ve en la app del teléfono (D46) |

- `src/config/env.validation.ts` las valida (una variable vacía cuenta como ausente) y la app **no arranca** si la
  política exige 2FA y falta la llave.
- `docker-compose.prod.yml` las pasa al servicio `api`; `env.production.example` y `env.test.example` las documentan
  **sin valores reales** (en `env.test.example`, un marcador que el desarrollador reemplaza con `openssl rand -hex 32`).
- Si falta la llave (y la política está vacía): activar responde **503** «La verificación en dos pasos no está
  disponible en este servidor. Avisa al administrador del sistema.»; el paso 2 del login con **TOTP** responde 503,
  pero **los códigos de recuperación siguen sirviendo** (no dependen de la llave).
- **La llave no está dentro de los respaldos de la base.** Restaurar en otro servidor exige también la llave: se
  guarda junto con la frase de D18 (ver 9.1 y la pregunta D42).

### 3.4 Algoritmo y verificación (archivo `src/auth/two-factor/totp.ts`)

- **Parámetros fijos:** HMAC-SHA1, 6 dígitos, período 30 s, secreto de **20 bytes** de `randomBytes` (160 bits,
  RFC 4226 §4), en Base32 **sin relleno** (32 caracteres). SHA1 porque es lo único que leen todas las apps comunes; en
  HOTP/TOTP no tiene el problema de colisiones de SHA1.
- **URI:** `otpauth://totp/<Issuer>:<email>?secret=<BASE32>&issuer=<Issuer>&algorithm=SHA1&digits=6&period=30`
  (issuer y email codificados con `encodeURIComponent`).
- **Paso actual:** `T = floor(ahora_en_segundos / 30)`. El reloj se lee de un método `protected now()` del servicio
  (como `AttemptLimiter`) para poder simularlo; las e2e usan `vi.setSystemTime`.
- **Verificar:** normalizar (quitar espacios); si no son exactamente 6 dígitos, no es un TOTP (puede ser un código de
  recuperación, 3.6). Calcular el código de `T-1`, `T`, `T+1` y comparar **cada uno** con `timingSafeEqual` (sin
  cortar al primero). Tomar el mayor paso que coincida, `m`.
- **Anti-reuso atómico:** aceptar solo si `m > lastUsedStep`, con
  `updateMany({ where: { userId, OR: [{ lastUsedStep: null }, { lastUsedStep: { lt: m } }] }, data: { lastUsedStep: m } })`.
  Si actualiza 0 filas, el código se trata como incorrecto. Así, dos peticiones simultáneas con el mismo código: una
  pasa, la otra no.
- Al **confirmar la activación** se guarda `lastUsedStep = m`: el mismo código no sirve para entrar enseguida.
- **Un solo mensaje** para código malo, viejo o ya usado: «El código no es correcto o ya se usó. Espera a que tu
  aplicación muestre uno nuevo e inténtalo otra vez.» (no se le dice al atacante cuál de los tres casos fue).
- **Reloj del servidor:** si se desfasa más de 30 s, nadie entra. devops verifica que el servidor sincroniza la hora
  (NTP) antes de abrir la puerta (8, paso 6).

### 3.5 Cifrado del secreto (archivo `src/auth/two-factor/secret-box.ts`)

- **AES-256-GCM** (`node:crypto`), IV aleatorio de 12 bytes por cada cifrado, etiqueta de 16 bytes.
- **Datos asociados (AAD):** `UserTwoFactor:<userId>:<campo>` (`secret` o `pending`). Copiar el texto cifrado de un
  usuario a otro, o de pendiente a activo, hace fallar el descifrado.
- **Formato guardado:** `v1:<kid>:<iv>:<cifrado>:<etiqueta>` en base64url, donde `kid` = primeros 8 caracteres
  hexadecimales del SHA-256 de la llave (identifica la llave sin revelarla).
- **Rotación:** se pone la llave nueva en `TWO_FACTOR_ENCRYPTION_KEY` y la vieja en `…_PREVIOUS`; se reinicia; se
  corre el comando `node dist/cli/two-factor-rotate-key.js` (S1, dentro del contenedor `api`), que descifra con la
  vieja y vuelve a cifrar con la nueva, en una transacción por usuario, e imprime solo cuántos usuarios procesó; al
  terminar se quita `…_PREVIOUS`. Descifrar con un `kid` desconocido es un error explícito, nunca un intento a ciegas.
- **Nunca** se escriben el secreto, la URI `otpauth://`, el QR, los códigos ni el token de desafío en logs, en la
  bitácora ni en mensajes de error.

### 3.6 Códigos de recuperación (archivo `src/auth/two-factor/recovery-codes.ts`)

- **10 códigos** por usuario, cada uno de **10 bytes** de `randomBytes` = **80 bits**, escritos en Base32 Crockford
  (`0123456789ABCDEFGHJKMNPQRSTVWXYZ`, sin I, L, O ni U) como **4 grupos de 4**: `7K2M-9QXD-4TRW-HB6P`.
- **Normalizar al recibir:** mayúsculas, quitar guiones y espacios, `O→0`, `I→1`, `L→1`; si no quedan 16 caracteres
  válidos, es incorrecto.
- **Se guarda** solo `SHA-256(hex)` del código normalizado (`codeHash`). Con 80 bits de azar no hace falta bcrypt.
- **Uso único y atómico:** buscar por `{ userId, codeHash, usedAt: null }` y marcar con
  `updateMany({ where: { id, usedAt: null }, data: { usedAt: now } })`; si actualiza 0 filas, es incorrecto.
- **Se entregan una sola vez**: en la respuesta de activar, de regenerar y de inscribirse en el login, con
  `Cache-Control: no-store`. Nunca hay una ruta para volver a verlos.
- **Regenerar** borra todos los anteriores (usados o no) y crea 10 nuevos, en la misma transacción.
- Sirven en **cualquier lugar donde se pide un código** (paso 2 del login, cambiar de teléfono, desactivar,
  regenerar, confirmar un restablecimiento): la entrada de 6 dígitos es TOTP; cualquier otra se prueba como código de
  recuperación. Comparten el mismo límite de intentos.

### 3.7 Endpoints

Convenciones del socio: `class-validator` con `@MaxLength`, `ParseUUIDPipe`, errores en español, 404 para lo ajeno.
**Todas** las respuestas que llevan token, secreto, QR o códigos van con `Cache-Control: no-store`.

| # | Ruta | Protección | Cuerpo (DTO) | Respuesta correcta | Errores |
|---|---|---|---|---|---|
| E1 | `POST /auth/login` (existe) | Sin JWT | `{ email, password }` (igual que hoy) | **Sin 2FA y sin política:** `{ access_token, user }` (idéntico a hoy). **Con 2FA activo:** `{ twoFactorRequired: true, challengeToken, expiresInSeconds: 300 }`. **Rol obligado por la política y sin 2FA:** `{ twoFactorSetupRequired: true, challengeToken, expiresInSeconds: 600 }`. En los dos últimos casos **no** se devuelve `user` ni se actualiza `lastLoginAt` | Igual que hoy (401, 429, 400) |
| E2 | `POST /auth/login/2fa` (nueva) | Sin JWT; vale el desafío | `{ challengeToken: string ≤ 2048, code: string ≤ 32 }` | `{ access_token, user }`; si se entró con código de recuperación, además `recoveryCodesRemaining`; si el desafío era de inscripción, además `recoveryCodes` (10) | 401 «La verificación venció. Vuelve a escribir tu correo y tu clave.» (desafío inválido, vencido, de otro tipo, clave cambiada, usuario o empresa inactivos); 401 mensaje de 3.4 (código); 429; 503 (3.3) |
| E3 | `POST /auth/login/2fa/enroll` (nueva; solo si D41 activa alguna política) | Sin JWT; vale el desafío de inscripción | `{ challengeToken }` | `{ otpauthUri, qrCode, secret, expiresInSeconds: 600 }` (crea o reemplaza el secreto pendiente) | 401 desafío; 429 por IP |
| E4 | `GET /users/me/two-factor` (nueva) | JWT, cualquier rol | — | `{ enabled, enabledAt, recoveryCodesRemaining, requiredForMyRole }` | — |
| E5 | `POST /users/me/two-factor/setup` (nueva) | JWT, cualquier rol | `{ password, code? }`; `code` **obligatorio si ya está activo** (cambio de teléfono) | `{ otpauthUri, qrCode, secret (en grupos de 4), expiresInSeconds: 900 }` | 401 «La clave actual no es correcta» (con `passwordRules`); 401 código; 429; 503 |
| E6 | `POST /users/me/two-factor/enable` (nueva) | JWT, cualquier rol | `{ code }` (de la app **nueva**) | `{ access_token, recoveryCodes }`. Activa o reemplaza el secreto, crea 10 códigos (borra los anteriores), `passwordChangedAt = now` | 422 «No hay una activación en curso o ya venció. Empieza de nuevo desde «Activar».»; 401 código; 429 |
| E7 | `POST /users/me/two-factor/disable` (nueva) | JWT, cualquier rol | `{ password, code }` | `{ access_token }`. Borra la fila de 2FA y los códigos, `passwordChangedAt = now` | 422 «Tu rol exige la verificación en dos pasos: no se puede desactivar. Si cambiaste de teléfono, usa «Cambiar de teléfono».»; 422 si no está activo; 401; 429 |
| E8 | `POST /users/me/two-factor/recovery-codes` (nueva) | JWT, cualquier rol | `{ password, code }` | `{ recoveryCodes }` (no cambia sesiones) | 422 si no está activo; 401; 429 |
| E9 | `POST /users/:id/reset-two-factor` (nueva, en `UsersController`) | JWT + `@Roles(ADMIN)` | `{ password, code? }` del **ADMIN que actúa**; `code` obligatorio si ese ADMIN tiene 2FA | `{ ok: true }` | 404 «Usuario no encontrado» (otra empresa o no existe); 422 «No puedes restablecer tu propia verificación: usa «Seguridad de mi cuenta».»; 422 «Este usuario no tiene activada la verificación en dos pasos.»; 401/429 (clave o código del ADMIN); 403 a los demás roles |
| E10 | `GET /users` y `GET /users/:id` (existen) | Sin cambios | — | Cada usuario suma `twoFactorEnabled: boolean` (calculado de `UserTwoFactor.enabledAt`). Ningún otro dato del 2FA | — |

`qrCode` = `data:image/svg+xml;base64,<SVG de qrcode-generator, corrección M, con margen>`. `secret` = el mismo Base32,
para quien no puede escanear. Las rutas E5–E8 de un usuario cuya empresa o cuenta esté inactiva ya fallan en `JwtStrategy`.

### 3.8 Flujo de inicio de sesión

**Desafío (token intermedio):**
- Llave: `hkdfSync('sha256', JWT_SECRET, 'fin-2fa', 'login-challenge-v1', 32)`. Se firma con `JwtService.sign(payload,
  { secret: llaveDerivada, expiresIn, audience: 'fin-2fa' })` y se verifica con `verifyAsync(token, { secret,
  algorithms: ['HS256'], audience: 'fin-2fa' })`. Como `JwtStrategy` verifica con `JWT_SECRET`, **un desafío nunca
  sirve de sesión**, y un token de sesión nunca sirve de desafío. `jwt.strategy.ts` **no se toca**.
- Contenido: `{ sub, typ: 'login' | 'enroll', pca, jti }`, donde `pca` = `passwordChangedAt` en segundos (0 si nulo)
  y `jti` = uuid aleatorio. Duración: `login` 300 s; `enroll` 600 s. No se guarda en el servidor.
- El navegador lo guarda **solo en memoria** (nunca en `localStorage`).

**Paso a paso:**
1. `POST /auth/login` hace exactamente lo de hoy hasta validar la clave (límite, hash falso, 401 genérico) y limpia
   `loginPairKey`.
2. Consulta `UserTwoFactor` del usuario:
   - `enabledAt` no nulo → responde desafío `typ: 'login'` (E1).
   - Si no, y su rol está en `TWO_FACTOR_REQUIRED_ROLES` → desafío `typ: 'enroll'` (E1).
   - Si no → `lastLoginAt` y token como hoy. **Un secreto pendiente sin confirmar no cuenta como 2FA.**
3. `POST /auth/login/2fa`:
   a. Verifica firma, audiencia y vencimiento del desafío; si falla → 401 «La verificación venció…» y cuenta un fallo
      en la regla por IP.
   b. `limiter.check(twoFactorRules(sub, ip))` **antes** de mirar el código; bloqueado → 429.
   c. Relee usuario y empresa (activos), compara `pca` con el `passwordChangedAt` actual (si cambió → 401 venció) y
      que el estado del 2FA siga correspondiendo al `typ`.
   d. `typ: 'login'`: verifica TOTP (3.4) o código de recuperación (3.6). `typ: 'enroll'`: verifica contra el
      **secreto pendiente** (no vencido) creado por E3.
   e. Falla → `recordFailure`; si con ese fallo quedó bloqueado, escribe una vez la bitácora de bloqueo (3.12); 401.
   f. Acierta → en **una transacción**: anti-reuso o marca del código, `lastLoginAt`, bitácora (y, si es `enroll`,
      activa el secreto y crea los 10 códigos). Limpia la regla `2fa:user`. Devuelve el token con `buildAuthResponse`.
4. Un desafío puede reintentarse con otro código mientras no venza ni se agote el límite. Reusarlo después de entrar
   no da nada: haría falta otro código válido y no usado.
5. **No revela si el correo existe ni si tiene 2FA** a quien no sabe la clave: el paso 1 responde igual que hoy.

### 3.9 Activar, cambiar de teléfono, desactivar y regenerar (desde la cuenta)

- **Activar:** E5 (clave) → la persona escanea → E6 (código de la app). Si no confirma en 15 min, el pendiente vence.
- **Cambiar de teléfono:** E5 con clave **y** un código actual (o de recuperación) → escanea con el teléfono nuevo →
  E6 reemplaza el secreto y **regenera** los códigos. El teléfono viejo deja de servir.
- **Desactivar:** E7 (clave + código). Bloqueado si la política exige 2FA para su rol.
- **Regenerar códigos:** E8 (clave + código).
- **Activar y desactivar invalidan las demás sesiones** (`passwordChangedAt = now`) y devuelven un token nuevo, como
  `changePassword`: si alguien activa el 2FA porque sospecha de un intruso, el intruso queda fuera.
- El restablecimiento de **clave** por el ADMIN (`reset-password`, ya existe) **no toca** el 2FA: un ADMIN no puede
  saltarse el 2FA de otro cambiándole la clave (se prueba en 6.3).

### 3.10 Restablecimiento por el ADMIN y rescate cuando el ADMIN pierde el teléfono

**Caso normal (E9):** un ADMIN restablece el 2FA de un usuario de **su** empresa.
- En una transacción: comprobar que el usuario es de `actor.companyId` (`findFirst({ where: { id, companyId } })`; si
  no, 404); borrar con `deleteMany({ where: { userId: id, user: { companyId: actor.companyId } } })` en las dos
  tablas; `user.updateMany({ where: { id, companyId }, data: { passwordChangedAt: now } })`; bitácora.
- Antes, la confirmación del ADMIN: clave con `passwordRules(actor.id)` y, si tiene 2FA, su código con
  `twoFactorRules(actor.id, ip)`.
- Efecto: todas las sesiones del usuario se cierran. En su siguiente entrada, entra solo con clave o, si su rol está
  en la política, se le pide inscribirse (E1 → E3 → E2).
- **Recomendación de operación** (va en el manual): cada empresa con **dos ADMIN** con 2FA, para que uno pueda
  rescatar al otro.

**El único ADMIN perdió el teléfono y los códigos:** no hay quién lo rescate dentro de la empresa.
- Comando del operador (S1): `node dist/cli/two-factor-reset.js --email <correo> --motivo "<texto>"`, ejecutado
  **dentro del contenedor `api`** (`docker compose -p financiero-pruebas -f docker-compose.prod.yml -f
  docker-compose.pruebas.yml --env-file .env.production exec api node dist/cli/two-factor-reset.js …`).
- Hace lo mismo que E9 y escribe la bitácora con el **propio usuario** como actor (la columna exige un usuario) y
  `changes: { event: 'TWO_FACTOR_RESET', via: 'operator-cli', motivo }`. No imprime nada sensible.
- **Quién lo autoriza y cómo se verifica la identidad** es una decisión de negocio (D43). El documentador escribe el
  paso a paso para Carlos sin asumir conocimientos.
- Si se perdió la **llave de cifrado** (3.3): los TOTP dejan de funcionar para todos, pero los códigos de recuperación
  siguen sirviendo y el comando de rescate funciona sin la llave. Con eso se reinscribe a todo el mundo.

### 3.11 Límites de intentos

Nueva función en `attempt-limiter.ts` (junto a `passwordRules`):

| Clave | Límite | Ventana |
|---|---|---|
| `2fa:user:<userId>` | 5 fallos | 15 min (la de siempre) |
| `2fa:day:<userId>` | 20 fallos | 24 h |
| `2fa:ip:<ip>` | 40 fallos | 15 min |

- Aplica a **todo** lugar donde se verifica un código (E2, E5 con código, E6, E7, E8 y la confirmación de E9). Las
  claves se siguen limitando con `passwordRules` (5).
- Se responde con la `TooManyAttemptsException` existente (429 + `Retry-After`, mensaje «Demasiados intentos
  fallidos. Intenta de nuevo en N minuto(s).»).
- Acierto: se limpia `2fa:user:<id>`; el contador diario no se limpia (cuenta solo fallos).
- Cuentas: 5 por 15 min y 20 por día dan a un atacante que ya tiene la clave ≈ 6·10⁻⁵ de acertar por día.
- Límite conocido: está en memoria (se reinicia si se reinicia la API y es por instancia); hoy hay una sola instancia.

### 3.12 Bitácora (R3)

**Cambio pequeño en `src/common/audit.ts`:** parámetro opcional al final, `meta?: { ipAddress?: string; userAgent?:
string }`, que llena las columnas que ya existen. No cambia ninguna llamada actual. Las acciones nuevas lo pasan
siempre (`req.ip` y la cabecera `user-agent`, recortada a 300 caracteres).

| Evento | `action` | `entityName` / `entityId` | Actor (`userId`) | `changes` (nunca secretos ni códigos) |
|---|---|---|---|---|
| Activar | `UPDATE` | `User` / el propio | el propio | `{ event: 'TWO_FACTOR_ENABLED', via: 'ACCOUNT' \| 'LOGIN_ENROLL' }` |
| Cambiar de teléfono | `UPDATE` | `User` / el propio | el propio | `{ event: 'TWO_FACTOR_DEVICE_CHANGED' }` |
| Desactivar | `UPDATE` | `User` / el propio | el propio | `{ event: 'TWO_FACTOR_DISABLED', method: 'TOTP' \| 'RECOVERY_CODE' }` |
| Regenerar códigos | `UPDATE` | `User` / el propio | el propio | `{ event: 'TWO_FACTOR_RECOVERY_CODES_REGENERATED' }` |
| Entrar con 2FA | `LOGIN` | `User` / el propio | el propio | `{ event: 'LOGIN_2FA', method: 'TOTP' }` |
| Entrar con código de recuperación | `LOGIN` | `User` / el propio | el propio | `{ event: 'LOGIN_2FA', method: 'RECOVERY_CODE', remaining: n }` |
| Bloqueo por códigos malos | `LOGIN` | `User` / el propio | el propio | `{ event: 'TWO_FACTOR_LOCKED_OUT' }` (una vez por bloqueo) |
| Restablecido por ADMIN | `UPDATE` | `User` / el usuario | el ADMIN | `{ event: 'TWO_FACTOR_RESET' }` |
| Rescate por el operador | `UPDATE` | `User` / el usuario | el usuario | `{ event: 'TWO_FACTOR_RESET', via: 'operator-cli', motivo }` |

Todo en la **misma transacción** que el cambio. Los inicios de sesión **sin** 2FA siguen sin bitácora (como hoy),
para no cambiar el comportamiento del socio.

### 3.13 Sesiones

Se **reutiliza** `passwordChangedAt` como «las sesiones anteriores a esta fecha ya no valen». Se pone en `now` al
activar, cambiar de teléfono, desactivar, restablecer por ADMIN y en el rescate. **No** al regenerar códigos. El
desafío lleva `pca` y deja de valer si esa fecha cambia. Así `jwt.strategy.ts` no se toca. El nombre del campo queda
algo impreciso: se deja un comentario en el esquema (9.2).

### 3.14 Cambios exactos en «Política de rutas» (`test/security.e2e-spec.ts`)

1. «toda ruta exige JWT, salvo el login» → ordenar ambos lados con `.sort()` y esperar
   `['POST /auth/login', 'POST /auth/login/2fa', 'POST /auth/login/2fa/enroll']`.
2. «toda ruta que modifica datos declara roles explícitos» → esperar (ordenado):
   `['PATCH /users/me', 'POST /auth/login', 'POST /auth/login/2fa', 'POST /auth/login/2fa/enroll',
   'POST /users/me/change-password', 'POST /users/me/two-factor/disable', 'POST /users/me/two-factor/enable',
   'POST /users/me/two-factor/recovery-codes', 'POST /users/me/two-factor/setup']`, y cambiar el título a «… (solo el
   login y la cuenta propia quedan abiertos)».
3. «lecturas restringidas»: S1 no la cambia (E4 es para cualquier rol). S2 la cambia (4.6).
4. `POST /users/:id/reset-two-factor` lleva `@Roles(ADMIN)`: la prueba del VIEWER (403) la cubre sola.
5. La regresión de `companyId` no necesita excepciones nuevas si se respeta 3.10 (`updateMany`/`deleteMany` con
   `userId` del propio usuario o con `user: { companyId }`). Si S1 necesita una, la anota en el PR y la aprueba seguridad.

Ubicación: controlador nuevo `src/auth/two-factor/two-factor.controller.ts` con `@Controller('users/me/two-factor')` y
`@UseGuards(JwtAuthGuard, RolesGuard)` en la clase; E2/E3 en `AuthController`; E9 en `UsersController`. Todo dentro de
`AuthModule` (evita la dependencia circular con `UsersModule`), así que **`app.module.ts` no se toca en S1**.

### 3.15 QR y CSP

El QR se genera en el servidor como SVG y viaja como `data:image/svg+xml;base64,…`. La CSP actual
(`img-src 'self' data: blob:`) lo permite y un SVG dentro de `<img>` no ejecuta scripts. **No se cambia la CSP.**
El texto del secreto se muestra en grupos de 4 con un botón «Copiar». Ni el QR ni el secreto se guardan en el navegador.

### 3.16 Lo que nunca se hace

- Devolver `secretEnc`, `pendingSecretEnc`, `codeHash`, `lastUsedStep` ni la fila de 2FA en ninguna respuesta.
- Registrar en logs o bitácora el secreto, la URI, el QR, los códigos, el desafío o el cuerpo de estas rutas.
- Hacer obligatorio el 2FA en el código por defecto (la política está **vacía** por defecto).
- Volver a mostrar los códigos de recuperación.

---

## 4. Exportación completa (S2)

### 4.1 Decisiones de la exportación (preguntas 13–18 de la ficha)

| # | Pregunta | Opciones | Elegida | Por qué |
|---|---|---|---|---|
| 13 | Qué incluye y qué no | Solo reportes; tablas «principales»; **todo lo de la empresa** | **Todas** las tablas de la empresa (y sus hijas), su fila de `Company`, todos los adjuntos, los XML cuando existan, la bitácora, los comentarios y las tablas globales públicas (parámetros fiscales, cuando existan). **Excluye:** `User.password`, `BankConnection.credentialsEnc` y toda columna de credenciales futura, y las tablas `UserTwoFactor` y `UserRecoveryCode` completas | P10/R12: «todos sus datos»; nunca secretos, que no le sirven al cliente y serían un riesgo si el archivo se pierde |
| 14 | Formato y manifiesto | JSON Lines; **CSV**; Excel; volcado SQL | **ZIP con un CSV por tabla, carpeta de adjuntos, carpeta de XML, `LEEME.txt` y `manifest.json` con conteos y SHA-256** (4.3) | El CSV se abre en Excel y lo importa cualquier otro sistema contable. Excel tiene un tope de 1 048 576 filas y `exceljs` usa mucha memoria; un volcado SQL exige Postgres |
| 15 | Que no falte ninguna tabla futura | Lista a mano; **registro + prueba que compara con el esquema** | **Registro único de modelos + prueba de cobertura** que falla si un modelo de Prisma no está clasificado, si una columna con nombre de secreto no está declarada o si una columna de archivo no está declarada (4.4) | Las tablas de A1, N2a y N3 entran solas o la suite falla |
| 16 | Sin pasar de 768 MB | Generar en memoria; generar a disco y luego descargar; **en flujo** | **En flujo**: páginas de 1 000 filas y **un** adjunto a la vez, escribiendo directo a la respuesta; una exportación a la vez por instancia (4.5) | Memoria acotada sin importar el tamaño; no deja copias de datos sensibles en el disco del servidor |
| 17 | Permisos, frecuencia y bitácora | Cualquier rol; ADMIN; ADMIN + confirmación | **Solo ADMIN, confirmando con su clave (y su código si tiene 2FA)**; máximo 3 por hora por empresa y 1 a la vez; bitácora al empezar y al terminar (4.6, 4.7) | Es la salida de **todos** los datos: con un token robado no basta |
| 18 | Al cancelar el servicio | Nada especial; **la misma exportación, también por el operador** | El ADMIN la descarga antes de que se desactive la empresa (`purpose: 'CANCELLATION'`); si la empresa ya está desactivada (nadie puede entrar), el operador la genera con un comando que escribe el ZIP a la salida estándar (4.8). Cuánto tiempo se conservan los datos después lo decide Carlos (D45) | Una empresa desactivada no puede iniciar sesión (`JwtStrategy`): sin el comando, el cliente que se va no tendría cómo llevarse sus datos |

### 4.2 Registro de modelos (archivo `src/data-export/export-registry.ts`)

Cada modelo de `Prisma.ModelName` está **exactamente una vez** en el registro con una de estas clases:

| Clase | Filtro | Hoy |
|---|---|---|
| `SELF` | `where: { id: companyId }` | `Company` |
| `COMPANY` | `where: { companyId }` | `AccountingSettings`, `DocumentSequence`, `User`, `Account`, `FiscalYear`, `FiscalPeriod`, `Journal`, `JournalEntry`, `CostCenter`, `ExchangeRate`, `Partner`, `TaxRate`, `NcfSequence`, `Invoice`, `Payment`, `BankConnection`, `BankAccount`, `BankReconciliation`, `BankRule`, `CashRegister`, `Budget`, `FinancialRatioSnapshot`, `Attachment`, `AuditLog`, `Feedback` (25) |
| `CHILD` | Por la relación con su padre | `JournalEntryLine` (`journalEntry: { companyId }`), `InvoiceLine` y `InvoiceWithholding` (`invoice: { companyId }`), `PaymentAllocation` (`payment: { companyId }`), `BankTransaction` (`bankAccount: { companyId }`), `BankMatch` (`bankTransaction: { bankAccount: { companyId } }`), `BudgetLine` (`budget: { companyId }`) (7) |
| `GLOBAL_PUBLIC` | Tabla entera | Ninguna hoy. Futuras (N2a/N5): `FiscalParameter`, `FiscalParameterValidation`, `FiscalParameterLoad`, `Holiday`, `FiscalObligation` |
| `SECRET` | **No se exporta** | `UserTwoFactor`, `UserRecoveryCode` (S1) |

Total hoy: 1 + 25 + 7 = 33 modelos, igual que `Prisma.ModelName`.

Además, cada entrada declara:
- **`excludedColumns`** (con motivo): hoy `User.password` y `BankConnection.credentialsEnc`. Futuro: credenciales de
  `EcfConnection` y cualquier certificado `.p12` (R12, Ley 126-02: **nunca** se exportan).
- **`files`**: columnas que apuntan a un archivo del almacenamiento. Hoy `Attachment.fileUrl` → `adjuntos/`. Futuro:
  `EcfDocument.xmlFileUrl` → `xml/` (N3) y los archivos de auditoría de la v0.2 (A1/A2) → `adjuntos/`. En el CSV la
  columna conserva su valor y se agrega la columna `exportPath` con la ruta dentro del ZIP.

**Columnas:** todas las escalares del modelo (en el orden del esquema, leídas del modelo de datos que trae el cliente
generado de Prisma), menos las excluidas. Nada se escribe a mano por columna.

### 4.3 Formato del archivo

**Nombre:** `exportacion-<RNC>-<AAAAMMDD-HHMMSS>.zip` (hora de RD). Estructura:
```
LEEME.txt              en español: qué hay, cómo abrir los CSV en Excel sin perder ceros, cómo comprobar SHA-256
manifest.json          índice (abajo)
datos/<Modelo>.csv     uno por modelo exportado, aunque esté vacío (solo la cabecera)
adjuntos/<attachmentId>/<nombre saneado con sanitizeFileName>
xml/<Modelo>/<id>.xml  cuando existan (N3)
```
**Reglas del CSV** (RFC 4180): UTF-8 con BOM (para que Excel reconozca los acentos), coma, fin de línea CRLF, comillas
dobles cuando hace falta; cabecera con los nombres de las columnas.

| Tipo | Se escribe como |
|---|---|
| `Decimal` | `valor.toFixed()` (sin argumentos): texto exacto, **sin notación científica**, punto decimal. Nunca `Number` (R7) |
| `DateTime` | ISO 8601 en UTC (`toISOString()`) |
| `Boolean` | `true` / `false` |
| `Int` / `BigInt` / enum | Texto tal cual |
| `Json` | `JSON.stringify` |
| Nulo | Campo vacío |
| Texto vacío | `""` (con comillas), para distinguirlo del nulo |
| Texto que empieza por `=`, `+`, `-`, `@`, tabulador o retorno | Se antepone `'` (evita que Excel lo ejecute como fórmula). Se dice en `LEEME.txt` y en el manifiesto (`csvFormulaEscape: true`). **Solo** en columnas de texto: los números negativos no se tocan |

**`manifest.json`** (versión de formato 1):
```json
{
  "formatVersion": 1,
  "exportId": "<uuid; es el entityId de la bitácora>",
  "purpose": "ON_DEMAND | CANCELLATION",
  "generatedAt": "<ISO>",
  "company": { "id": "…", "name": "…", "taxId": "…" },
  "generatedBy": { "userId": "…", "email": "…", "via": "API | operator-cli" },
  "schemaMigration": "<nombre de la última migración aplicada, de _prisma_migrations>",
  "csvFormulaEscape": true,
  "tables": [ { "model": "Invoice", "file": "datos/Invoice.csv", "rows": 0, "sha256": "…", "excludedColumns": [] } ],
  "files": [ { "model": "Attachment", "id": "…", "path": "adjuntos/…/factura.pdf", "sizeBytes": 0, "sha256": "…", "status": "OK | MISSING | REJECTED_PATH" } ],
  "excludedModels": [ { "model": "UserTwoFactor", "reason": "secreto de verificación en dos pasos" } ]
}
```
Los SHA-256 se calculan **mientras** se escribe cada archivo. El `manifest.json` va **al final** del ZIP. El SHA-256
del ZIP completo (que no puede ir dentro de sí mismo) queda en la bitácora al terminar (4.7).

### 4.4 Prueba de cobertura (no depende de la base de datos)

Recorre `Prisma.ModelName` y el modelo de datos del cliente generado y falla si:
1. Un modelo no está en el registro, o el registro nombra un modelo que no existe.
2. Un modelo `COMPANY` no tiene la columna escalar `companyId`, o un `CHILD` no llega por su relación a un modelo con
   `companyId`.
3. Una columna escalar cuyo nombre coincide con `/password|secret|hash|token|credential|enc$|apikey|privatekey|p12|certificate/i`
   no está en `excludedColumns` **ni** en una lista corta de permitidas con motivo (hoy vacía).
4. Una columna cuyo nombre coincide con `/fileurl|filekey|storagekey|xmlfile/i` no está declarada en `files`.
5. Un modelo `SECRET` aparece en la salida, o una columna excluida no existe (detecta renombres).

El mensaje de error dice qué modelo o columna falta y que **se agregue al registro de la exportación**, para que la IA
del paquete que la creó (A1, N2a, N3…) lo arregle en su propio PR.

### 4.5 Memoria y rendimiento

- **Instantánea coherente:** las tablas se leen dentro de una transacción `RepeatableRead` de **solo lectura**
  (`SET TRANSACTION READ ONLY` al empezar), con tiempo máximo de 30 min. Así las líneas siempre cuadran con sus
  facturas aunque alguien trabaje mientras tanto.
- **Por páginas:** cada tabla se lee de **1 000 filas** a la vez ordenando por `id` con cursor (`id > último`).
  Nunca `findMany()` sin `take`.
- **Lista de archivos:** mientras se recorre `Attachment` (y futuros modelos con `files`), se guarda solo
  `{ id, clave, nombre }` de cada archivo.
- **Archivos después de la transacción:** se cierra la transacción y se agregan los archivos **de a uno**
  (`FileStorage.read`, como mucho `MAX_UPLOAD_MB` en memoria), cada uno como un flujo que se lee **solo cuando `yazl`
  llega a él**. Si un archivo ya no está → `status: 'MISSING'` y se sigue.
- **Compresión:** los CSV se comprimen; los adjuntos (PDF, JPG, PNG ya comprimidos) se guardan sin comprimir.
- **Una a la vez:** un semáforo en el servicio permite **una** exportación simultánea por instancia; la segunda recibe
  429 «Ya hay una exportación en curso. Espera unos minutos y vuelve a intentarlo.» con `Retry-After: 60`.
- **Si el cliente corta la descarga:** se detiene la lectura, se cierra la transacción y se registra el fallo (4.7).
- **Meta medible (6.5):** el crecimiento de memoria durante una exportación queda por debajo de **100 MB**, aunque el
  ZIP pese varias veces eso.
- **Cabeceras:** `Content-Type: application/zip`, `Content-Disposition: attachment; filename="…"`,
  `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`; sin `Content-Length` (va por partes).

### 4.6 Endpoints, permisos y frecuencia (módulo nuevo `src/data-export/`)

| Ruta | Protección | Cuerpo | Respuesta | Errores |
|---|---|---|---|---|
| `GET /data-export/summary` | JWT + `@Roles(ADMIN)` | — | `{ tables: [{ model, rows }], files: { count, totalBytes }, estimatedBytes, limits: { perHour: 3 } }` (conteos con `count` y suma de `sizeBytes`; sin leer archivos) | 403 a otros roles |
| `POST /data-export` | JWT + `@Roles(ADMIN)` | `{ password, code?, purpose?: 'ON_DEMAND' \| 'CANCELLATION' }` (`code` obligatorio si el ADMIN tiene 2FA) | El ZIP en flujo | 401 «La clave actual no es correcta» / código (con `passwordRules` y `twoFactorRules`); 429 «Ya hiciste 3 exportaciones en la última hora. Intenta de nuevo en N minuto(s).»; 429 «Ya hay una exportación en curso…»; 403 |

- POST (y no GET) porque lleva la confirmación en el cuerpo. Tiene `@Roles(ADMIN)`, así que no entra en la lista de
  escrituras abiertas.
- **Frecuencia:** `AttemptLimiter` con la clave `export:company:<companyId>`, límite 3, ventana 60 min; se registra al
  **empezar** (con un comentario: aquí el limitador cuenta exportaciones, no fallos). El 429 lo lanza el servicio con
  su propio texto y `Retry-After`.
- **«Lecturas restringidas»** de `security.e2e-spec.ts` pasa a esperar
  `['/data-export/summary -> ADMIN', '/feedback/ -> ADMIN', '/users/ -> ADMIN', '/users/:id -> ADMIN']`.
- `AttachmentsModule` exporta `FILE_STORAGE` (una línea en `exports`); `DataExportModule` importa `AttachmentsModule`
  y `AuthModule`; `app.module.ts` suma una línea.

### 4.7 Bitácora de la exportación

| Momento | `action` | `entityName` / `entityId` | `changes` |
|---|---|---|---|
| Al empezar (transacción propia, **antes** de enviar el primer byte) | `CREATE` | `DataExport` / `exportId` | `{ event: 'DATA_EXPORT_STARTED', purpose }` + IP y navegador con `meta` |
| Al terminar bien | `UPDATE` | `DataExport` / `exportId` | `{ event: 'DATA_EXPORT_COMPLETED', bytes, sha256, rows, files, missingFiles }` |
| Si falla o el cliente corta | `UPDATE` | `DataExport` / `exportId` | `{ event: 'DATA_EXPORT_FAILED', reason: 'CLIENT_ABORTED' \| 'ERROR' }` (sin detalles internos) |

Se registra **antes** de empezar a propósito: si algo sale a medias, igual consta que se intentó sacar los datos.

### 4.8 Exportación al cancelar el servicio

1. **El cliente avisa que se va** → Carlos le pide al ADMIN que descargue desde la pantalla, eligiendo «Me voy del
   servicio» (`purpose: 'CANCELLATION'`, que solo cambia el texto del manifiesto y la bitácora).
2. **Si la empresa ya está desactivada** o el ADMIN no puede entrar → el operador ejecuta en el servidor:
   `docker compose … exec -T api node dist/cli/data-export.js --rnc <RNC> --as <correo de un ADMIN de esa empresa>
   --purpose CANCELLATION > exportacion.zip`. Usa el **mismo** servicio, escribe el ZIP en la salida estándar (nada
   queda dentro del contenedor) y los mensajes en la salida de errores. La bitácora lleva `via: 'operator-cli'`.
3. El ZIP se entrega por un canal seguro que defina Carlos (no por correo sin cifrar). El documentador escribe el paso
   a paso.
4. **Qué pasa después con los datos** (cuánto tiempo se guardan y cuándo se borran) es la pregunta D45; el borrado no
   forma parte de S2.

### 4.9 Seguridad de las rutas de archivos

- Antes de leer, se exige que la clave empiece por `<companyId>/` de la empresa que exporta. Si no →
  `status: 'REJECTED_PATH'`, no se lee, y se deja un aviso en el log del servidor (sin la ruta completa).
  `LocalFileStorage.pathOf` sigue impidiendo salir de la carpeta raíz.
- Los nombres dentro del ZIP son siempre `adjuntos/<id>/<sanitizeFileName(nombre)>`: nunca `..` ni rutas absolutas.

---

## 5. Pantallas (S4) — lo que el diseño exige

Con el kit propio (`styles.css`, `shared/ui`), **sin Tailwind ni librerías de UI**, y con el checklist de la Guía de
producto §6 (migas, línea de propósito, `app-field-help`, `app-error-notice`, «?», 375 px, teclado).

1. **Login, paso 2** (`features/auth/login.ts`, `core/auth.ts`): si la respuesta trae `twoFactorRequired`, pedir
   «Código de 6 dígitos de tu aplicación» (`inputmode="numeric"`, `autocomplete="one-time-code"`), con el enlace «Usar
   un código de emergencia». El desafío vive en una señal en memoria; si vence, volver a la clave con el mensaje del
   servidor. Probar también el login **sin** 2FA.
2. **Inscripción obligatoria en el login** (`twoFactorSetupRequired`): explicar por qué («Tu empresa exige este paso
   para los administradores»), mostrar el QR (E3), pedir el código (E2) y mostrar los códigos de emergencia antes de
   entrar.
3. **«Seguridad de mi cuenta»** (en `features/admin/profile.ts` o en una pantalla propia, a criterio de S4 con el
   mismo kit): estado (E4); Activar (clave → QR + secreto con «Copiar» → código → códigos de emergencia); Cambiar de
   teléfono; Regenerar códigos; Desactivar (oculto si `requiredForMyRole`).
4. **Códigos de emergencia:** se muestran **una sola vez**, con «Copiar», «Descargar .txt» (Blob en el navegador) y
   el aviso «Guárdalos ahora: no se vuelven a mostrar». No se guardan en `localStorage`.
5. **Usuarios (ADMIN)** (`features/admin/users.ts`): columna «Verificación en dos pasos: Activada / No» con
   `twoFactorEnabled`, y la acción «Restablecer verificación» con un diálogo que explica el efecto y pide la clave (y
   el código) del ADMIN.
6. **«Exportar todos mis datos»** (Configuración, solo ADMIN, ruta con `roleGuard('ADMIN')`): qué incluye y qué no,
   tamaño estimado (`summary`), aviso de que el archivo contiene datos sensibles, confirmación con clave (y código),
   casilla «Me voy del servicio», botón único y estado de descarga. Hace falta una variante de `Api.download` **por
   POST** que guarde el Blob con el nombre de `Content-Disposition`.
7. **Errores:** cada texto nuevo del servidor (3.7, 4.6) tiene su patrón en `ayuda.json` → `errores` con «cómo
   arreglarlo».
8. **nginx** (`frontend/deploy/nginx.conf`): agregar `location ^~ /api/auth/login/` con el mismo tope de 8 KB que
   `/api/auth/login`. Se avisa a seguridad. La CSP **no** cambia.

---

## 6. Pruebas exigidas (vitest; esqueleto de `test/financial-ratios.e2e-spec.ts`: `createApp({ silent: true })`, dos empresas con sufijo, `bcrypt.hash(…, 4)`, limpieza en `afterAll`)

### 6.1 Unidad (S1)
- **`src/auth/two-factor/totp.spec.ts`:** RFC 4226, apéndice D (secreto ASCII `12345678901234567890`, contadores 0–9 →
  `755224, 287082, 359152, 969429, 338314, 254676, 287922, 162583, 399871, 520489`). RFC 6238, apéndice B, SHA1, en
  6 dígitos (los 6 últimos de los 8 oficiales): T=59 → `287082`; 1111111109 → `081804`; 1111111111 → `050471`;
  1234567890 → `005924`; 2000000000 → `279037`; 20000000000 → `353130`. Base32 de RFC 4648 §10 (`f`, `fo`, `foo`,
  `foob`, `fooba`, `foobar`) ida y vuelta. Ventana ±1 sí, ±2 no. Entrada de 5 o 7 dígitos → no es TOTP.
- **`secret-box.spec.ts`:** ida y vuelta; un byte cambiado en el cifrado o la etiqueta → error; otro AAD → error;
  descifra con `…_PREVIOUS`; `kid` desconocido → error explícito; el texto cifrado no contiene el secreto.
- **`recovery-codes.spec.ts`:** formato `XXXX-XXXX-XXXX-XXXX` con el alfabeto Crockford; 10 distintos; normaliza
  minúsculas, espacios, `O/I/L`; rechaza `U` y largos distintos de 16.

### 6.2 `test/two-factor.e2e-spec.ts` (S1)
- **Sin 2FA:** el login devuelve exactamente `{ access_token, user }`, como hoy.
- **Activar:** sin clave → 400; clave mala → 401; 5 claves malas → 429. Bien → `otpauthUri` con issuer, SHA1, 6 y 30;
  `qrCode` empieza por `data:image/svg+xml;base64,`; `secret` de 32 caracteres Base32; `Cache-Control: no-store`. En la
  BD `pendingSecretEnc` empieza por `v1:` y no contiene el secreto (ni en Base32 ni en hexadecimal). `enable` con
  código malo → 401; bien → nuevo `access_token` + 10 códigos; el token anterior da 401 en `GET /auth/me`; en la BD hay
  10 `codeHash` de 64 caracteres hexadecimales y ninguno es igual a un código. `enable` sin `setup` o con el pendiente
  vencido (reloj +16 min) → 422.
- **Login con 2FA:** paso 1 → `twoFactorRequired` + `challengeToken`, sin `access_token` ni `user`. El desafío usado
  como `Bearer` en `GET /auth/me` → 401; un `access_token` válido usado como desafío → 401. Código correcto → token. El
  mismo código con un desafío nuevo → 401 (anti-reuso). Reloj simulado: código de T−1 no usado → 200; T−2 → 401; T+1
  → 200; T+2 → 401. Desafío vencido (+6 min) → 401 con «La verificación venció». Clave cambiada entre el paso 1 y el
  2 → 401. Usuario o empresa desactivados entre los pasos → 401. `challengeToken` de más de 2 048 caracteres → 400.
- **Límites:** 5 códigos malos → 429 con `Retry-After`, y el 6.º, aunque sea correcto, también 429; queda **una**
  bitácora `TWO_FACTOR_LOCKED_OUT`. 20 fallos en el día bloquean aunque pasen 15 min.
- **Concurrencia:** dos peticiones simultáneas con el mismo TOTP → una 200 y otra 401; lo mismo con el mismo código
  de recuperación.
- **Códigos de recuperación:** entrar con uno → 200, `recoveryCodesRemaining: 9`, bitácora `LOGIN` con
  `RECOVERY_CODE`; el mismo otra vez → 401; en minúsculas, con espacios y con `O` en lugar de `0` → acepta.
  Regenerar exige clave y código; los viejos dejan de servir; queda en la bitácora.
- **Cambiar de teléfono:** `setup` con 2FA activo sin código → 401; con código → QR nuevo; `enable` reemplaza; el
  código de la app vieja → 401; los códigos de recuperación viejos → 401.
- **Desactivar:** exige clave y código; después se entra solo con clave; los tokens viejos → 401; bitácora.
- **Restablecer por ADMIN:** ADMIN de A restablece a un usuario de A (con su clave) → 200; el usuario entra solo con
  clave; sus tokens previos → 401; bitácora `UPDATE` `TWO_FACTOR_RESET` con `userId` del ADMIN y `entityId` del
  usuario. Usuario de B → 404. ACCOUNTANT, APPROVER y VIEWER → 403. A sí mismo → 422. Clave del ADMIN mala → 401.
  Usuario sin 2FA → 422. **`reset-password` del ADMIN sobre un usuario con 2FA no quita el 2FA** (sigue pidiendo código).
- **Política** (segunda app creada con `TWO_FACTOR_REQUIRED_ROLES=ADMIN` en `process.env` antes de `createApp`): ADMIN
  sin 2FA → `twoFactorSetupRequired`; `enroll` → QR; `login/2fa` con código → token + 10 códigos + bitácora
  `LOGIN_ENROLL`; ese ADMIN no puede desactivar (422); un ACCOUNTANT sin 2FA entra como hoy. Con la política activa y
  sin llave, la app no arranca.
- **Sin llave de cifrado** (política vacía): `setup` → 503; un usuario con 2FA entra con un código de recuperación.
- **Nada se filtra:** se juntan todos los cuerpos de respuesta del archivo y ninguno contiene `secretEnc`,
  `pendingSecretEnc`, `codeHash`, `lastUsedStep` ni el prefijo `v1:`; `GET /users` solo suma `twoFactorEnabled`;
  ningún `AuditLog.changes` contiene el secreto ni un código.
- **`security.e2e-spec.ts`** en verde con las listas de 3.14. **Las suites del socio siguen en verde sin cambios.**

### 6.3 `test/data-export.e2e-spec.ts` (S2)
- **Permisos:** sin token → 401; ACCOUNTANT, APPROVER y VIEWER → 403 en `summary` y en `POST`; clave mala → 401;
  ADMIN con 2FA sin código → 401.
- **Datos de dos empresas** con al menos una fila en **cada** modelo del registro (facturas con líneas y
  retenciones, pagos con asignaciones, asientos con líneas, banco con movimientos y conciliación, presupuesto con
  líneas, adjuntos, comentarios, bitácora, usuarios con y sin 2FA).
- **Aislamiento genérico:** para cada modelo del registro se buscan en la BD los `id` de la empresa B (con el mismo
  filtro) y **ninguno** aparece en los CSV de A. El RNC de B no aparece en ningún archivo del ZIP.
- **Conteos:** `manifest.tables[].rows` = conteo en la BD de A = líneas de datos de cada CSV.
- **Secretos:** `datos/User.csv` no tiene la columna `password`; no existen `UserTwoFactor.csv` ni
  `UserRecoveryCode.csv`; ningún archivo del ZIP contiene `$2b$` (hash bcrypt) ni `v1:` de un secreto.
- **Adjuntos:** el SHA-256 del manifiesto = SHA-256 de los bytes subidos = SHA-256 del archivo dentro del ZIP. Un
  archivo borrado del disco → `MISSING` y la exportación termina. Un `fileUrl` cambiado en la BD a la carpeta de B →
  `REJECTED_PATH`, no se lee.
- **Formato:** `12345678901234.5678` y una tasa `0.000001` salen exactos; fechas ISO; `Json` válido; un texto `=1+1` sale
  como `'=1+1`; un monto negativo sale sin apóstrofo; nulo vacío y texto vacío `""`; el CSV empieza con BOM.
- **Frecuencia:** la 4.ª exportación en la hora → 429 con `Retry-After`; dos simultáneas → la segunda 429.
- **Bitácora:** `CREATE DATA_EXPORT_STARTED` con IP antes del primer byte; `UPDATE DATA_EXPORT_COMPLETED` con `sha256`
  igual al SHA-256 del ZIP descargado. Si el cliente corta, `DATA_EXPORT_FAILED`.
- **Cobertura (4.4):** pasa con el esquema actual; en una prueba de unidad, un registro al que le falta un modelo, una
  columna `fooToken` sin declarar o un `xmlFileUrl` sin `files` → falla con el nombre de lo que falta.
- **Memoria:** con 30 000 líneas de asiento y 24 adjuntos de 5 MB (120 MB), el pico de `rss + arrayBuffers` sube menos
  de **100 MB**; se reporta el valor medido en el PR. Además, una medición manual en pruebas con `docker stats` y una
  empresa ficticia de ≈1 GB.
- **Comando del operador:** la función que usa el CLI genera el mismo contenido (salvo `generatedBy`).
- **`security.e2e-spec.ts`** en verde con la lista de lecturas restringidas de 4.6.

### 6.4 S4 (manual y de unidad)
- Usuario sin 2FA: activa, sale, entra con clave + código; también entra con un código de emergencia y ve cuántos le
  quedan. Usuario sin 2FA entra como siempre.
- Códigos visibles una sola vez, con «Copiar» y «Descargar»; al recargar la página no vuelven a aparecer.
- Código incorrecto, desafío vencido y bloqueo: mensaje en español con cómo arreglarlo (no el texto técnico).
- ADMIN restablece a un usuario desde «Usuarios»; el usuario vuelve a entrar.
- «Exportar» solo aparece para ADMIN; por URL los demás ven «No tienes permiso»; descarga un ZIP que abre en Windows y
  en macOS, y un CSV que abre en Excel con acentos.
- `ng build`, `ng test`, `node scripts/verificar-ayuda.mjs` sin errores; checklist §6 de la Guía en cada pantalla;
  375 px y teclado.

---

## 7. Archivos del socio que se tocan (para avisarle antes)

| Archivo | Paquete | Cambio | Riesgo |
|---|---|---|---|
| `prisma/schema.prisma` (**caliente**) | S1 | 2 modelos al final + 2 líneas de relación en `User` + comentario en `passwordChangedAt` | Medio |
| `prisma/migrations/<fecha>_two_factor/` | S1 | Nueva, solo `CREATE TABLE`/índices/llaves | Bajo |
| `src/auth/auth.service.ts` | S1 | Rama 2FA en `login` (≈25 líneas); `buildAuthResponse` sin cambios de forma | **Alto** (login) |
| `src/auth/auth.controller.ts` | S1 | E2 y E3 | Medio |
| `src/auth/auth.module.ts` | S1 | Controlador y servicio de 2FA; exporta `TwoFactorService` | Bajo |
| `src/auth/attempt-limiter.ts` | S1 | `twoFactorRules` (≈8 líneas) | Bajo |
| `src/auth/strategies/jwt.strategy.ts`, `types/auth-user.ts` | — | **Sin cambios** | — |
| `src/users/users.service.ts`, `users.controller.ts` | S1 | E9 y `twoFactorEnabled` en `list`/`get` | Medio |
| `src/common/audit.ts` | S1 | Parámetro opcional `meta` | Bajo |
| `src/config/env.validation.ts` | S1 | 4 variables (3.3) | Bajo |
| `docker-compose.prod.yml`, `env.production.example`, `env.test.example` | S1 | Pasar y documentar las variables, sin valores reales | Bajo |
| `test/security.e2e-spec.ts` (**caliente**) | S1, S2 | Listas de 3.14 y 4.6 | Medio |
| `package.json` / `package-lock.json` | S1, S2 | `qrcode-generator`, `yazl`; desarrollo: `@types/yazl`, `yauzl`, `@types/yauzl` | Bajo |
| `src/app.module.ts` (**caliente**) | S2 | Una línea (`DataExportModule`) | Bajo |
| `src/attachments/attachments.module.ts` | S2 | Exportar `FILE_STORAGE` | Bajo |
| `frontend/…` (login, auth, perfil, usuarios, rutas de admin, `nav.ts`, `labels.ts`, `ayuda.json`, `api.ts`) y `frontend/deploy/nginx.conf` | S4 | Sección 5 | Medio |
| **Nuevos** | | `src/auth/two-factor/*`, `src/cli/two-factor-reset.ts`, `src/cli/two-factor-rotate-key.ts`, `src/data-export/*`, `src/cli/data-export.ts`, `test/two-factor.e2e-spec.ts`, `test/data-export.e2e-spec.ts` y pruebas de unidad | — |
| Documentación | S3 / documentador | `docs/OPERACION-BACKUPS.md`: la llave del 2FA se guarda junto con la frase (D42); manual de D2 | — |

---

## 8. Orden de despliegue (cada paso con respaldo previo y permiso de Carlos)

0. Anexo aprobado (revisor-critico, seguridad, Carlos) y respuestas a D41–D46.
1. **S1:** fusionar → respaldo → Claude genera `TWO_FACTOR_ENCRYPTION_KEY` en `.env.production` **sin imprimirla** y
   Carlos guarda una copia junto con la frase de D18 → `migrate deploy` → reiniciar `api`. **Política vacía.**
   Comprobar que las contadoras entran igual que antes.
2. **S2:** fusionar → desplegar (no tiene migración) → exportar la empresa ficticia y medir memoria con `docker stats`.
3. **S3** (en paralelo, cuando estén D17 y D18).
4. **S4:** fusionar → desplegar `web` (con el cambio de nginx).
5. **Encender la política** (si D41 = sí): `TWO_FACTOR_REQUIRED_ROLES=ADMIN` y reiniciar `api`. Los ADMIN se inscriben
   en su siguiente entrada. **Nunca antes de S4**: sin las pantallas, un ADMIN no podría entrar. Las sesiones ya
   abiertas duran como mucho 8 h.
6. **Tarea 3.5:** qa (e2e y restauración), seguridad (auditoría completa, NTP del servidor, regla de datos reales),
   documentador (manual y pasos para Carlos). **Carlos abre la puerta de datos reales.**

---

## 9. Riesgos y deuda

### 9.1 Riesgos
| Riesgo | Impacto | Mitigación |
|---|---|---|
| Un error en el 2FA deja a todos fuera | Grave | Política vacía por defecto; códigos de recuperación; restablecimiento por ADMIN; comando de rescate; se enciende la política solo después de S4 (8) |
| El token intermedio se acepta como sesión | Grave | Otra llave (HKDF) y audiencia propia; prueba e2e en ambos sentidos (6.2) |
| Se pierde la llave de cifrado (servidor nuevo sin `.env`) | Alto | Los códigos de recuperación no dependen de ella; comando de rescate; copia de la llave junto con la frase (D42) |
| Reloj del servidor desfasado | Alto | Ventana ±30 s; seguridad verifica NTP antes de abrir la puerta |
| Fuga entre empresas en la exportación | Grave | Registro con filtros, prueba genérica con dos empresas, verificación del prefijo de archivos, revisión de seguridad |
| Una tabla nueva queda fuera | Alto | Prueba de cobertura (4.4) |
| Un secreto futuro se exporta | Alto | Patrón de nombres + lista de excluidas obligatoria (4.4) |
| La API se queda sin memoria | Alto | Flujo, páginas de 1 000, un archivo a la vez, una exportación a la vez, prueba de memoria |
| Un token de ADMIN robado (p. ej. por XSS, el token está en `localStorage`) | Alto | Restablecer 2FA y exportar exigen clave y código; el resto de lo que puede hacer un ADMIN no cambia con este anexo |
| El ADMIN cambia la clave de un usuario sin 2FA y entra como él | Medio (ya existe hoy) | Fuera del alcance; relacionado con D19 de la v0.2; con la política, los ADMIN tienen 2FA |
| El archivo exportado se pierde en el equipo del cliente | Medio | Aviso en pantalla y en `LEEME.txt`; solo ADMIN; bitácora |
| Excel cambia RNC/NCF (quita ceros) al abrir el CSV | Bajo | El archivo no cambia; `LEEME.txt` explica cómo importarlo como texto |

### 9.2 Deuda (decisiones tomadas con los ojos abiertos)
1. Límites de intentos en memoria (se reinician con la API; por instancia).
2. `passwordChangedAt` se usa también para «cerrar sesiones por 2FA» (nombre impreciso, comentado).
3. Sin avisos por correo de eventos de seguridad (no hay servidor de correo).
4. La descarga del ZIP pasa por la memoria del navegador (Blob). Para exportaciones de varios GB habrá que pasar a un
   enlace de descarga de un solo uso.
5. La exportación no va cifrada con contraseña (el ZIP estándar no lo permite de forma segura).
6. Sin passkeys/llaves físicas (WebAuthn): candidato para la v0.4.
7. El rescate del único ADMIN depende de acceso al servidor.

---

## 10. Preguntas para Carlos (con mi recomendación)

| # | Pregunta | Recomendación | Por qué importa |
|---|---|---|---|
| **D41** | ¿El 2FA es **obligatorio para los ADMIN**? ¿Y para los demás? | **Sí para ADMIN**, a partir de que salgan las pantallas (S4) y antes de datos reales. **Voluntario** para los demás, con aviso que lo recomienda | El ADMIN puede crear usuarios, cambiar claves y descargar **todo**: es la cuenta que un intruso buscaría. Para los demás, obligarlo desde el día uno sube el soporte |
| **D17** (v0.2) | ¿Dónde va la copia de los respaldos fuera del servidor? | **Backblaze B2** con cifrado antes de subir (centavos al mes con este volumen), u otro proveedor distinto de Contabo | Si el servidor se pierde, hoy se pierden también los respaldos |
| **D18** (v0.2) | ¿Quién guarda la frase secreta de los respaldos? | **Tú**, en un gestor de claves y en papel en un lugar seguro | Sin la frase, los respaldos no se pueden abrir |
| **D42** | ¿Guardamos la **llave del 2FA** junto con esa frase? | **Sí**, en el mismo lugar y del mismo modo | Si se restaura en otro servidor sin la llave, los teléfonos de todos dejan de servir hasta reinscribirse |
| **D43** | Si el **único ADMIN** de una empresa pierde el teléfono y los códigos, ¿quién autoriza el rescate y cómo se confirma que es él? | **Solo tú lo autorizas**, tras confirmar por una llamada al teléfono que el cliente registró y por su correo; queda en la bitácora. Y pedir a cada cliente **dos ADMIN** | Es la puerta trasera del 2FA: si cualquiera puede pedirla por chat, el 2FA no protege nada |
| **D44** | ¿Apruebas dos librerías pequeñas: `qrcode-generator` (dibujar el QR) y `yazl` (armar el ZIP)? | **Sí** (sección 2) | La regla del plan exige tu visto bueno para cada librería nueva |
| **D45** | Cuando un cliente se va: después de entregarle la exportación, ¿cuánto tiempo guardamos sus datos y cuándo se borran? | **90 días** y luego borrado con constancia, salvo pedido del cliente o requisito legal; confirmarlo con tu abogado o contadora | Es parte del contrato y de la Ley 172-13; no bloquea S1 ni S2 |
| **D46** | ¿Qué nombre aparece en la aplicación del teléfono? | El nombre comercial del producto (si no lo hay aún, «Finanzas») | Es lo que el usuario ve para reconocer la cuenta |
| — | ¿Doy por bueno actualizar la tarea 0.3 de `docs/PLAN-v0.2.md` (11)? | **Sí** | La ficha S0 exige tu visto bueno para tocar ese plan |

---

## 11. Pendientes y hallazgos

- **Revisiones:** este anexo debe pasar por **revisor-critico** y **seguridad** antes de ir a Carlos (ficha S0, paso 6).
  No lo apruebo yo.
- **Tarea 0.3 de `docs/PLAN-v0.2.md` — no se modificó** (la ficha S0 §4 exige el visto bueno de Carlos). Texto
  propuesto para la fila: «| 0.3 | devops | **Respaldos** (11.2): servicio y restauración ensayada (hechos, `2672217`).
  **Cifrado, copia externa y aviso de fallo pasan a la Fase 3 de la v0.3 (tarea 3.3, paquete S3)**; esperan D17 y D18 | L |».
- **Hallazgo en la ficha S3 §4:** dice «No hay `docker-compose*.yml` en este repositorio», pero `docker-compose.yml`,
  `docker-compose.prod.yml` y `docker-compose.pruebas.yml` **sí están** en la raíz del repo. Conviene corregir la ficha.
- **D33** (quién valida los valores fiscales) es parte de la tarea 0.5 del plan, pero no de la ficha S0: sigue pendiente aparte.
- Números D41–D46: propuestos como continuación de la sección 16 de PLAN-v0.3; si ya se usaron, se renumeran.

---

## Anexo A — Las 18 decisiones (para el PR)

| # | Tema | Decisión | Sección |
|---|---|---|---|
| 1 | Método y librería | TOTP RFC 6238 propio con `node:crypto`; plan B `otpauth` | 2.1, 3.4 |
| 2 | Secreto | AES-256-GCM, llave propia `TWO_FACTOR_ENCRYPTION_KEY`, AAD por usuario, `kid` y rotación con comando | 3.5 |
| 3 | Códigos de recuperación | 10 × 80 bits, `XXXX-XXXX-XXXX-XXXX`, SHA-256, uso único atómico, se muestran una vez | 3.6 |
| 4 | Login en dos pasos | Desafío JWT con llave HKDF, 5 min (10 para inscribirse), solo en `/auth/login/2fa` y `/enroll` | 3.8 |
| 5 | Límites | `AttemptLimiter`: 5/15 min y 20/24 h por usuario, 40/15 min por IP | 3.11 |
| 6 | Reuso y reloj | ±1 paso de 30 s; `lastUsedStep` con actualización atómica | 3.4 |
| 7 | Obligatorio para ADMIN | **Pregunta D41** (recomiendo sí); variable `TWO_FACTOR_REQUIRED_ROLES`, vacía por defecto | 3.3, 10 |
| 8 | Restablecer por ADMIN | E9 con clave (y código) del ADMIN, misma empresa, no a sí mismo, cierra sesiones, bitácora; rescate por CLI | 3.10 |
| 9 | Dónde se guarda | Tablas `UserTwoFactor` y `UserRecoveryCode` con cascada | 3.2 |
| 10 | Acciones de bitácora | Reutilizar `UPDATE`/`LOGIN`/`CREATE` + `changes.event`; `writeAudit` con `meta` opcional | 3.12 |
| 11 | «Política de rutas» | Listas explícitas actualizadas; rutas propias bajo `/users/me/two-factor` | 3.14 |
| 12 | QR y CSP | SVG como `data:` desde el backend; CSP sin cambios | 3.15 |
| 13 | Qué se exporta | Todo lo de la empresa + adjuntos + XML + bitácora; sin claves, credenciales ni 2FA | 4.1, 4.2 |
| 14 | Formato | ZIP: CSV por tabla, `adjuntos/`, `xml/`, `LEEME.txt`, `manifest.json` con SHA-256 | 4.3 |
| 15 | Tablas futuras | Registro único + prueba de cobertura contra el esquema | 4.4 |
| 16 | Memoria | En flujo, páginas de 1 000, un archivo a la vez, una exportación a la vez, < 100 MB de crecimiento | 4.5 |
| 17 | Permisos, frecuencia, bitácora | Solo ADMIN con clave (y código); 3 por hora y 1 a la vez; bitácora al empezar y al terminar | 4.6, 4.7 |
| 18 | Al cancelar | Misma exportación con `purpose: CANCELLATION`; CLI del operador si la empresa está desactivada; conservación posterior = D45 | 4.8 |

# Anexo S0 — Verificación en dos pasos (2FA) y exportación completa de datos

> **Versión 1.1 · 2026-10-12 · Autor: Arquitecto · Estado: corregido tras dos revisiones** (revisor-critico: aprobar
> con cambios; seguridad: programable con cambios). Falta la aprobación de Carlos. Paquete S0 (`docs/paquetes/S0.md`),
> tarea 0.5 de `docs/PLAN-v0.3.md`.
> **Manda sobre las fichas S1, S2, S3 y S4.** Si una ficha y el anexo no coinciden, vale el anexo. Si el anexo no dice
> algo, el desarrollador **para y pregunta** (PAQUETES-DE-TRABAJO §1, regla 10). Nada se programa antes de la
> aprobación.
> Documentos que mandan: `CLAUDE.md`, `docs/GUIA-PRODUCTO.md` (P7, P10), `docs/GUIA-CONTABLE-FISCAL.md` (R3, R5, R12).

## Qué cambió (v1.0 → v1.1)

Cada punto se verificó en el código antes de aplicarlo. RC = revisor-critico, SEG = seguridad.

| # | Hallazgo (verificado) | Cambio | Dónde |
|---|---|---|---|
| G1 (RC) | `AttemptLimiter` revisa al empezar (`check`) y suma al final (`recordFailure`), después de un `await`: peticiones simultáneas se saltan el límite. La cuenta de 6·10⁻⁵/día no valía | Reserva **antes** de verificar y devolución si acierta: `consume`/`refund` en memoria para la IP, y contadores **en la base** para el usuario | 3.11 |
| A2 (SEG) | El contador del 2FA vivía en memoria (se borra al reiniciar) | Contadores del 2FA en `UserTwoFactor`, con actualización atómica y bloqueo creciente; en memoria solo la regla por IP, con IPv6 agrupado por /64 | 3.2, 3.11 |
| G1b (RC) | El mismo fallo existe en el login y en el cambio de clave (`auth.service.ts`, `users.service.ts`) | S1 los pasa a `consume`/`refund` en un commit aparte, con aviso al socio | 3.11, 7 |
| G2 (RC) | Con un token de ADMIN robado se puede crear otro ADMIN (`RegisterDto.role`), ascender a alguien (`UpdateUserDto.role`) o cambiar una clave sin confirmar nada | Confirmación reforzada (clave y, si lo tiene, código) en crear ADMIN, ascender a ADMIN, cambiar el correo de un ADMIN, `reset-password`, E9 y la exportación. Bitácora y vista «Cambios de seguridad». Ascender cierra las sesiones del ascendido | 3.10b, 3.12, 5 |
| G3 (RC) | `frontend/src/app/core/auth.interceptor.ts:18` cierra la sesión ante **cualquier** 401 que no venga de `/auth/login`. También pasa hoy al escribir mal la clave actual en «Cambiar clave» | En rutas con sesión, una clave o un código mal escritos dan **422**; 401 queda solo para «sesión inválida». `change-password` pasa de 401 a 422 | 3.7, 7 |
| G4 (RC) | La exportación entregaría al ADMIN los papeles de trabajo de la auditora (PLAN-v0.2 §13.1 y D3; R5) | Clases `ROW_FILTERED` y `EXCLUDED_ROLE` en el registro. Pregunta D47 a Carlos | 4.2, 10 |
| G4b (RC) | Prisma 7 (`prisma-client`) no publica `Prisma.dmmf`. Sí publica `Prisma.ModelName` y `Prisma.<Modelo>ScalarFieldEnum` (verificado en `src/generated/prisma/internal/prismaNamespace.ts`) | Fuente exacta de modelos y columnas. La prueba de cobertura lee además `prisma/schema.prisma` para tipos `Json` y relaciones | 4.2, 4.4 |
| G4c (RC) | El patrón de secretos coincide con `User.passwordChangedAt` | Lista de permitidas definida desde ya, con motivo | 4.4 |
| G4d (RC) | `AuditLog.changes` se exporta entero | Regla: `writeAudit` nunca guarda secretos en `changes`. La prueba lo busca | 3.12, 6 |
| A3/M8 | Quien tenga la clave de un ADMIN sin 2FA podría inscribir su propio teléfono primero | Antes de encender la política: activación acompañada y un comando que lista a los ADMIN sin 2FA. La inscripción en el login solo vale para cuentas nuevas o recién restablecidas (72 h). Se muestran la fecha y la IP de activación | 3.8, 3.10, 8 |
| M6 (SEG) | `hkdfSync` devuelve `ArrayBuffer`. Pasado tal cual como llave, podría convertirse en el texto `"[object ArrayBuffer]"` | `Buffer.from(hkdfSync(…))`; se verifican `typ`, `sub` y `aud`; tres pruebas de rechazo; se quita el `jti` | 3.8, 6.2 |
| M1 | nginx y NPM guardan la respuesta en archivos temporales (hasta 1 GB). «No deja copias en disco» era falso | `X-Accel-Buffering: no`, `location = /api/data-export` con `proxy_buffering off`, revisión de NPM (devops) | 4.5, 5, S3 |
| M2 | El comando de exportación compartía los 768 MB con la API | `docker compose run --rm` (otro contenedor). Carpeta fija, `umask 077`, borrado al entregar, `--motivo` obligatorio | 4.8 |
| M3/M4s | Faltaba precisar la transacción por partes, el cliente lento y el semáforo | Ciclo de vida completo: semáforo global en `try/finally`, transacción de 30 min, tope total de 45 min, corte si el cliente no lee en 60 s | 4.5 |
| M4 | supertest guarda toda la respuesta en memoria: la prueba de memoria no medía nada | `app.listen(0)` + `fetch` en flujo hacia un hash y un archivo temporal | 6.3 |
| M5 | `ConfigModule.forRoot({ validate })` valida al importar `app.module` (`src/app.module.ts:25`) | «No arranca sin la llave» se prueba llamando a `validate()`; la política se inyecta en las pruebas con `requiredRoles()` | 3.3, 6.2 |
| M6b | Una llave distinta tras una mudanza (`kid` desconocido) daba error 500 | 503 con el aviso de usar un código de emergencia; devops confirma si el respaldo general incluye `.env.production` | 3.3, S3 |
| M7 | Con la clave, un atacante bloquea al dueño un día entero | Los códigos de emergencia tienen su propio límite; E9 y `reset-password` limpian los contadores | 3.11 |
| M5s (SEG) | La bitácora se podía modificar. Un `DELETE` también, pero **19 archivos de e2e del socio** borran `AuditLog` en su limpieza (verificado) | Migración aparte con un disparador que rechaza **UPDATE** en `AuditLog`; el DELETE queda como deuda. El rescate escribe además en el log del servidor; registro agregado de fallos; la bitácora muestra `via: operator-cli` | 3.12, 9.2 |
| M7s (SEG) | `AttachmentsService.download` lee `row.fileUrl` sin comprobar su forma. Los archivos de auditoría usan otra forma (`<companyId>/auditing/<uuid>`, PLAN-v0.2 §5.1) | Patrón exacto por tipo de archivo, también en `download`; prueba con `..` | 4.9 |
| M2s (SEG) | `change-password` no pide el código a quien tiene 2FA | Lo pide; prueba | 3.9 |
| M9 | Algunas decisiones no llegaban a Carlos | D41–D48 completas: canal de entrega, el operador es Carlos por SSH, soporte del rescate, conservación de 10 años, librerías de desarrollo, «el teléfono del contrato» | 10 |
| B1 | Ya existen `neutralize` (`chart-of-accounts.rules.ts:90`), `sanitizeFileName` y `contentDisposition` (`file-type.ts`) | Se reutilizan; el nombre del ZIP pasa por `contentDisposition()` | 4.3 |
| B2 | Nombres peligrosos dentro del ZIP | Se quitan U+202A–202E y U+2066–2069, nombres reservados de Windows y puntos o espacios finales | 4.3 |
| B3 | Los adjuntos CSV o TXT del cliente salen tal cual | Aviso en `LEEME.txt` | 4.3 |
| B4 | La regresión de `companyId` no ve `updateMany`/`deleteMany` | Prueba propia para las tablas nuevas | 6.2 |
| B5 | Al cambiar de teléfono, el `lastUsedStep` del secreto viejo podía rechazar el primer código del nuevo | Al confirmar un secreto nuevo, `lastUsedStep` se fija sin comparar con el anterior | 3.4 |
| B6 | En pruebas hay dos proxies (NPM → nginx `web` → API) y `docker-compose.prod.yml` usa `TRUST_PROXY` 1 por defecto | Exigir `TRUST_PROXY=2` en pruebas y documentarlo (devops lo verifica sin imprimir el `.env`) | 3.11, 8, S3 |
| B7 | §0 y §10 no coincidían en D18, D42 y D45 | Alineados | 0, 10 |
| B8 | E3 existía «solo si hay política» | E3 existe siempre | 3.7 |
| B9 | Rotación de llave y `…_PREVIOUS`: más trabajo del necesario hoy | Queda para el futuro; S1 solo deja el formato `v1:<kid>:…` | 3.5, 9.2 |
| B10 | P7 | Indicador de pasos, qué aplicación instalar y el camino «Perdí mi teléfono» | 5 |
| B11 | Las ≈56 llamadas actuales a `writeAudit` siguen sin IP | Anotado como deuda | 9.2 |

## Índice
0. Resumen para Carlos · 1. Lo que hay hoy en el código · 2. Librerías · 3. 2FA · 4. Exportación completa ·
5. Pantallas (S4) · 6. Pruebas exigidas · 7. Archivos del socio que se tocan · 8. Orden de despliegue ·
9. Riesgos y deuda · 10. Preguntas para Carlos · 11. Pendientes y hallazgos · Anexo A: las 18 decisiones

---

## 0. Resumen para Carlos (una página)

**Qué se construye.**
1. **Verificación en dos pasos (2FA).** Además de la clave, la persona escribe un número de 6 dígitos que cambia cada
   30 segundos en una aplicación gratuita del teléfono (Google Authenticator, Microsoft Authenticator…). Si le roban
   la clave, no pueden entrar sin el teléfono. Al activarla recibe **10 códigos de emergencia** de un solo uso. Si
   los pierde también, **otro ADMIN** de su empresa le restablece el 2FA. Si es el **único ADMIN**, lo restableces tú
   desde el servidor con un comando, y queda anotado.
2. **Acciones delicadas con confirmación.** Crear o ascender un administrador, cambiar la clave de otro, quitarle el
   2FA o descargar todos los datos piden **la clave y el código** de quien lo hace. Así, alguien que robe una sesión
   abierta no puede adueñarse de la empresa.
3. **Exportación completa.** El ADMIN descarga en un `.zip` **todos** los datos de su empresa: una hoja CSV (se abre
   en Excel) por tabla, todos los adjuntos y, cuando existan, los XML de las facturas electrónicas. Trae un índice con
   huellas digitales (SHA-256) para comprobar que nada se alteró. Nunca incluye claves ni datos de otra empresa.

**Qué cuesta:** S1 ≈3–4 días (creció por las confirmaciones y los contadores en la base), S2 ≈2–3 días, S4 ≈1,5
días, más pruebas y revisión de seguridad (Fase 3 del plan v0.3). **Dos librerías nuevas** pequeñas en el programa y
tres solo para las pruebas (D44).

**Lo que decides tú (sección 10):** D41 (¿2FA obligatorio para los ADMIN? recomiendo **sí**); D17 (dónde va la copia
externa); D18 + D42 (quién guarda la frase de los respaldos **y la llave del 2FA**: recomiendo tú, en el mismo lugar);
D43 (quién autoriza el rescate del único ADMIN: recomiendo **solo tú**); D44 (librerías); D45 (cuánto guardamos los
datos de un cliente que se va); D46 (nombre en la aplicación del teléfono); D47 (**¿los papeles de la auditora salen en
la exportación del dueño?** recomiendo **no**); D48 (cómo se entrega la exportación a un cliente que se va).

---

## 1. Lo que hay hoy en el código (verificado el 2026-10-12)

| Pieza | Hoy | Consecuencia |
|---|---|---|
| Login (`src/auth/auth.service.ts`, `login`) | Límite de intentos antes de tocar la BD; **hash falso** si el usuario no existe (mismo tiempo); 401 `Credenciales inválidas`; limpia `loginPairKey`; `lastLoginAt`; `buildAuthResponse` → `{ access_token, user }` | El 2FA entra después de validar la clave y antes de `lastLoginAt` y del token. Sin 2FA, la respuesta no cambia |
| `JwtStrategy.validate` | Acepta **cualquier** JWT HS256 firmado con `JWT_SECRET` que tenga `sub`; rechaza usuario o empresa inactivos y tokens con `iat` anterior a `passwordChangedAt` | El desafío se firma con **otra llave** (3.8). Este archivo no se toca |
| `AttemptLimiter` | En memoria, por instancia; `check()` al empezar y `recordFailure()` al final, después de `await bcrypt.compare` | **Se puede saltar con peticiones simultáneas** (G1). 3.11 |
| `UsersService` | `resetPassword`/`changePassword` ponen `passwordChangedAt = now`. `changePassword` responde **401** con la clave actual mala. `update` acepta `role` sin confirmación. `RegisterDto` acepta `role` | Ver 3.9, 3.10b y G3 |
| Interceptor del frontend (`core/auth.interceptor.ts:18`) | Ante un 401 que no venga de `/auth/login`, con sesión abierta, **cierra la sesión** | Las confirmaciones fallidas dan 422 (3.7) |
| `writeAudit` (`src/common/audit.ts`) | No llena `ipAddress` ni `userAgent`, aunque las columnas existen; ≈56 llamadas | Parámetro opcional `meta` (3.12) |
| `AuditAction` | `LOGIN` existe y nadie lo usa | Se reutilizan los valores; ninguno nuevo |
| `AuditLog` en las e2e del socio | 19 archivos de prueba hacen `prisma.auditLog.deleteMany` al limpiar; nada hace `update` | Un disparador puede impedir UPDATE, no DELETE (3.12) |
| «Política de rutas» (`test/security.e2e-spec.ts` ≈321–374) | Sin JWT: solo `POST /auth/login`. Escrituras sin `@Roles`: `PATCH /users/me`, `POST /auth/login`, `POST /users/me/change-password`. Lecturas con roles: `/feedback/`, `/users/`, `/users/:id` | Cambios explícitos (3.14, 4.6) |
| Regresión de `companyId` (≈390) | Solo busca `.update(`/`.delete(` | Prueba propia para `updateMany`/`deleteMany` de las tablas nuevas (6.2) |
| Adjuntos | Clave `<companyId>/<uuid>`; `LocalFileStorage.pathOf` impide salir de la raíz; `download` lee `row.fileUrl` sin comprobar su forma; la auditoría (A4) usará `<companyId>/auditing/<uuid>` | Patrón exacto por tipo (4.9) |
| Utilidades | `neutralize` (`src/chart-of-accounts/chart-of-accounts.rules.ts:90`, incluye `\t` y `\r`); `sanitizeFileName` y `contentDisposition` (`src/attachments/file-type.ts`) | Se reutilizan |
| Prisma 7 (`prisma-client`) | Publica `Prisma.ModelName` y `Prisma.<Modelo>ScalarFieldEnum`; **no** `Prisma.dmmf`; `runtimeDataModel` es interno | Fuente para la exportación (4.2) |
| Configuración | `ConfigModule.forRoot({ isGlobal: true, validate })` (`src/app.module.ts:25`) | 3.3 y 6.2 |
| Memoria y proxies | API `mem_limit: 768m`. nginx `web` delante de la API y NPM delante de `web`. `TRUST_PROXY` vale 1 por defecto en `docker-compose.prod.yml` | 4.5, 4.8 y B6 |
| CSP | `img-src 'self' data: blob:` | QR como `data:` (3.15) |
| Despliegue | `docker-compose.yml`, `docker-compose.prod.yml` y `docker-compose.pruebas.yml` **están en el repo** (la ficha S3 decía que no; ya se corrigió) | Variables nuevas en `docker-compose.prod.yml` |

---

## 2. Librerías (PLAN-v0.2 §2.3 y PLAN-v0.3 §3: toda librería nueva, con justificación escrita)

**Programa:** `qrcode-generator` (QR) y `yazl` (ZIP). **Solo pruebas:** `yauzl`, `@types/yazl` y `@types/yauzl`.
**TOTP:** propio, sin librería. **Frontend:** ninguna. Versiones **fijadas exactas** (sin `^`), `npm audit` limpio y
validación de seguridad. Todo esto requiere el visto bueno de Carlos (D44).

### 2.1 TOTP → **implementación propia con `node:crypto`**
| Opción | Datos (consultados 2026-10-12) | Veredicto |
|---|---|---|
| **Propia** (≈60 líneas: HOTP RFC 4226 + TOTP RFC 6238 + Base32 RFC 4648, con `createHmac`, `randomBytes`, `timingSafeEqual`) | Sin dependencias | **Elegida.** Algoritmo corto y fijo, con vectores de prueba oficiales (6.1). La parte delicada (ventana, anti-reuso, límites) es nuestra de todos modos |
| `otpauth` 9.5.2 | MIT, 1 dependencia (`@noble/hashes`), publicada 2026-09 | **Plan B** si seguridad prefiere no tener código propio |
| `otplib` 13.5.0 | MIT, 6 paquetes | Más piezas para lo mismo |
| `speakeasy` | Sin mantenimiento desde hace años | Descartada |

### 2.2 QR → **`qrcode-generator` 2.0.4 en el backend**
| Opción | Datos | Veredicto |
|---|---|---|
| **`qrcode-generator` 2.0.4** | MIT, **cero dependencias**, desde 2014, última versión 2025-08, tipos incluidos, salida SVG | **Elegida.** El backend devuelve un `data:image/svg+xml;base64,…`; la CSP no cambia |
| `uqr` 0.1.3 | MIT, cero dependencias, versión 0.x | Plan B |
| `qrcode` | Arrastra `pngjs`, `dijkstrajs`, `yargs` | Descartada |
| QR en el frontend | Rompe «frontend: solo `marked`» | Descartada |
| Sin QR | Falla P7 | El secreto en texto se ofrece **además** del QR |

### 2.3 ZIP → **`yazl` 3.3.1**
| Opción | Datos | Veredicto |
|---|---|---|
| **`yazl` 3.3.1** | MIT, 1 dependencia (`buffer-crc32`), en flujo, ZIP64 | **Elegida** |
| `archiver` 7 | Muchas dependencias; la 5.3.2 ya llega por `exceljs` (quedarían dos copias) | Más superficie |
| `.tar.gz` propio | Windows 10 no lo abre sin programas extra | Malo para el cliente |
| ZIP propio | CRC, descriptores, ZIP64 | Reinventar |

---

## 3. Verificación en dos pasos (S1)

### 3.1 Decisiones del 2FA (preguntas 1–12 de la ficha)

| # | Pregunta | Opciones | Elegida | Por qué |
|---|---|---|---|---|
| 1 | Método y librería | TOTP; SMS; correo; passkeys (WebAuthn) | **TOTP RFC 6238, propio** | Gratis, sin proveedor ni servidor de correo (no existen) y funciona sin señal. SMS: costo y robo de SIM. Passkeys: lo más fuerte, pero más difícil de recuperar; queda para después |
| 2 | Secreto | Texto plano; llave derivada de `JWT_SECRET`; **llave propia**; servicio de llaves externo | **AES-256-GCM con `TWO_FACTOR_ENCRYPTION_KEY`**, formato `v1:<kid>:…`, AAD por usuario | Texto plano viola R12. Atarla a `JWT_SECRET` dejaría a todos sin 2FA al rotarla. Un servicio externo es desproporcionado |
| 3 | Códigos de recuperación | Cortos con bcrypt; **largos con SHA-256**; ninguno | **10 × 80 bits, SHA-256, uso único atómico, límite propio** | 80 bits no se adivinan; verificación instantánea |
| 4 | Token intermedio | JWT con `typ` y `JWT_SECRET`; token opaco en BD; reenviar la clave; **JWT con otra llave** | **Desafío JWT firmado con `Buffer.from(hkdfSync(…))`**; 5 min (`login`) o 10 min (`enroll`); verifica `aud`, `typ` y `sub` | `JwtStrategy` no puede aceptarlo como sesión, sin tocar ese archivo; no hace falta una tabla |
| 5 | Límite de intentos | Solo `AttemptLimiter` como está; **reserva antes de verificar** | **Contadores en `UserTwoFactor`** (reserva atómica, 5 → 15 min, 10 al día → bloqueo hasta cumplir 24 h) **+ IP en memoria con `consume`** (40 / 15 min, IPv6 por /64) | `check` + `recordFailure` se puede saltar con peticiones simultáneas (G1). En la base, el contador sobrevive a un reinicio |
| 6 | Reuso y reloj | Sin control; **último paso usado** | **±1 paso de 30 s; `lastUsedStep` atómico; al cambiar de secreto se fija sin comparar** | Tolera relojes un poco desfasados; ningún código sirve dos veces |
| 7 | ¿Obligatorio para ADMIN? | Voluntario; ADMIN; todos | **Pregunta D41** (recomiendo ADMIN). Variable `TWO_FACTOR_REQUIRED_ROLES`, vacía por defecto | No decido por Carlos; las e2e del socio siguen entrando solo con clave |
| 8 | Restablecer por el ADMIN | Sin restablecimiento; sin confirmación; **con confirmación** | **E9** con clave (y código) del ADMIN: misma empresa, no a sí mismo, cierra las sesiones del usuario, abre una ventana de inscripción de 72 h, limpia contadores, bitácora. Único ADMIN: comando de Carlos | Sin confirmación, un token robado bastaría |
| 9 | Dónde se guarda | Columnas en `User`; **tablas aparte** | **`UserTwoFactor` y `UserRecoveryCode`**, con relación y cascada (2 líneas en `User`) | `User` casi no cambia y ninguna consulta actual puede devolver un secreto |
| 10 | Acciones de bitácora | Valores nuevos; **reutilizar** | **`UPDATE`, `LOGIN`, `CREATE` + `changes.event`** | Convención del socio; sin migración `ADD VALUE` |
| 11 | «Política de rutas» | Poner los 4 roles; **lista explícita** | **Lista explícita**: rutas propias bajo `/users/me/two-factor/…`; login bajo `/auth/login/…` | Poner todos los roles equivale a no poner ninguno |
| 12 | QR y CSP | Librería en el navegador; **imagen `data:`** | **SVG `data:` generado en el backend** | `img-src` ya admite `data:`; un SVG dentro de `<img>` no ejecuta scripts |

### 3.2 Modelo de datos

**Migración 1:** `prisma/migrations/<fecha>_two_factor/`, aditiva. Bloques nuevos **al final** de `schema.prisma`, más
**dos líneas** de relación en `User` (`twoFactor UserTwoFactor?`, `recoveryCodes UserRecoveryCode[]`). Ningún enum.
**Migración 2:** `prisma/migrations/<fecha>_auditlog_no_update/`, solo el disparador de 3.12.

**`UserTwoFactor`** (una fila por usuario con 2FA, en curso o con una ventana de inscripción)
| Campo | Tipo | Regla |
|---|---|---|
| `userId` | String **@id**, relación a `User`, `onDelete: Cascade` | 1 a 1 |
| `secretEnc` | String? | Secreto activo cifrado (3.5) |
| `enabledAt` | DateTime? | No nulo = 2FA activo (**única definición** de «tiene 2FA») |
| `enabledIp` | String? | IP desde la que se activó (se muestra al usuario) |
| `pendingSecretEnc` | String? | Secreto en activación o en cambio de teléfono, cifrado |
| `pendingExpiresAt` | DateTime? | 15 min (desde la cuenta) o 10 min (inscripción en el login) |
| `lastUsedStep` | Int? | Anti-reuso |
| `enrollAllowedUntil` | DateTime? | Hasta cuándo se puede inscribir en el login (3.8): E9, `reset-password` del ADMIN, ascenso a ADMIN y rescate la ponen en `now + 72 h` |
| `totpFailures` | Int @default(0) | Reservas de intentos TOTP en el bloque actual |
| `totpLockedUntil` | DateTime? | Bloqueado hasta |
| `totpDayFailures` | Int @default(0) | Reservas en la ventana de 24 h |
| `totpDayStart` | DateTime? | Inicio de esa ventana |
| `recoveryFailures` | Int @default(0) | Reservas de códigos de recuperación |
| `recoveryLockedUntil` | DateTime? | Bloqueo de códigos de recuperación |
| `createdAt`, `updatedAt` | DateTime | |

**`UserRecoveryCode`**: `id` uuid; `userId` (relación, cascada, índice); `codeHash` String **@unique** (SHA-256 hex);
`usedAt` DateTime?; `createdAt`.

### 3.3 Configuración

| Variable | Obligatoria | Formato | Uso |
|---|---|---|---|
| `TWO_FACTOR_ENCRYPTION_KEY` | Sí **si** `TWO_FACTOR_REQUIRED_ROLES` no está vacía; si no, opcional | 64 caracteres hexadecimales (`openssl rand -hex 32`), distinta de `JWT_SECRET`, pasa `weakSecretReason` | Cifra los secretos |
| `TWO_FACTOR_REQUIRED_ROLES` | No (vacía por defecto) | Valores de `UserRole` separados por comas | Política (D41) |
| `TWO_FACTOR_ISSUER` | No (por defecto `Finanzas`) | ≤ 40 caracteres, sin `:` | Nombre en la app del teléfono (D46) |

- `src/config/env.validation.ts` las valida (vacía = ausente). Si la política exige 2FA y falta la llave, `validate()`
  falla y la app no arranca. Se prueba **llamando a `validate()`** (6.2), porque la validación corre al importar
  `app.module`.
- La política la lee `TwoFactorService.requiredRoles()` en cada uso (desde `ConfigService`). Las pruebas la cambian
  con `vi.spyOn(servicio, 'requiredRoles')`.
- `docker-compose.prod.yml` pasa las 3 variables. `env.production.example` y `env.test.example` las documentan sin
  valores reales.
- **Sin llave, o con una llave cuyo `kid` no coincide** (por ejemplo, tras una mudanza): activar → **503** «La
  verificación en dos pasos no está disponible en este servidor. Avisa al administrador del sistema.». El paso 2 del
  login con TOTP → **503** «No podemos comprobar el código de tu aplicación en este momento. Entra con uno de tus
  códigos de emergencia o avisa a tu administrador.». **Los códigos de recuperación siguen sirviendo.** Nunca 500.
- **La llave no va dentro del respaldo de la base.** Se guarda con la frase de D18 (D42). devops confirma en S3 si el
  respaldo general de las 3:00 incluye `.env.production`.

### 3.4 Algoritmo y verificación (`src/auth/two-factor/totp.ts`)

- HMAC-SHA1, 6 dígitos, 30 s; secreto de **20 bytes** (`randomBytes`), Base32 sin relleno (32 caracteres). SHA1 porque
  es lo que leen todas las apps; en HOTP/TOTP no le afecta el problema de colisiones.
- URI: `otpauth://totp/<Issuer>:<email>?secret=<B32>&issuer=<Issuer>&algorithm=SHA1&digits=6&period=30`, con
  `encodeURIComponent`.
- `T = floor(ahora/30)`; el reloj sale de un método `protected now()` y las e2e usan `vi.setSystemTime`.
- **Verificar:** quitar espacios. Si no son exactamente 6 dígitos, no es un TOTP (se prueba como código de
  recuperación, 3.6). Calcular `T-1`, `T`, `T+1` y comparar **los tres** con `timingSafeEqual`. `m` = el mayor paso
  que coincida.
- **Anti-reuso al entrar:** `updateMany({ where: { userId, OR: [{ lastUsedStep: null }, { lastUsedStep: { lt: m } }] },
  data: { lastUsedStep: m } })`. Si actualiza 0 filas, se trata como código incorrecto.
- **Al confirmar un secreto nuevo** (E6 o la inscripción): `lastUsedStep = m` **sin comparar** con el valor anterior,
  que era de otro secreto (B5).
- **Un solo mensaje** para código malo, viejo o usado: «El código no es correcto o ya se usó. Espera a que tu
  aplicación muestre uno nuevo e inténtalo otra vez.»
- Reloj del servidor: seguridad verifica que esté sincronizado (NTP) antes de abrir la puerta.

### 3.5 Cifrado del secreto (`src/auth/two-factor/secret-box.ts`)

- AES-256-GCM, IV aleatorio de 12 bytes, etiqueta de 16 bytes, **AAD** `UserTwoFactor:<userId>:<secret|pending>`.
- Formato: `v1:<kid>:<iv>:<cifrado>:<etiqueta>` en base64url; `kid` = primeros 8 hex de `SHA-256(llave)`.
- Con un `kid` distinto al de la llave actual se lanza un error propio que el servicio convierte en 503 (3.3).
- **Rotación de llave: fuera de S1** (deuda 9.2). El `kid` deja la puerta abierta para agregarla sin migrar datos.
- Nunca se registran el secreto, la URI, el QR, los códigos ni el desafío (logs, bitácora, errores).

### 3.6 Códigos de recuperación (`src/auth/two-factor/recovery-codes.ts`)

- 10 códigos de 10 bytes (`randomBytes`) = 80 bits, en Base32 Crockford (`0123456789ABCDEFGHJKMNPQRSTVWXYZ`), en grupos:
  `7K2M-9QXD-4TRW-HB6P`.
- Normalización: mayúsculas, sin guiones ni espacios, `O→0`, `I→1`, `L→1`; si no quedan 16 caracteres válidos, es
  incorrecto.
- Se guarda `SHA-256(hex)` del código normalizado. Uso único: buscar `{ userId, codeHash, usedAt: null }` y marcar con
  `updateMany({ where: { id, usedAt: null }, … })`; 0 filas = incorrecto.
- Se entregan **una sola vez** (activar, regenerar, inscripción en el login) con `Cache-Control: no-store`.
- Regenerar borra todos los anteriores y crea 10 nuevos, en una transacción.
- Sirven donde se pide un código: 6 dígitos = TOTP; cualquier otra entrada = código de recuperación. **Límite propio**
  (3.11).

### 3.7 Endpoints

**Regla de códigos de estado (G3):**
- **Rutas con sesión** (E4–E9, `change-password`, `register`, `PATCH /users/:id`, `reset-password`, exportación):
  clave o código mal escritos → **422**; bloqueo → **429**; **401 solo si la sesión no vale**.
- **Rutas de login** (E1–E3): código o desafío malos → **401**. El interceptor no cierra sesión porque todavía no hay
  sesión; S4 igual amplía la excepción del interceptor a todo `/auth/login`.

Todas las respuestas con token, secreto, QR o códigos llevan `Cache-Control: no-store`. DTOs con `class-validator` y
`@MaxLength`.

Mensajes de confirmación (422): «La clave no es correcta.» y el de 3.4. Si falta la confirmación: «Para hacer esto
confirma con tu clave (y el código de tu aplicación, si la tienes activada).»

| # | Ruta | Protección | Cuerpo | Respuesta | Errores |
|---|---|---|---|---|---|
| E1 | `POST /auth/login` (existe) | Sin JWT | `{ email, password }` | Sin 2FA y sin política: `{ access_token, user }` (como hoy). Con 2FA: `{ twoFactorRequired: true, challengeToken, expiresInSeconds: 300 }`. Rol obligado sin 2FA y con ventana de inscripción vigente (3.8): `{ twoFactorSetupRequired: true, challengeToken, expiresInSeconds: 600 }`. Sin `user` ni `lastLoginAt` en los dos últimos casos | Como hoy (401, 429, 400). Rol obligado sin 2FA y **sin** ventana → **403** «Tu empresa exige la verificación en dos pasos para tu cuenta y todavía no la tienes activada. Pide a otro administrador de tu empresa que la restablezca, o escribe a soporte.» |
| E2 | `POST /auth/login/2fa` | Sin JWT; desafío | `{ challengeToken ≤ 2048, code ≤ 32 }` | `{ access_token, user }` (+ `recoveryCodesRemaining` si se usó un código de recuperación; + `recoveryCodes` si era una inscripción) | 401 «La verificación venció. Vuelve a escribir tu correo y tu clave.»; 401 (3.4); 429; 503 (3.3) |
| E3 | `POST /auth/login/2fa/enroll` (**existe siempre**) | Sin JWT; desafío `enroll` | `{ challengeToken }` | `{ otpauthUri, qrCode, secret, expiresInSeconds: 600 }` | 401 si el desafío no es de inscripción o venció; 429 por IP |
| E4 | `GET /users/me/two-factor` | JWT, cualquier rol | — | `{ enabled, enabledAt, enabledIp, recoveryCodesRemaining, requiredForMyRole }` | — |
| E5 | `POST /users/me/two-factor/setup` | JWT, cualquier rol | `{ password, code? }` (`code` obligatorio si ya está activo) | `{ otpauthUri, qrCode, secret, expiresInSeconds: 900 }` | 422; 429; 503 |
| E6 | `POST /users/me/two-factor/enable` | JWT, cualquier rol | `{ code }` | `{ access_token, recoveryCodes }`; `passwordChangedAt = now`; `enabledIp` | 422 «No hay una activación en curso o ya venció. Empieza de nuevo desde «Activar».»; 422 código; 429 |
| E7 | `POST /users/me/two-factor/disable` | JWT, cualquier rol | `{ password, code }` | `{ access_token }`; `passwordChangedAt = now` | 422 «Tu rol exige la verificación en dos pasos: no se puede desactivar. Si cambiaste de teléfono, usa «Cambiar de teléfono».»; 422 si no está activo; 422 confirmación; 429 |
| E8 | `POST /users/me/two-factor/recovery-codes` | JWT, cualquier rol | `{ password, code }` | `{ recoveryCodes }` | 422; 429 |
| E9 | `POST /users/:id/reset-two-factor` | JWT + `@Roles(ADMIN)` | `{ confirmPassword, confirmCode? }` | `{ ok: true }` | 404 otra empresa; 422 «No puedes restablecer tu propia verificación: usa «Seguridad de mi cuenta».»; 422 «Este usuario no tiene activada la verificación en dos pasos.»; 422 confirmación; 429; 403 a otros roles |
| E10 | `GET /users`, `GET /users/:id` (existen) | Sin cambios | — | + `twoFactorEnabled: boolean` | — |
| E11 | `GET /users/security-events?days=30` | JWT + `@Roles(ADMIN)` | `days` 1–90 | Eventos de la empresa (3.12, marcados «visible»), con nombre del actor y del afectado, fecha, IP y `via` | 403 a otros roles |

**`qrCode`** = `data:image/svg+xml;base64,<SVG de qrcode-generator, corrección M, con margen>`. **`secret`** = el
mismo Base32, en grupos de 4.

### 3.8 Flujo de inicio de sesión

**Desafío:**
- Llave: `Buffer.from(hkdfSync('sha256', JWT_SECRET, 'fin-2fa', 'login-challenge-v1', 32))`. **Siempre `Buffer.from`**:
  `hkdfSync` devuelve un `ArrayBuffer`, que convertido a texto daría `"[object ArrayBuffer]"`.
- Se firma con `JwtService.sign({ sub, typ, pca }, { secret, expiresIn, audience: 'fin-2fa', algorithm: 'HS256' })` y
  se verifica con `verifyAsync(token, { secret, algorithms: ['HS256'], audience: 'fin-2fa' })`. Además se comprueba
  que `typ` sea `'login'` o `'enroll'` según la ruta y que `sub` sea un uuid. `pca` = `passwordChangedAt` en segundos
  (0 si es nulo). **Sin `jti`.**
- Duración: `login` 300 s, `enroll` 600 s. No se guarda en el servidor. En el navegador vive **solo en memoria**.

**Paso a paso:**
1. `POST /auth/login` igual que hoy hasta validar la clave (ahora con `consume`, 3.11).
2. Según `UserTwoFactor`:
   - `enabledAt` no nulo → desafío `login`.
   - Si no, rol en la política **y** ventana de inscripción vigente → desafío `enroll`. Hay ventana si
     `enrollAllowedUntil > now`, o si la cuenta tiene **menos de 72 h** (`User.createdAt`).
   - Si no, rol en la política sin ventana → 403 (E1).
   - Si no → token como hoy. Un secreto pendiente sin confirmar **no** cuenta como 2FA.
3. `POST /auth/login/2fa`:
   a. Verifica el desafío (firma, `aud`, `typ`, `sub`, vencimiento). Si falla → 401 y se consume la regla por IP.
   b. Relee el usuario y la empresa (activos) y compara `pca`. Comprueba que el estado del 2FA siga correspondiendo al
      `typ`, y para `enroll` que la ventana siga vigente.
   c. **Reserva** un intento (3.11) antes de mirar el código. Si no hay reserva → 429.
   d. `login`: TOTP (3.4) o código de recuperación (3.6). `enroll`: el secreto pendiente vigente creado por E3.
   e. Falla → 401. La reserva ya contó el fallo; si con ella se llegó al bloqueo, bitácora `TWO_FACTOR_LOCKED_OUT` y
      línea en el log (3.12).
   f. Acierta → en **una transacción**: devolución de la reserva, anti-reuso o marca del código, `lastLoginAt`,
      bitácora. Si es `enroll`: activa el secreto, guarda `enabledIp`, borra `enrollAllowedUntil` y crea los 10
      códigos. Devuelve el token con `buildAuthResponse`.
4. Un desafío se puede reintentar mientras no venza ni se agote el límite. Reusarlo después de entrar exige otro código
   válido y no usado.
5. El paso 1 sigue sin revelar si el correo existe ni si tiene 2FA.

### 3.9 Activar, cambiar de teléfono, desactivar, regenerar, cambiar la clave

- **Activar:** E5 (clave) → escanear → E6 (código). **Cambiar de teléfono:** E5 (clave + código actual o de
  recuperación) → escanear → E6, que reemplaza el secreto, fija `lastUsedStep` y regenera los códigos.
  **Desactivar:** E7, bloqueado si el rol lo exige. **Regenerar:** E8.
- Activar, cambiar de teléfono y desactivar ponen `passwordChangedAt = now` y devuelven un token nuevo.
- **`POST /users/me/change-password`** (existe): si el usuario tiene 2FA, exige `code` (campo nuevo opcional en
  `ChangePasswordDto`; si falta → 422). La clave actual mala pasa de **401 a 422** (G3). Cambia la expectativa de
  `test/users-company.e2e-spec.ts:188` y `test/security.e2e-spec.ts:233`; se avisa al socio.
- `reset-password` del ADMIN **no** quita el 2FA del usuario.

### 3.10 Restablecimiento por el ADMIN y rescate del único ADMIN

**E9:**
- Confirmación del ADMIN (3.10b).
- En una transacción: `findFirst({ where: { id, companyId } })` (404 si no existe o es de otra empresa). Borrar
  códigos con `deleteMany({ where: { userId: id, user: { companyId: actor.companyId } } })`. Dejar la fila de 2FA
  **sin secreto** (`secretEnc`, `enabledAt`, `pending*`, `lastUsedStep` en nulo), con contadores en cero y
  `enrollAllowedUntil = now + 72 h` (`updateMany` con `user: { companyId }`). `user.updateMany({ where: { id,
  companyId }, data: { passwordChangedAt: now } })`. Bitácora visible. Limpiar en memoria las reglas por IP no hace
  falta.
- Efecto: se cierran todas las sesiones del usuario. Si su rol está en la política, en las próximas 72 h se inscribe
  al entrar.
- **Recomendación** (manual): cada empresa con **dos ADMIN** con 2FA.

**Rescate del único ADMIN** (perdió el teléfono y los códigos):
- Lo ejecuta **Carlos por SSH** (Claude saldrá del servidor): `docker compose -p financiero-pruebas -f
  docker-compose.prod.yml -f docker-compose.pruebas.yml --env-file .env.production run --rm --no-deps -T api node
  dist/cli/two-factor-reset.js --email <correo> --motivo "<texto obligatorio>"`.
- Hace lo mismo que E9. **Antes**, si la empresa tiene **otro ADMIN activo**, se niega: «Esta empresa tiene otro
  administrador activo (correo): que lo restablezca desde la aplicación.». Con `--forzar` lo hace igual y queda
  anotado.
- Bitácora con actor = el propio usuario (la columna exige un usuario) y `changes: { event: 'TWO_FACTOR_RESET', via:
  'operator-cli', motivo }`. **Toda pantalla que muestre este evento debe decir «Restablecido por el operador del
  sistema»**, nunca «X restableció su propia verificación» (E11 y A3).
- Además escribe una línea en la salida de errores y en `financiero-ops.log` (carpeta de operación, fuera del repo):
  fecha, correo, empresa, motivo. Sin datos secretos.
- **Quién lo autoriza y cómo se verifica la identidad** = D43.
- Si se perdió la llave de cifrado: los códigos de recuperación y el rescate funcionan sin ella.

### 3.10b Confirmación reforzada (G2)

Aplica a:

| Acción | Cuándo |
|---|---|
| `POST /auth/register` | Si `role` es ADMIN |
| `PATCH /users/:id` | Si pasa el rol a ADMIN, o cambia el correo de un usuario que es ADMIN |
| `POST /users/:id/reset-password` | Siempre |
| E9 | Siempre |
| `POST /data-export` | Siempre |

- Campos nuevos opcionales en los DTOs: `confirmPassword` (≤ 72) y `confirmCode` (≤ 32). El servicio exige
  `confirmPassword` en los casos de la tabla, y `confirmCode` si el ADMIN que actúa tiene 2FA. Si falta o no sirve →
  **422**. Límites: `consume` de `passwordRules(actor.id)` y la reserva de 3.11 sobre el 2FA del actor.
- `reset-password`: cambian `test/users-company.e2e-spec.ts:177–178` (se agrega `confirmPassword`). `register` y
  `PATCH` de las pruebas del socio no usan el rol ADMIN (verificado): no cambian.
- **Ascender a ADMIN** pone `passwordChangedAt = now` al ascendido (vuelve a entrar y, si hay política, se inscribe
  en las 72 h de `enrollAllowedUntil`). Bitácora `ADMIN_GRANTED` visible.
- `reset-password` del ADMIN, además: limpia los contadores del 2FA del usuario y abre `enrollAllowedUntil = now +
  72 h`.

### 3.11 Límites de intentos (G1, A2, M7)

**a) En la base, por usuario (TOTP y recuperación).** Antes de verificar se **reserva** un intento con **una sola
sentencia** atómica (`$queryRaw` con `Prisma.sql`, como `lockActiveAdmins`) que:
- reinicia la ventana diaria si pasaron 24 h desde `totpDayStart`, y el bloque si `totpLockedUntil` ya pasó;
- solo actualiza (y devuelve la fila) si **no** hay bloqueo vigente, `totpFailures < 5` y `totpDayFailures < 10`;
- suma 1 a `totpFailures` y a `totpDayFailures`;
- **con la 5.ª reserva del bloque fija `totpLockedUntil = now + 15 min`**; con la 10.ª del día, `totpLockedUntil =
  totpDayStart + 24 h` (bloqueo creciente). El bloqueo queda escrito aunque el proceso se caiga.

Si no actualiza ninguna fila → 429 con `Retry-After` hasta el bloqueo.
- **Acierto:** en la misma transacción del éxito, `totpFailures = 0`, `totpLockedUntil = null` y
  `totpDayFailures = greatest(totpDayFailures − 1, 0)` (devolución).
- **Recuperación:** lo mismo con `recoveryFailures`/`recoveryLockedUntil`: **10 por hora**, bloqueo de 1 h. Es un
  límite **aparte**: si un atacante agota los intentos de TOTP, el dueño todavía entra con un código de recuperación
  (M7).
- **Limpian los contadores:** E9, `reset-password` del ADMIN y el rescate.
- **Probabilidad con este diseño:** como mucho 10 intentos de TOTP por cuenta y por día, **aunque sean simultáneos**;
  cada intento acierta con probabilidad ≤ 3·10⁻⁶ (3 pasos válidos). Resultado: ≤ 3·10⁻⁵ por día, **≈1 % por año** de
  ataque continuo de alguien que **ya tiene la clave**. Y cada bloqueo deja bitácora y una línea en el log. Los
  códigos de recuperación (80 bits) no se pueden adivinar.

**b) En memoria, por IP.** Métodos nuevos en `AttemptLimiter`:
- `consume(rules)`: **síncrono**. Si alguna regla está en su límite, devuelve los segundos de espera **sin sumar**;
  si no, suma 1 a todas y devuelve 0.
- `refund(keys)`: resta 1.
- `check`/`recordFailure` quedan como están (las usan las pruebas del socio).

Regla `2fa:ip:<ip>`, 40 / 15 min, con IPv6 agrupado por **/64** (`ipKey(ip)`). Se aplica en E2, E3 y en las
verificaciones con sesión. Se refunde si acierta.

**c) Login y cambio de clave (G1b): conviene, y va en S1.** `login` y `change-password` pasan de
`check`/`recordFailure` a `consume`/`refund`, con las mismas reglas y límites. El comportamiento visible no cambia (5
fallos → 429), pero ya no se salta con peticiones simultáneas. Va en un commit aparte con su prueba de concurrencia y
**aviso al socio**. Para el login se queda en memoria: el usuario puede no existir y no se debe escribir en la base
por cada intento anónimo.

**d) `TRUST_PROXY`.** En pruebas hay dos proxies (NPM → nginx `web` → API): debe valer **2**. Con 1, todos los
usuarios parecen venir de la misma IP y el límite por IP castigaría a todos juntos. devops lo verifica sin imprimir el
`.env` (8, S3).

**e) Registro agregado.** Cada bloqueo (por usuario o por IP) escribe una línea `Logger.warn` con el tipo, el id del
usuario y la IP (o su /64), sin códigos, claves ni correos completos.

### 3.12 Bitácora (R3)

- **`writeAudit` con `meta` opcional** (`{ ipAddress?, userAgent? }`, `userAgent` recortado a 300 caracteres). Las
  llamadas nuevas lo pasan siempre.
- **Regla:** `changes` **nunca** lleva secretos, códigos, claves, hashes ni el desafío. La prueba lo verifica (6.2) y
  la exportación lo da por hecho (4.2).
- **Migración `<fecha>_auditlog_no_update`:** una función y un disparador `BEFORE UPDATE ON "AuditLog"` que lanza un
  error. El DELETE **no** se bloquea: 19 archivos de e2e del socio limpian `AuditLog` con `deleteMany` (deuda 9.2).
  Prisma no administra disparadores y no los borra.

| Evento (`changes.event`) | `action` | Entidad | Actor | Visible en E11 |
|---|---|---|---|---|
| `TWO_FACTOR_ENABLED` (`via: ACCOUNT \| LOGIN_ENROLL`) | `UPDATE` | `User`/propio | propio | Sí |
| `TWO_FACTOR_DEVICE_CHANGED` | `UPDATE` | `User`/propio | propio | Sí |
| `TWO_FACTOR_DISABLED` (`method`) | `UPDATE` | `User`/propio | propio | Sí |
| `TWO_FACTOR_RECOVERY_CODES_REGENERATED` | `UPDATE` | `User`/propio | propio | No |
| `LOGIN_2FA` (`method: TOTP \| RECOVERY_CODE`, `remaining`) | `LOGIN` | `User`/propio | propio | Solo `RECOVERY_CODE` |
| `TWO_FACTOR_LOCKED_OUT` (`kind: TOTP \| RECOVERY`) | `LOGIN` | `User`/propio | propio | Sí |
| `TWO_FACTOR_RESET` | `UPDATE` | `User`/usuario | ADMIN | Sí |
| `TWO_FACTOR_RESET` (`via: operator-cli`, `motivo`) | `UPDATE` | `User`/usuario | usuario (se muestra «operador del sistema») | Sí |
| `ADMIN_GRANTED` (`via: REGISTER \| ROLE_CHANGE`) | `CREATE` / `UPDATE` | `User`/usuario | ADMIN | Sí |
| `PASSWORD_RESET_BY_ADMIN` (además del `{ passwordReset: true }` actual) | `UPDATE` | `User`/usuario | ADMIN | Sí |
| `DATA_EXPORT_*` (4.7) | `CREATE`/`UPDATE` | `DataExport` | ADMIN | Sí |

Todo en la misma transacción que el cambio. Los inicios de sesión sin 2FA siguen sin bitácora.
**Relación con la auditoría (v0.2):** el aviso de PLAN-v0.2 §5.6 («la clave de tu usuario fue restablecida por…»)
debe incluir también `TWO_FACTOR_RESET` y `ADMIN_GRANTED` sobre la cuenta auditora (anotado para A1/A3, 11).

### 3.13 Sesiones
`passwordChangedAt` también significa «las sesiones anteriores ya no valen». Se pone en `now` al activar, cambiar de
teléfono, desactivar, en E9, en el rescate y al ascender a ADMIN. No al regenerar códigos. El desafío lleva `pca`.
`jwt.strategy.ts` no se toca. Se agrega un comentario en el esquema.

### 3.14 «Política de rutas» (`test/security.e2e-spec.ts`)
1. «toda ruta exige JWT, salvo el login»: ordenar ambos lados y esperar `['POST /auth/login', 'POST /auth/login/2fa',
   'POST /auth/login/2fa/enroll']`.
2. Escrituras abiertas (ordenado): `['PATCH /users/me', 'POST /auth/login', 'POST /auth/login/2fa',
   'POST /auth/login/2fa/enroll', 'POST /users/me/change-password', 'POST /users/me/two-factor/disable',
   'POST /users/me/two-factor/enable', 'POST /users/me/two-factor/recovery-codes', 'POST /users/me/two-factor/setup']`.
   Título: «… (solo el login y la cuenta propia quedan abiertos)».
3. Lecturas restringidas (S1 agrega E11): `['/feedback/ -> ADMIN', '/users/ -> ADMIN', '/users/:id -> ADMIN',
   '/users/security-events -> ADMIN']` (S2 suma la suya, 4.6).
4. E9 lleva `@Roles(ADMIN)`: la prueba del VIEWER la cubre.
5. Ubicación: `src/auth/two-factor/two-factor.controller.ts` con `@Controller('users/me/two-factor')` y
   `@UseGuards(JwtAuthGuard, RolesGuard)`. E2 y E3 en `AuthController`; E9 y E11 en `UsersController`. Todo dentro de
   `AuthModule`: `app.module.ts` no se toca en S1. **Ojo con el orden de rutas** en `UsersController`:
   `security-events` va antes que `:id` (`ParseUUIDPipe` rechazaría el texto).

### 3.15 QR y CSP
SVG en `data:`, la CSP no cambia, nada se guarda en el navegador.

### 3.16 Lo que nunca se hace
Devolver `secretEnc`, `pendingSecretEnc`, `codeHash`, `lastUsedStep`, contadores ni la fila de 2FA. Registrar
secretos. Hacer obligatorio el 2FA por defecto. Volver a mostrar los códigos.

---

## 4. Exportación completa (S2)

### 4.1 Decisiones de la exportación (preguntas 13–18)

| # | Pregunta | Opciones | Elegida | Por qué |
|---|---|---|---|---|
| 13 | Qué incluye y qué no | Reportes; tablas principales; **todo lo de la empresa** | **Todo lo de la empresa**: tablas e hijas, su fila de `Company`, adjuntos, XML, bitácora, comentarios, tablas globales públicas. **Excluye:** `User.password`, `BankConnection.credentialsEnc`, credenciales futuras y certificados, `UserTwoFactor` y `UserRecoveryCode`. **Y lo de la auditora que el ADMIN no puede ver** (D3 y R5), según D47 | P10/R12, sin secretos y sin romper la segregación de funciones |
| 14 | Formato | JSON Lines; **CSV**; Excel; SQL | **ZIP: CSV por tabla + `adjuntos/` + `xml/` + `LEEME.txt` + `manifest.json` con SHA-256** | Se abre sin el sistema (el cliente debe conservar 10 años, D45). Excel tiene tope de filas; SQL exige Postgres |
| 15 | Tablas futuras | Lista a mano; **registro + prueba** | **Registro único y prueba de cobertura** (4.4) | Las tablas nuevas entran solas o la suite falla |
| 16 | 768 MB | En memoria; a disco; **en flujo** | **En flujo**, ciclo de vida de 4.5 | Memoria acotada y sin copias en el disco de la API; los proxies se configuran para no guardar (4.5) |
| 17 | Permisos, frecuencia, bitácora | Cualquier rol; ADMIN; **ADMIN + confirmación** | **Solo ADMIN, con confirmación reforzada (3.10b)**; 3 por hora por empresa; **una a la vez en todo el servidor**; bitácora al empezar y al terminar | Es la salida de todos los datos. Junto con 3.10b, un token robado no alcanza |
| 18 | Al cancelar | Nada especial; **la misma exportación** | `purpose: 'CANCELLATION'` desde la pantalla. Si la empresa ya está desactivada, comando de Carlos en un contenedor aparte (4.8). Entrega (D48) y conservación (D45) las decide Carlos | Una empresa desactivada no puede iniciar sesión |

### 4.2 Registro de modelos (`src/data-export/export-registry.ts`)

**Fuente de modelos y columnas (G4b):**
- Modelos: `Prisma.ModelName`.
- Columnas: `Prisma.<Modelo>ScalarFieldEnum` (públicos en el cliente generado), en su orden. **No** se usan
  `Prisma.dmmf` (no existe en `prisma-client`) ni `runtimeDataModel` (interno).
- El tipo de cada valor se decide en ejecución (`Prisma.Decimal`, `Date`, `bigint`, `Buffer`, `boolean`, `number`,
  `string`). Las columnas `Json` se declaran en el registro (`jsonColumns`), porque en ejecución un `Json` con un texto
  no se distingue de un `String`. La prueba de cobertura vigila esa lista (4.4).
- El filtro de un `CHILD` se escribe como objeto tipado `Prisma.<Modelo>WhereInput`: TypeScript comprueba que la
  relación existe. La e2e lo ejecuta contra la base.

Cada modelo aparece **una vez**, con una clase:

| Clase | Filtro | Modelos |
|---|---|---|
| `SELF` | `{ id: companyId }` | `Company` |
| `COMPANY` | `{ companyId }` | `AccountingSettings`, `DocumentSequence`, `User`, `Account`, `FiscalYear`, `FiscalPeriod`, `Journal`, `JournalEntry`, `CostCenter`, `ExchangeRate`, `Partner`, `TaxRate`, `NcfSequence`, `Invoice`, `Payment`, `BankConnection`, `BankAccount`, `BankReconciliation`, `BankRule`, `CashRegister`, `Budget`, `FinancialRatioSnapshot`, `Attachment`, `AuditLog`, `Feedback` (25) |
| `CHILD` | Por la relación con su padre | `JournalEntryLine` (`journalEntry: { companyId }`), `InvoiceLine` e `InvoiceWithholding` (`invoice: { companyId }`), `PaymentAllocation` (`payment: { companyId }`), `BankTransaction` (`bankAccount: { companyId }`), `BankMatch` (`bankTransaction: { bankAccount: { companyId } }`), `BudgetLine` (`budget: { companyId }`) (7) |
| `ROW_FILTERED` | `{ companyId, …condición }` + motivo | Futuro A1/A2/A4, **según D47** (recomendación): `AuditEngagement` (completo: lo crea y ve el ADMIN), `AuditFinding` (solo `status` ≠ `DRAFT`, es decir, comunicados en adelante), `AuditFile` (solo los de hallazgos exportados o del informe) |
| `EXCLUDED_ROLE` | No se exporta + motivo | Futuro, según D47: `AuditWorkpaper`, `AuditProcedure`, `AuditCheckmark` («papeles de trabajo de la auditora: el ADMIN no los ve, PLAN-v0.2 §13.1 y D3») |
| `GLOBAL_PUBLIC` | Tabla entera | Futuro N2a/N5: `FiscalParameter`, `FiscalParameterValidation`, `FiscalParameterLoad`, `Holiday`, `FiscalObligation` |
| `SECRET` | No se exporta + motivo | `UserTwoFactor`, `UserRecoveryCode` |

Hoy: 1 + 25 + 7 = 33 = `Prisma.ModelName` (más los 2 `SECRET` cuando entre S1).

Cada entrada declara además:
- `excludedColumns` con motivo. Hoy: `User.password`, `BankConnection.credentialsEnc`. Futuro: credenciales de
  `EcfConnection` y todo certificado `.p12` (R12, Ley 126-02).
- `jsonColumns`. Hoy: `AuditLog.changes`, `FinancialRatioSnapshot.ratios`.
- `files`: columna, carpeta del ZIP y **patrón exacto de la clave**. Hoy `Attachment.fileUrl` →
  `^<companyId>/<uuid>$` → `adjuntos/`. Futuro: `AuditFile.fileUrl` → `^<companyId>/auditing/<uuid>$` → `adjuntos/`;
  `EcfDocument.xmlFileUrl` → patrón que defina N3 → `xml/`. En el CSV se agrega la columna `exportPath`.

`AuditLog.changes` sale entero; la regla de 3.12 garantiza que no trae secretos.

### 4.3 Formato del archivo

- **Nombre:** `exportacion-<RNC>-<AAAAMMDD-HHMMSS>.zip` (hora de RD). La cabecera se arma con `contentDisposition()`
  de `file-type.ts`, porque el RNC sale de la base.
- **Contenido:**
```
LEEME.txt              en español: qué hay; cómo abrir los CSV en Excel sin perder ceros; cómo comprobar SHA-256;
                       aviso de que los adjuntos .csv/.txt del cliente van tal cual (sin protección contra fórmulas)
manifest.json          índice (abajo)
datos/<Modelo>.csv     uno por modelo exportado, aunque esté vacío
adjuntos/<id>/<nombre>
xml/<Modelo>/<id>.xml  cuando existan
```
- **Nombres dentro del ZIP:** `sanitizeFileName` y además:
  - quitar U+202A–202E y U+2066–2069 (caracteres que invierten el texto);
  - quitar puntos y espacios del final;
  - agregar `_` a los nombres reservados de Windows (`CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9`, con o
    sin extensión).
  Siempre bajo `adjuntos/<id>/`.
- **CSV** (RFC 4180): UTF-8 con BOM, coma, CRLF, cabecera con los nombres de columna.

| Tipo | Se escribe como |
|---|---|
| `Decimal` | `toFixed()` sin argumentos (exacto, sin notación científica). Nunca `Number` |
| `DateTime` | `toISOString()` |
| `Boolean` / `Int` / `BigInt` / enum | Texto tal cual |
| Columnas `jsonColumns` | `JSON.stringify` |
| Nulo / texto vacío | Vacío / `""` |
| Texto | `neutralize()` de `chart-of-accounts.rules.ts` (antepone `'` si empieza por `= + - @ \t \r`). Solo en texto; los números negativos no se tocan. Se dice en `LEEME.txt` y en `manifest.csvFormulaEscape` |

**`manifest.json`** (formato 1):
```json
{
  "formatVersion": 1, "exportId": "<uuid = entityId de la bitácora>", "purpose": "ON_DEMAND | CANCELLATION",
  "generatedAt": "<ISO>", "company": { "id": "…", "name": "…", "taxId": "…" },
  "generatedBy": { "userId": "…", "email": "…", "via": "API | operator-cli" },
  "schemaMigration": "<última migración aplicada>", "csvFormulaEscape": true,
  "tables": [ { "model": "Invoice", "file": "datos/Invoice.csv", "rows": 0, "sha256": "…", "excludedColumns": [], "rowFilter": null } ],
  "files": [ { "model": "Attachment", "id": "…", "path": "adjuntos/…", "sizeBytes": 0, "sha256": "…", "status": "OK | MISSING | REJECTED_PATH" } ],
  "excludedModels": [ { "model": "UserTwoFactor", "reason": "…" } ]
}
```
Los SHA-256 se calculan mientras se escribe. `manifest.json` va al final. El SHA-256 del ZIP completo queda en la
bitácora (4.7).

### 4.4 Prueba de cobertura (unidad, sin base de datos)

Falla, diciendo qué falta y que se agregue al registro, si:
1. Un nombre de `Prisma.ModelName` no está en el registro, o el registro nombra un modelo inexistente.
2. Un `COMPANY` o `ROW_FILTERED` no tiene `companyId` en su `ScalarFieldEnum`.
3. Una columna cuyo nombre coincide con
   `/password|secret|hash|token|credential|enc$|apikey|privatekey|p12|certificate/i` no está en `excludedColumns` ni en
   **`ALLOWED_LOOKALIKES`**. Esa lista empieza con: `User.passwordChangedAt` — «fecha del último cambio de clave; no
   es un secreto». Con el esquema de hoy coinciden solo `User.password`, `User.passwordChangedAt` y
   `BankConnection.credentialsEnc` (verificado).
4. Una columna que coincide con `/fileurl|filekey|storagekey|xmlfile/i` no está en `files`.
5. Una columna `excludedColumns` o `jsonColumns` no existe (detecta renombres).
6. **Lectura de `prisma/schema.prisma` (solo en la prueba):** se recorren los bloques `model X { … }` y falla si un
   campo de tipo `Json`/`Json?` no está en `jsonColumns`, o si la primera relación de un `CHILD` no es un campo del
   modelo.
7. Un modelo `SECRET` o `EXCLUDED_ROLE` tiene salida, o falta el motivo.

### 4.5 Memoria, proxies y ciclo de vida (M1, M3)

Orden dentro de `POST /data-export`:
1. Tomar el **semáforo global** (una exportación a la vez en todo el servidor), **antes de cualquier `await`**. Si
   está ocupado → 429 «Ya hay una exportación en curso. Espera unos minutos y vuelve a intentarlo.»
   (`Retry-After: 60`). Todo lo que sigue va en `try/finally`: el semáforo **siempre** se libera, también si falla o
   si el cliente corta.
2. Confirmación reforzada (3.10b) → 422 o 429.
3. Frecuencia: `consume` de `export:company:<companyId>`, 3 por 60 min, con su propio 429 y texto.
4. Bitácora `DATA_EXPORT_STARTED` (transacción propia).
5. Cabeceras: `Content-Type: application/zip`, `Content-Disposition` (con `contentDisposition()`),
   `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, **`X-Accel-Buffering: no`**. Sin
   `Content-Length`.
6. Abrir una transacción `RepeatableRead` (`SET TRANSACTION READ ONLY` como primera sentencia), con `timeout` de
   **30 min**.
7. Agregar a `yazl` un CSV por modelo. Cada CSV es un `Readable` **perezoso** que pide la página siguiente (1 000
   filas, cursor por `id`) **solo cuando `yazl` le pide datos**. La transacción sigue abierta hasta que `yazl` consume
   el último CSV. Mientras tanto se juntan las referencias a archivos (`{ id, clave, nombre }`).
8. Al terminar el último CSV: confirmar la transacción. Si vencen los 30 min → se corta, `DATA_EXPORT_FAILED`.
9. Agregar los archivos de a uno, también perezosos (`FileStorage.read` solo cuando les llega el turno; como mucho
   `MAX_UPLOAD_MB` en memoria). Clave inválida → `REJECTED_PATH`; archivo inexistente → `MISSING`. Sin compresión
   para adjuntos; CSV comprimidos.
10. `manifest.json`, `zipfile.end()`; al cerrar la respuesta: `DATA_EXPORT_COMPLETED`.

**Topes:**
- **45 min** en total.
- **Cliente que no lee:** si la respuesta queda llena (`write` devuelve `false`) y no hay `drain` en **60 s**, se corta.
- **El cliente corta** (`close` antes de terminar): se detiene todo, se deshace la transacción,
  `DATA_EXPORT_FAILED` (`CLIENT_ABORTED`), se libera el semáforo.
- **Meta:** el crecimiento de memoria del proceso queda por debajo de **100 MB** aunque el ZIP pese varias veces eso
  (6.3).

**Proxies (M1):** la API no escribe nada a disco. nginx y NPM, por defecto, guardan la respuesta en archivos
temporales si el cliente es lento. Para evitarlo:
- `X-Accel-Buffering: no`;
- en `frontend/deploy/nginx.conf`, un bloque `location = /api/data-export` con `proxy_buffering off`,
  `proxy_read_timeout 120s` y `client_max_body_size 8k` (S4);
- **NPM (proxy host 14, infraestructura fuera del repo):** devops revisa que no guarde la respuesta (o que respete
  `X-Accel-Buffering`) y sus tiempos (S3). Hasta verificarlo, el riesgo queda anotado (9.1).

### 4.6 Endpoints (módulo nuevo `src/data-export/`)

| Ruta | Protección | Cuerpo | Respuesta | Errores |
|---|---|---|---|---|
| `GET /data-export/summary` | JWT + `@Roles(ADMIN)` | — | `{ tables: [{ model, rows }], files: { count, totalBytes }, estimatedBytes, limits: { perHour: 3 } }` | 403 |
| `POST /data-export` | JWT + `@Roles(ADMIN)` | `{ confirmPassword, confirmCode?, purpose?: 'ON_DEMAND' \| 'CANCELLATION' }` | ZIP en flujo | 422 confirmación; 429 frecuencia o en curso; 403 |

- La lista de lecturas restringidas de `security.e2e-spec.ts` suma `'/data-export/summary -> ADMIN'`.
- `AttachmentsModule` exporta `FILE_STORAGE`. `DataExportModule` importa `AttachmentsModule` y `AuthModule` (por
  `AttemptLimiter` y `TwoFactorService`: **S2 depende de S1**). `app.module.ts` suma una línea.

### 4.7 Bitácora de la exportación

| Momento | `action` | `changes` |
|---|---|---|
| Antes del primer byte (transacción propia) | `CREATE`, `DataExport`/`exportId` | `{ event: 'DATA_EXPORT_STARTED', purpose }` + `meta` (IP y navegador) |
| Al terminar | `UPDATE` | `{ event: 'DATA_EXPORT_COMPLETED', bytes, sha256, rows, files, missingFiles, rejectedFiles }` |
| Falla o corte | `UPDATE` | `{ event: 'DATA_EXPORT_FAILED', reason: 'CLIENT_ABORTED' \| 'TIMEOUT' \| 'STALLED' \| 'ERROR' }` |

(Son filas nuevas con `action` `UPDATE`; ninguna fila existente se modifica, así que el disparador de 3.12 no se
activa.)

### 4.8 Exportación al cancelar (M2)

1. El ADMIN descarga desde la pantalla marcando «Me voy del servicio».
2. Si la empresa ya está desactivada, lo hace **Carlos por SSH**:
   - una sola vez: `mkdir -p ~/financiero-exportaciones && chmod 700 ~/financiero-exportaciones`;
   - cada vez:
     `umask 077 && docker compose -p financiero-pruebas -f docker-compose.prod.yml -f docker-compose.pruebas.yml
     --env-file .env.production run --rm --no-deps -T api node dist/cli/data-export.js --rnc <RNC> --as <correo de un
     ADMIN de esa empresa> --motivo "<obligatorio>" --purpose CANCELLATION >
     ~/financiero-exportaciones/<RNC>-<fecha>.zip`.

   `run --rm` crea **otro contenedor**, con su propio tope de 768 MB, que no le quita memoria a la API en uso. El ZIP
   va a la salida estándar y los mensajes a la de errores. La bitácora lleva `via: 'operator-cli'` y el motivo.
   También queda una línea en `financiero-ops.log`.
3. Se entrega por el canal que decida Carlos (D48) y **se borra del servidor** al confirmar la entrega. El documentador
   escribe el paso a paso sin asumir conocimientos.
4. Cuánto se conservan después los datos: D45 (el borrado no es parte de S2).

### 4.9 Rutas de archivos (M7s)

- Antes de leer, la clave debe cumplir **exactamente** el patrón de su tipo (4.2), con el `companyId` de la empresa
  que exporta. Si no → `REJECTED_PATH`, no se lee, y se escribe una línea de aviso en el log (sin la ruta).
- **Lo mismo en `AttachmentsService.download`** (archivo del socio): una clave que no cumpla `^<companyId>/<uuid>$` →
  404 «El archivo ya no está disponible en el almacenamiento» y aviso en el log. Prueba con `..` y con la carpeta de
  otra empresa.
- `LocalFileStorage.pathOf` sigue como segunda barrera.

---

## 5. Pantallas (S4)

Con el kit propio (`styles.css`, `shared/ui`), **sin Tailwind ni librerías de UI**. Checklist de la Guía de producto
§6 en cada pantalla.

1. **Interceptor** (`core/auth.interceptor.ts`): no cerrar la sesión ante 401 de cualquier ruta que empiece por
   `/auth/login`. Las confirmaciones con sesión ya responden 422 (3.7).
2. **Tipos** (`core/models.ts` y `core/auth.ts`): la respuesta del login es una unión (`access_token` |
   `twoFactorRequired` | `twoFactorSetupRequired`). El desafío vive en una señal **en memoria**.
3. **Login, paso 2** (`features/auth/login.ts`): «Código de 6 dígitos de tu aplicación» (`inputmode="numeric"`,
   `autocomplete="one-time-code"`). Enlaces «Usar un código de emergencia» y **«Perdí mi teléfono»**, que explica:
   usa un código de emergencia; si no los tienes, pide a otro administrador de tu empresa que restablezca tu
   verificación; si eres el único, escribe a soporte. Si el desafío vence, vuelve a la clave con el mensaje del
   servidor. El 403 de E1 se muestra con el mismo «cómo arreglarlo». Probar también el login **sin** 2FA.
4. **Inscripción en el login** (`twoFactorSetupRequired`): «Tu empresa exige este paso para los administradores»,
   indicador «Paso 1 de 3 · 2 de 3 · 3 de 3», QR (E3), código (E2) y códigos de emergencia antes de entrar.
5. **«Seguridad de mi cuenta»** (en `features/admin/profile.ts` o en una pantalla nueva con el mismo kit):
   - estado con **fecha e IP de activación** («Si no reconoces esta activación, avisa a tu administrador»);
   - Activar, con indicador de pasos. Paso 1: **qué aplicación instalar**, con enlaces a las tiendas oficiales de
     Google Authenticator y Microsoft Authenticator;
   - Cambiar de teléfono; Regenerar códigos; Desactivar (oculto si `requiredForMyRole`);
   - «Cambiar clave» pide el código si hay 2FA (3.9).
6. **Códigos de emergencia:** una sola vez, «Copiar», «Descargar .txt» (Blob), aviso «Guárdalos ahora: no se vuelven a
   mostrar». Nada en `localStorage`.
7. **Usuarios (ADMIN)** (`features/admin/users.ts`):
   - columna «Verificación en dos pasos»;
   - «Restablecer verificación» con diálogo de confirmación reforzada;
   - **la misma confirmación** al crear un ADMIN, al ascender a ADMIN, al cambiar el correo de un ADMIN y al
     restablecer una clave;
   - bloque «Cambios de seguridad (últimos 30 días)» con E11, que muestra el rescate como «operador del sistema».
8. **«Exportar todos mis datos»** (Configuración, solo ADMIN; `features/admin/admin.routes.ts` con
   `roleGuard('ADMIN')`; entrada en `layout/nav.ts`):
   - qué incluye y qué no (incluida la regla de D47);
   - tamaño estimado (`summary`);
   - aviso de datos sensibles;
   - confirmación reforzada; casilla «Me voy del servicio»; botón único y estado.
   Hace falta un método `Api.downloadPost` en `core/api.ts`.
9. **Textos:** `shared/labels.ts` (al final); `core/error-text.ts` y `ayuda.json` → `errores` con cada mensaje nuevo
   de 3.7, 3.10b y 4.6; manual en `public/manual/*.md` (sección nueva coordinada con D2, p. ej.
   `14-seguridad-2fa-exportacion.md`, y ajuste de `09-usuarios-y-permisos.md`).
10. **nginx** (`frontend/deploy/nginx.conf`): `location ^~ /api/auth/login/` con 8 KB, y `location = /api/data-export`
    de 4.5. La CSP no cambia. Se avisa a seguridad.

---

## 6. Pruebas exigidas (vitest; esqueleto de `test/financial-ratios.e2e-spec.ts`)

### 6.1 Unidad (S1)
- **`totp.spec.ts`:**
  - RFC 4226 ap. D (secreto ASCII `12345678901234567890`, contadores 0–9 → `755224, 287082, 359152, 969429, 338314,
    254676, 287922, 162583, 399871, 520489`);
  - RFC 6238 ap. B, SHA1, 6 dígitos: T=59 → `287082`; 1111111109 → `081804`; 1111111111 → `050471`; 1234567890 →
    `005924`; 2000000000 → `279037`; 20000000000 → `353130` (comprobados);
  - Base32 RFC 4648 §10, ida y vuelta;
  - ventana ±1 sí, ±2 no; 5 o 7 dígitos no son TOTP.
- **`secret-box.spec.ts`:** ida y vuelta; un byte alterado → error; otro AAD → error; `kid` distinto → error propio;
  el cifrado no contiene el secreto.
- **`recovery-codes.spec.ts`:** formato y alfabeto; 10 distintos; normalización; rechazo de `U` y de largos ≠ 16.
- **`attempt-limiter` (`consume`/`refund`):** síncrono; no suma si está en el límite; `refund` resta; IPv6 en la misma
  /64 comparte clave y en otra /64 no.
- **`env.validation` (M5):** `validate()` con política y sin llave → error; con una llave de 63 caracteres → error;
  con una llave igual a `JWT_SECRET` → error; política vacía y sin llave → bien.

### 6.2 `test/two-factor.e2e-spec.ts` (S1)
- **Sin 2FA:** el login devuelve exactamente `{ access_token, user }`.
- **Activar:**
  - E5 sin clave → 400; con la clave mala → **422** y el token **sigue sirviendo** (G3);
  - 5 claves malas → 429;
  - bien → URI correcta, `qrCode` `data:image/svg+xml;base64,`, `secret` de 32 caracteres, `no-store`;
  - en la BD `pendingSecretEnc` empieza por `v1:` y no contiene el secreto;
  - E6 con código malo → 422; bien → token nuevo + 10 códigos y el token viejo → 401; `codeHash` de 64 hex;
  - E6 sin E5 o con el pendiente vencido → 422; E4 muestra `enabledIp`.
- **Desafío (M6):**
  - el desafío como `Bearer` → 401; un `access_token` como desafío → 401;
  - un desafío firmado con `JWT_SECRET` → 401; firmado con la cadena `"[object ArrayBuffer]"` → 401; sin `aud` → 401;
  - con `typ: 'enroll'` en E2 de un usuario con 2FA → 401; `sub` que no es uuid → 401; > 2 048 caracteres → 400.
- **Login con 2FA:**
  - paso 1 sin `access_token` ni `user`; código correcto → token;
  - el mismo código con un desafío nuevo → 401;
  - reloj: T−1 no usado → 200; T−2 → 401; T+1 → 200; T+2 → 401;
  - vencido (+6 min) → 401 «venció»; clave cambiada o usuario o empresa desactivados entre los pasos → 401.
- **Límites (G1/A2):**
  - **50 peticiones simultáneas con códigos malos → como mucho 5 respuestas 401 y el resto 429**;
  - después, el código correcto → 429;
  - **los fallos sobreviven a un reinicio**: con 4 fallos, se cierra la app y se crea otra; 1 fallo más → bloqueado;
  - 10 fallos en el día → bloqueado aunque pasen 15 min, hasta cumplir 24 h;
  - un acierto devuelve la reserva;
  - con TOTP bloqueado, un código de recuperación correcto **entra** (M7);
  - 10 códigos de recuperación malos en una hora → 429;
  - una sola bitácora `TWO_FACTOR_LOCKED_OUT` por bloqueo y una línea en el log;
  - regla por IP: 40 fallos desde la misma /64 → 429 para otra cuenta.
- **Login y cambio de clave (G1b):** 50 logins simultáneos con la clave mala → como mucho 5 respuestas 401;
  `change-password` igual. Las pruebas de límites del socio siguen en verde.
- **Concurrencia:** el mismo TOTP en dos peticiones simultáneas → una 200 y otra 401; lo mismo con un código de
  recuperación.
- **Recuperación:** entrar con un código → `recoveryCodesRemaining: 9` y bitácora; repetirlo → 401; minúsculas,
  espacios y `O` → aceptado; regenerar invalida los viejos.
- **Cambiar de teléfono:** sin código → 422; con código → QR nuevo; E6 en el **mismo paso de 30 s** del último código
  del teléfono viejo → 200 (B5); la app vieja y los códigos viejos dejan de servir.
- **Desactivar:** con confirmación; después se entra solo con clave; tokens viejos → 401.
- **`change-password` (M2s):** con 2FA y sin código → 422; con código → 201; clave actual mala → 422 sin cerrar la
  sesión.
- **E9:**
  - ADMIN de A sobre un usuario de A, con confirmación → 200: el usuario entra solo con clave, sus tokens viejos → 401,
    contadores en cero, `enrollAllowedUntil` ≈ ahora + 72 h, bitácora visible en E11;
  - usuario de B → 404; ACCOUNTANT, APPROVER y VIEWER → 403; a sí mismo → 422; sin confirmación → 422; usuario sin
    2FA → 422;
  - `reset-password` sobre un usuario con 2FA **no** quita el 2FA, sí limpia sus contadores.
- **Camino completo con token robado (G2):** con solo el token de un ADMIN (sin clave ni código) → 422 en:
  `register` con rol ADMIN, `PATCH` a ADMIN, `PATCH` del correo de un ADMIN, `reset-password`, E9, E5 y
  `POST /data-export`. Con la confirmación correcta → funcionan, el ascendido pierde sus sesiones y queda
  `ADMIN_GRANTED` en E11.
- **Política** (`vi.spyOn(twoFactorService, 'requiredRoles').mockReturnValue(['ADMIN'])`):
  - ADMIN sin 2FA con cuenta de más de 72 h y sin ventana → **403**;
  - ADMIN creado hace menos de 72 h, o con `enrollAllowedUntil` vigente → `twoFactorSetupRequired` → E3 → E2 → token
    + 10 códigos + bitácora `LOGIN_ENROLL`;
  - ese ADMIN no puede desactivar → 422; un ACCOUNTANT entra como hoy.
- **Sin llave o con `kid` distinto:** E5 → 503; TOTP en E2 → 503 con el texto de 3.3; un código de recuperación
  entra; nunca 500.
- **Comandos:**
  - `two-factor-status`: lista a los ADMIN activos sin 2FA y termina con error si hay alguno;
  - `two-factor-reset`: se niega si hay otro ADMIN activo (salvo `--forzar`), exige `--motivo` y deja `via:
    operator-cli`.
- **Disparador de la bitácora:** `prisma.auditLog.update(…)` → error; `deleteMany` sigue funcionando.
- **Regresión (B4):** recorrer `src/` y fallar si un `userTwoFactor.updateMany`/`deleteMany` o
  `userRecoveryCode.updateMany`/`deleteMany` no tiene `userId` ni `user: { companyId`.
- **Nada se filtra:**
  - ningún cuerpo de respuesta contiene `secretEnc`, `pendingSecretEnc`, `codeHash`, `lastUsedStep`, `totpFailures` ni
    `v1:`;
  - ningún `AuditLog.changes` contiene el secreto, un código, un hash o un desafío.
- **`security.e2e-spec.ts`** en verde con las listas de 3.14. Pruebas del socio que cambian, y nada más:
  `users-company.e2e-spec.ts:177–178` (confirmación) y `:188`, `security.e2e-spec.ts:233` (401 → 422).

### 6.3 `test/data-export.e2e-spec.ts` (S2)
- **Permisos:** sin token → 401; ACCOUNTANT, APPROVER y VIEWER → 403; sin confirmación → 422; ADMIN con 2FA sin código
  → 422.
- **Datos de dos empresas,** al menos una fila por modelo del registro.
- **Aislamiento:** ningún `id` de B (buscado con el mismo filtro) aparece en los CSV de A; el RNC de B no aparece en
  ningún archivo.
- **Conteos:** manifiesto = base de datos = líneas de cada CSV.
- **Secretos:**
  - no hay columna `password` ni archivos `UserTwoFactor.csv` ni `UserRecoveryCode.csv`;
  - no aparecen `$2b$` ni `v1:`;
  - `User.csv` sí trae `passwordChangedAt`.
- **Adjuntos:**
  - el SHA-256 coincide (manifiesto = subido = dentro del ZIP);
  - archivo borrado → `MISSING`;
  - `fileUrl` cambiado a la carpeta de B o con `..` → `REJECTED_PATH`;
  - **`GET /attachments/:id/download`** con esa misma fila → 404 (M7s).
- **Formato:**
  - `12345678901234.5678` y `0.000001` salen exactos; fechas ISO; `Json` válido;
  - `=1+1` → `'=1+1`; un monto negativo sin apóstrofo; nulo y vacío distintos; BOM;
  - un nombre con U+202E, `CON.txt` o un punto final sale saneado;
  - la cabecera usa `contentDisposition()` y trae `X-Accel-Buffering: no`.
- **Frecuencia y semáforo:**
  - la 4.ª exportación en la hora → 429;
  - dos simultáneas (aunque sean de empresas distintas) → la segunda 429;
  - si la primera se corta a mitad, una nueva arranca enseguida (el semáforo se liberó).
- **Ciclo de vida** (reloj simulado o topes inyectables): cliente que no lee 60 s → `STALLED`; transacción de más de
  30 min → `TIMEOUT`; corte del cliente → `CLIENT_ABORTED`. En los tres casos se libera el semáforo.
- **Bitácora:** `DATA_EXPORT_STARTED` con IP antes del primer byte; `COMPLETED` con el `sha256` del ZIP recibido.
- **Cobertura (4.4):** pasa hoy. En unidad, falla con: un modelo faltante, una columna `fooToken` sin declarar, un
  `xmlFileUrl` sin `files`, un `Json` sin `jsonColumns`, un `CHILD` con una relación inexistente.
- **Memoria (M4):**
  - `await app.listen(0)` y `fetch` en flujo: el cuerpo se va pasando por un SHA-256 y a un archivo temporal, **sin
    supertest**;
  - `process.memoryUsage()` cada 50 ms;
  - con 30 000 líneas de asiento y 24 adjuntos de 5 MB, el pico de `rss + arrayBuffers` sube menos de **100 MB**;
  - el valor medido va en el PR, junto con una medición manual en pruebas con `docker stats` y ≈1 GB ficticio.
- **CLI:** la función del comando produce el mismo contenido (salvo `generatedBy`) y exige `--motivo`.

### 6.4 S4 (manual y de unidad)
- Activar, salir y entrar con código; entrar con un código de emergencia.
- Una clave o un código mal escritos en cualquier confirmación **no** cierran la sesión.
- Los códigos se ven una sola vez.
- Mensajes con «cómo arreglarlo»; camino «Perdí mi teléfono».
- La exportación solo para ADMIN; el ZIP abre en Windows y macOS; el CSV abre en Excel con acentos.
- `ng build`, `ng test`, `verificar-ayuda`; 375 px y teclado.

---

## 7. Archivos del socio que se tocan (avisarle antes)

| Archivo | Paquete | Cambio | Riesgo |
|---|---|---|---|
| `prisma/schema.prisma` (**caliente**) | S1 | 2 modelos al final, 2 líneas en `User`, comentario | Medio |
| `prisma/migrations/<fecha>_two_factor/`, `<fecha>_auditlog_no_update/` | S1 | Nuevas | Bajo / Medio (disparador) |
| `src/auth/auth.service.ts` | S1 | Rama 2FA en `login`; `consume`/`refund`; `register` con confirmación si el rol es ADMIN | **Alto** |
| `src/auth/auth.controller.ts`, `auth.module.ts`, `dto/register.dto.ts` | S1 | E2, E3; proveedores; `confirmPassword`/`confirmCode` | Medio |
| `src/auth/attempt-limiter.ts` | S1 | `consume`, `refund`, `ipKey` (/64) | Medio |
| `src/auth/strategies/jwt.strategy.ts`, `types/auth-user.ts` | — | **Sin cambios** | — |
| `src/users/users.service.ts`, `users.controller.ts`, `dto/users.dto.ts` | S1 | E9, E11, `twoFactorEnabled`, confirmación en `update`/`resetPassword`, `change-password` (código, 422, `consume`) | **Alto** |
| `src/common/audit.ts` | S1 | `meta` opcional | Bajo |
| `src/config/env.validation.ts` | S1 | 3 variables | Bajo |
| `docker-compose.prod.yml`, `env.production.example`, `env.test.example` | S1 | Variables; comentario de `TRUST_PROXY=2` en pruebas | Bajo |
| `test/security.e2e-spec.ts` (**caliente**) | S1, S2 | Listas de 3.14 y 4.6; `:233` 401 → 422 | Medio |
| `test/users-company.e2e-spec.ts` | S1 | `:177–178` confirmación; `:188` 401 → 422 | Bajo |
| `package.json`/`package-lock.json` | S1, S2 | `qrcode-generator`, `yazl`; desarrollo: `yauzl`, `@types/yazl`, `@types/yauzl` | Bajo |
| `src/app.module.ts` (**caliente**) | S2 | Una línea | Bajo |
| `src/attachments/attachments.module.ts`, `attachments.service.ts` | S2 | Exportar `FILE_STORAGE`; patrón exacto en `download` | Medio |
| Frontend | S4 | `core/auth.interceptor.ts`, `core/auth.ts`, `core/models.ts`, `core/api.ts`, `core/error-text.ts`, `features/auth/login.ts`, `features/admin/profile.ts`, `users.ts`, `admin.routes.ts`, `layout/nav.ts`, `shared/labels.ts`, `public/manual/ayuda.json`, `public/manual/*.md`, `frontend/deploy/nginx.conf` | Medio |
| **Infraestructura (fuera del repo)** | S3 / devops | NPM proxy host 14 (buffering y tiempos), `TRUST_PROXY=2` en `.env.production`, `~/financiero-exportaciones/`, `financiero-ops.log` | Medio |
| **Nuevos** | | `src/auth/two-factor/*`; `src/cli/two-factor-reset.ts`, `two-factor-status.ts`, `data-export.ts`; `src/data-export/*`; `test/two-factor.e2e-spec.ts`, `test/data-export.e2e-spec.ts` y pruebas de unidad | — |

---

## 8. Orden de despliegue (cada paso con respaldo previo y permiso de Carlos)

0. Anexo aprobado; respuestas D41–D48.
1. **S1:** fusionar → respaldo → generar `TWO_FACTOR_ENCRYPTION_KEY` sin imprimirla y guardar una copia con la frase
   (D42) → verificar `TRUST_PROXY=2` → `migrate deploy` → reiniciar `api` con la **política vacía**. Comprobar que las
   contadoras entran igual.
2. **S2:** desplegar → exportar la empresa ficticia, medir memoria y verificar que NPM no guarda la respuesta.
3. **S3** en paralelo (D17, D18/D42).
4. **S4:** desplegar `web`.
5. **Activación acompañada** (si D41 = sí): cada ADMIN activa su 2FA desde «Seguridad de mi cuenta», con Carlos
   presente o por llamada. Luego `node dist/cli/two-factor-status.js` (con `run --rm`) debe terminar **sin** ADMIN
   pendientes. **Solo entonces** se pone `TWO_FACTOR_REQUIRED_ROLES=ADMIN` y se reinicia. Al arrancar con la política,
   la API escribe un aviso en el log si queda algún ADMIN sin 2FA.
6. **Tarea 3.5:** qa, seguridad (incluido NTP y la regla de datos reales), documentador. **Carlos abre la puerta.**

---

## 9. Riesgos y deuda

### 9.1 Riesgos
| Riesgo | Impacto | Mitigación |
|---|---|---|
| El 2FA deja a todos fuera | Grave | Política vacía por defecto; activación acompañada; comando de estado; códigos de emergencia; E9; rescate |
| El desafío se acepta como sesión | Grave | Llave HKDF con `Buffer.from`, `aud`/`typ`/`sub`; pruebas en ambos sentidos |
| Adivinar el código con peticiones simultáneas | Grave | Reserva atómica en la base; prueba de 50 simultáneas |
| Token de ADMIN robado (XSS; el token vive en `localStorage`) | Alto | Confirmación reforzada en las 5 acciones de 3.10b; E11 visible. Sigue abierto: lo que un ADMIN puede hacer sin esas 5 acciones (p. ej. anular documentos) |
| Un intruso con la clave inscribe su teléfono primero | Alto | Activación acompañada; ventana de 72 h solo para cuentas nuevas o restablecidas; fecha e IP visibles. Para roles **no** obligados sigue siendo posible: el dueño lo ve y pide E9 |
| Se pierde la llave | Alto | Códigos de recuperación y rescate sin llave; 503, no 500; copia (D42) |
| Reloj desfasado | Alto | ±30 s; NTP verificado |
| Fuga entre empresas o de papeles de auditoría | Grave | Registro, prueba genérica, patrón exacto de claves, D47 |
| Tabla o secreto nuevo sin clasificar | Alto | Prueba de cobertura |
| Memoria | Alto | Flujo, semáforo global, topes, prueba medida |
| Copias en disco en nginx/NPM | Medio | `X-Accel-Buffering`, bloque nginx, revisión de NPM por devops |
| `TRUST_PROXY` mal puesto | Medio | Verificación en el paso 1 del despliegue |
| ZIP del operador olvidado en el servidor | Medio | Carpeta 700, `umask 077`, borrado al entregar, línea en `financiero-ops.log` |
| Excel cambia RNC/NCF al abrir | Bajo | `LEEME.txt` |

### 9.2 Deuda
1. `AuditLog` se puede **borrar** (el disparador solo impide modificar); bloquear el DELETE exige cambiar la limpieza
   de 19 pruebas del socio (PLAN-v0.3 §18.2).
2. Las ≈56 llamadas actuales a `writeAudit` siguen sin IP.
3. La regla por IP vive en memoria.
4. `passwordChangedAt` con doble significado.
5. Sin rotación de la llave del 2FA (el formato `kid` la permite después).
6. Sin avisos por correo.
7. Descarga vía Blob en el navegador (varios GB → enlace de un solo uso).
8. ZIP sin contraseña.
9. Sin passkeys.
10. El rescate del único ADMIN depende de que Carlos entre al servidor.

---

## 10. Preguntas para Carlos

| # | Pregunta | Recomendación | Por qué importa |
|---|---|---|---|
| **D41** | ¿2FA **obligatorio para los ADMIN**? ¿Y para los demás? | **Sí para ADMIN**, encendido después de una activación acompañada. Voluntario para los demás | El ADMIN puede todo. **Consecuencia:** si un ADMIN único pierde teléfono y códigos, el soporte eres tú, con un comando en el servidor |
| **D17** | ¿Dónde va la copia externa de los respaldos? | Backblaze B2 con cifrado, u otro proveedor distinto de Contabo | Si se pierde el servidor, hoy se pierde todo |
| **D18 + D42** | ¿Quién guarda la frase de los respaldos **y la llave del 2FA**? | **Tú**, las dos juntas, en un gestor de claves y en papel en un lugar seguro | Sin la frase no se abren los respaldos; sin la llave, al mudarse de servidor todos reinscriben el teléfono |
| **D43** | ¿Quién autoriza el rescate del único ADMIN y cómo se confirma que es él? | **Solo tú**, por SSH, después de llamar al **teléfono que consta en el contrato** (nunca al que te den en la llamada; el sistema no guarda teléfonos) y de confirmar por su correo. Pedir a cada cliente **dos ADMIN** | Es la puerta trasera del 2FA |
| **D44** | ¿Apruebas las librerías? Programa: `qrcode-generator` (QR) y `yazl` (ZIP). Solo pruebas: `yauzl`, `@types/yazl`, `@types/yauzl` | **Sí** | La regla del plan exige tu visto bueno |
| **D45** | Un cliente se va: ¿cuánto guardamos sus datos después de entregar la exportación? | **90 días** y luego borrado con constancia, salvo pedido o requisito legal; confirmarlo con abogado o contadora. **Ojo:** la ley obliga **al cliente** a conservar 10 años; por eso la exportación se abre sin el sistema (CSV, PDF y XML) | Contrato y Ley 172-13 |
| **D46** | ¿Qué nombre aparece en la app del teléfono? | El nombre comercial (o «Finanzas») | Es lo que ve el usuario |
| **D47** (nueva) | Los papeles de trabajo de la auditora (áreas, procedimientos, marcas, borradores de hallazgos): ¿salen en la exportación del dueño? ¿Y al cancelar? | **No, en ningún caso.** Salen el encargo, los hallazgos ya comunicados, sus respuestas y los archivos del informe. La auditora exporta lo suyo aparte (más adelante) | Respeta D3 y R5: el dueño no ve el trabajo de la auditora hasta que ella lo comunica |
| **D48** (nueva) | ¿Cómo se entrega la exportación a un cliente que se va? | En persona en una memoria USB, o por enlace que vence en 7 días, con el ZIP cifrado con 7-Zip (AES-256) y la contraseña dicha por teléfono. **Nunca** por correo sin cifrar | Es el archivo con todos sus datos |
| — | ¿Doy por bueno actualizar la tarea 0.3 de `docs/PLAN-v0.2.md`? | Sí | La ficha S0 exige tu visto bueno |

---

## 11. Pendientes y hallazgos

- **Aprobación:** revisor-critico y seguridad revisaron la v1.0. Esta v1.1 incorpora sus cambios y conviene una
  **lectura de confirmación** de ambos antes de presentársela a Carlos. No la apruebo yo.
- **Tarea 0.3 de `docs/PLAN-v0.2.md`:** sin modificar (requiere visto bueno). Texto propuesto: «| 0.3 | devops |
  **Respaldos** (11.2): servicio y restauración ensayada (hechos, `2672217`). **Cifrado, copia externa y aviso de
  fallo pasan a la Fase 3 de la v0.3 (tarea 3.3, paquete S3)**; esperan D17 y D18 | L |».
- **Fichas A1 y A3 (auditoría):** el aviso de la cuenta auditora (PLAN-v0.2 §5.6) debe incluir `TWO_FACTOR_RESET` y
  `ADMIN_GRANTED`. Las tablas `Audit*` deben entrar en el registro de la exportación según D47. Anotado; no modifiqué
  esas fichas.
- **Fichas actualizadas en esta versión:** S1, S2, S3 y S4 (alcance, archivos y criterios) y `docs/tablero-paquetes.csv`
  (S2 depende de S1; esperas humanas D44, D47, D41).
- D33 sigue pendiente aparte. Los números D41–D48 se renumeran si ya estaban usados.

---

## Anexo A — Las 18 decisiones (para el PR)

| # | Tema | Decisión | Sección |
|---|---|---|---|
| 1 | Método | TOTP RFC 6238 propio; plan B `otpauth` | 2.1, 3.4 |
| 2 | Secreto | AES-256-GCM, llave propia, AAD por usuario, `v1:<kid>`; sin rotación por ahora; `kid` desconocido = 503 | 3.5 |
| 3 | Recuperación | 10 × 80 bits, SHA-256, uso único, límite propio | 3.6, 3.11 |
| 4 | Desafío | JWT con `Buffer.from(hkdfSync())`, `aud`/`typ`/`sub`, 5 o 10 min, sin `jti` | 3.8 |
| 5 | Límites | Reserva atómica en `UserTwoFactor` (5 → 15 min; 10/día) + IP en memoria con `consume` (/64); login y cambio de clave también con `consume` | 3.11 |
| 6 | Reuso y reloj | ±1 paso; `lastUsedStep` atómico; se fija sin comparar al cambiar de secreto | 3.4 |
| 7 | Obligatorio | D41; variable vacía por defecto; activación acompañada y comando de estado antes de encenderla; inscripción en el login solo con ventana de 72 h | 3.3, 3.8, 8 |
| 8 | Restablecer | E9 con confirmación reforzada, ventana de 72 h, contadores en cero; rescate de Carlos con `--motivo` | 3.10 |
| 9 | Almacenamiento | `UserTwoFactor` y `UserRecoveryCode` | 3.2 |
| 10 | Bitácora | Acciones existentes + `changes.event`; `meta`; sin secretos en `changes`; disparador contra UPDATE; E11 | 3.12 |
| 11 | Política de rutas | Listas explícitas; 422 para confirmaciones con sesión | 3.7, 3.14 |
| 12 | QR y CSP | SVG `data:` desde el backend | 3.15 |
| 13 | Qué se exporta | Todo lo de la empresa, sin secretos ni papeles de la auditora (D47) | 4.1, 4.2 |
| 14 | Formato | ZIP con CSV, adjuntos, XML, `LEEME.txt` y `manifest.json` | 4.3 |
| 15 | Tablas futuras | Registro + prueba (`ModelName`, `ScalarFieldEnum` y `schema.prisma`) | 4.2, 4.4 |
| 16 | Memoria | Flujo perezoso, semáforo global, 30/45 min, corte a los 60 s, < 100 MB, sin buffers en los proxies | 4.5 |
| 17 | Permisos | Solo ADMIN con confirmación reforzada; 3 por hora; bitácora | 4.6, 4.7 |
| 18 | Al cancelar | `CANCELLATION`; comando con `run --rm`, carpeta 700, `--motivo`, borrado al entregar; D45 y D48 | 4.8 |

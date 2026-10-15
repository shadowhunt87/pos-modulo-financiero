# Punto de partida: qué se hizo, dónde quedamos y por dónde seguir

Última actualización: **15-oct-2026**, rama `main`, commit `afe9af2` (la rama `integracion` ya se integró en `main`).
Léelo antes de retomar el trabajo en este módulo, seas una persona o una IA. Al cerrar una etapa, actualízalo.
**El diario de cada sesión está en `docs/BITACORA.md`** (lo último que pasó, arriba). Al cerrar una sesión, agregar ahí una entrada.

---

## 1. Qué es esto en dos líneas

Módulo financiero y contable para empresas de República Dominicana (Sirtech), con NCF/e-CF, formatos DGII, bancos, reportes
y auditoría. Backend **NestJS 11 + Prisma 7 + PostgreSQL** en la raíz; frontend **Angular** en `frontend/`. El dueño es
**Carlos**, que no es programador, y el código es copropiedad de su **socio**, que desarrolla el taller mecánico
(`../../taller-frontend`, en Vue, y su backend propio).

## 2. Reglas que no se rompen

1. **No leer, copiar ni imprimir** `.env`, `.env.production`, `.env.test`, `.credenciales-pruebas.txt` ni sus respaldos.
   Si hace falta un dato de ahí, se le pide a Carlos que lo mire en su editor.
2. **Nunca correr pruebas ni migraciones contra la base de las contadoras**, que es el ambiente de pruebas
   finanzas.biodesch.com con el compose `financiero-pruebas`.
3. **No hacer push ni fusionar** en GitHub sin preguntarle a Carlos. Todo lo de esta etapa está **solo en local**.
4. **El dinero va con Decimal**, nunca con float. **Ningún valor fiscal se escribe en el código** (R9): todo va como parámetro
   con vigencia (`FiscalParameter`).
5. **Cada consulta y cada escritura filtra por `companyId`**, y `writeAudit` va dentro de la misma transacción.
6. **Los textos van en español sencillo.** Lo que tenga que ejecutar Carlos se explica paso a paso.
7. **Hay que imitar las convenciones del socio y tocar lo menos posible de sus archivos.** Cada cambio en un archivo suyo se le
   avisa en `docs/AVISO-SOCIO-*.md`.
8. **Cuando falta una decisión de Carlos**, se toma la opción recomendada del plan y se anota.
9. **Preferencia actual de Carlos:** primero desarrollo y después QA. No se escriben pruebas nuevas ahora; basta con que compile
   y con que no se rompan las que ya existen.
10. **Los commits terminan con** `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

Las guías que mandan son `CLAUDE.md`, `docs/GUIA-PRODUCTO.md` (14 principios y checklist por pantalla) y
`docs/GUIA-CONTABLE-FISCAL.md` (R1–R12 y checklist contable).

## 3. Ambientes y bases de datos

| Base | Dónde | Para qué |
|---|---|---|
| `financial_db` | contenedor `financial-db`, `localhost:5432` | desarrollo en la máquina de Carlos (usa `.env`) |
| `financial_test` | contenedor `financial-db-test`, `localhost:5434`, en memoria (tmpfs) | pruebas automáticas; se levanta con `docker compose up -d postgres-test` |
| ambiente de pruebas de las contadoras | servidor, https://finanzas.biodesch.com | **no se toca** desde aquí |

La base de pruebas usa los datos de `docker-compose.yml` (`financial_user` / `financial_pass` / `financial_test`), que no son secretos.

## 4. Cómo se verifica

```
npm run build && npm test && npm run test:e2e        # backend (e2e necesita postgres-test)
cd frontend && npx ng build && npx ng test --watch=false && node scripts/verificar-ayuda.mjs
```
Última corrida completa: **504 e2e, 45 pruebas unitarias del backend y 23 del frontend en verde**. Verificar-ayuda: 58 rutas,
15 secciones. Después de esa corrida solo se tocó la cola y el proveedor de e-CF, el comando de contraseña y el seed; se
volvieron a correr las pruebas de e-CF (15/15).

## 5. Qué se hizo (checklist del PDF «Módulo financiero: deploy y usuarios», etapas 0–12)

Cada paquete es un commit con su ID en el mensaje (`git log --oneline fase-1..integracion`).

| Paquete | Qué hace |
|---|---|
| T5b, T3a, N3, FIX, E1a, E3, S5, E4a | ramas `wp/*` que ya existían, fusionadas en `integracion` |
| **N1** | mes ya declarado, «Corregir» con reverso, guía hacia la nota de crédito |
| **N2a-d** | parámetros fiscales con vigencia (solo inserción), cargador con simulación, catálogo inicial, ficha fiscal |
| **S1 / S4** | verificación en dos pasos (TOTP propio, códigos de emergencia) y sus pantallas; comandos del operador |
| **S2** | exportación completa de una empresa en ZIP, con manifest SHA-256 |
| **S3** | respaldos cifrados con gpg y copia externa lista para configurar (`docs/OPERACION-BACKUPS.md`) |
| **E1b-c, E2, E4** | «Preparar mi contabilidad», datos de ejemplo borrables, configuración inicial guiada y pantallas guiadas |
| **A1–A5** | rol AUDITOR, encargos, papeles de trabajo, hallazgos, marcas e informe de revisión |
| **N4** | revisión del mes: cuadres 607/606/retenciones contra el mayor |
| **N5** | calendario fiscal (obligaciones y feriados como datos), «Ya lo presenté», fin de los comprobantes B |
| **N6** | 609 en TXT, hojas IT-1 e IR-17 casilla por casilla, cuadre 607 ↔ IT-1, PDF y Excel |
| **N7, N7b, N7c** | e-CF con proveedor certificado: conexión cifrada, adaptadores sandbox y HTTP configurable, cola con reintentos y contingencia; la cola ya no tumba la app si falla |
| **D4** | notas de versión dentro del sistema («Novedades») |
| **S1b** | `dist/cli/password-reset.js` (rescate de contraseña) y el seed declarado en `prisma.config.ts` (Prisma 7) |
| **UI v2** | menú por secciones en acordeón (`frontend/src/app/layout/nav.ts`; al mover una opción, actualizar las rutas «Sección › Opción» de `public/manual`), diseño renovado con Inter (`@fontsource-variable/inter`), avisos fiscales agrupados |
| **P1, P2, P3** (rama `modulos-catalogo-inventario-rrhh`) | Catálogo de productos (`/products`), inventario con costo promedio (`/inventory`) y RRHH y nómina dominicana (`/hr`). Backend y frontend; plan en `docs/PLAN-catalogo-inventario-rrhh.md` y aviso en `AVISO-SOCIO-V04.md` |
| docs | `AVISO-SOCIO-N1.md` y `AVISO-SOCIO-V03.md` (archivos del socio que cambiaron), `scripts/reparar-borrador-ecf.sql` |

### Dónde está cada cosa

- **Backend:** `src/<módulo>/`, con `fiscal/` (parámetros y calendario), `dgii-returns/` (606/607/608/609, IT-1, IR-17),
  `ecf/` (proveedor, cola e importación), `auditing/`, `data-export/`, `auth/two-factor/` y `cli/` (comandos del operador).
- **Frontend:** `frontend/src/app/features/<área>/`. La ayuda y el manual se validan con `frontend/scripts/verificar-ayuda.mjs`.
- **Migraciones:** `prisma/migrations/` (19). Las de esta etapa empiezan con `20261015…`.
- **Datos fiscales:** `docs/normativa-dgii/parametros/` (catálogo inicial, calendario y plantilla de feriados). Muchos valores
  están marcados **«Por validar»**.
- **Operación:** `docs/OPERACION.md` (parámetros fiscales, e-CF, contraseña olvidada) y `docs/OPERACION-BACKUPS.md`.
- **e-CF:** `docs/ecf-proveedores/PREGUNTAS_AL_PROVEEDOR.md` y `PLANTILLA_configuracion.json`.
- **Plan y reparto:** `docs/PLAN-v0.3.md`, `docs/PAQUETES-DE-TRABAJO.md`, `docs/tablero-paquetes.csv` y
  `docs/DECISIONES-APROBADAS.md`.

## 6. Dónde quedamos (14-oct-2026)

1. **La base local (`financial_db`) quedó reparada el 15-oct-2026**: `migrate status` dice «up to date» y ya se puede entrar.
   Quedan restos vacíos del borrador e-CF que no estorban. El detalle y cómo limpiarlos están en `docs/BITACORA.md`
   (entrada del 15-oct).
2. **Contraseña local olvidada:** el 15-oct se le puso una clave temporal al admin (ver `BITACORA.md`). Para la próxima vez, la solución es `node --env-file=.env dist/cli/password-reset.js --lista` y luego
   `--email <correo> --motivo "..."`. Lo corre él en su terminal, para que la clave no quede en la conversación.
3. **Proveedor de e-CF:** Carlos tiene dos candidatos, pero los contrata el cliente. El módulo ya acepta cualquier API web
   (JSON o XML; token, usuario y clave, inicio de sesión o API key). Si da los nombres, se revisa su documentación pública y se
   arma un `docs/ecf-proveedores/<proveedor>.json`.
4. **Nota que se le dio:** desarrollo **8/10**; proyecto listo para producción **6/10**.

## 7. Qué falta y por dónde seguir (en este orden)

1. **Probar catálogo, inventario y RRHH** (backend y frontend listos en la rama `modulos-catalogo-inventario-rrhh`). Antes,
   la base local necesita `migrate deploy` y la carga de `2026-10-15_nomina.json` (bitácora del 15-oct (2)).
2. **Revisar la aplicación a mano** y anotar lo que haya que corregir en `docs/BITACORA.md` (moneda RD$, fechas, textos
   técnicos visibles y avisos apilados; detalle en la bitácora).
2. **QA y revisión de seguridad formal** de todo lo de esta etapa: agentes `qa` y `seguridad` según `CLAUDE.md`. Carlos lo dejó
   para después; preguntarle antes de empezar.
3. **El trabajo de `integracion` ya está en `main`** y en los dos remotos (`origin` y `mio`). Falta confirmar que el socio
   recibió `AVISO-SOCIO-V03.md` y decidir qué pasa con `fase-1`.
4. **Integración con el taller** (fuera del PDF; depende del acuerdo con el socio **a más tardar el 23-oct**, T0). Paquetes
   pendientes, detallados en `docs/INTEGRACION-TALLER.md` y `docs/tablero-paquetes.csv`:
   - T0b, T1, T1s;
   - T2a-d;
   - T3b-d;
   - T4;
   - T5a, T5q;
   - T6, TD;
   - V1a, V1b. V2-V4 siguen **en pausa**.

   Ya están hechos T3a y T5b.
5. **Lo que entregan Carlos o las contadoras.** El sistema ya tiene dónde ponerlo:
   - los feriados 2026/2027 (`PLANTILLA_feriados.json`);
   - el instructivo oficial del 609;
   - la validación de los mapas de casillas del IT-1 y del IR-17;
   - la fecha de fin de los comprobantes B para los Grandes Nacionales (se dejó fuera a propósito para no inventarla);
   - la validación de los valores «Por validar»;
   - D37: retener al emitir o al pagar;
   - el proveedor de e-CF, su configuración y los XSD;
   - D17/D18: el destino de la copia externa y quién guarda la frase de los respaldos;
   - la prueba cronometrada de los 15 minutos con una persona nueva;
   - aceptar la invitación de GitHub;
   - aprobar el lanzamiento.

## 8. Tropiezos conocidos (para no repetirlos)

- **Prisma 7:** `prisma db seed` solo funciona si el seed está declarado en `prisma.config.ts` (`migrations.seed`). Ya lo está.
- **El seed no cambia la contraseña de un usuario que ya existe** (`upsert` con `update: {}`). Para eso está `password-reset.js`.
- **Los comandos de `dist/cli/` no cargan `.env` por sí solos.** Se usan con `node --env-file=.env …` o dentro del contenedor.
- **`ECF_WORKER_INTERVAL_MS` tiene un mínimo de 5000**; la validación de variables rechaza menos.
- **Pruebas del socio con fechas:** las de dgii y exports anulaban facturas de marzo-2025, y se arreglaron fijando el reloj al
  1-abr-2025 con `vi.useFakeTimers`.
- **El documento de envío de e-CF** solo se crea para los e-CF emitidos por el sistema (bandera `emitted.here`), no para los
  importados de proveedores.
- **La rama `wp/N3-ecf-borrador` no se fusiona.** Si una base recibió su migración, se repara con
  `scripts/reparar-borrador-ecf.sql`.
- **Los parámetros fiscales son de solo inserción:** en pruebas se borran con `SET LOCAL app.fiscal_maintenance='on'`, como en
  `test/global-setup.e2e.ts`.

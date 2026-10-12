# N2b — Cargador del catálogo fiscal

**Carril:** N · **Nivel:** N1 (+ N2 para el JSON) · **Tamaño:** L + S · **Ola:** 1 · **Rama:** `wp/N2b-cargador` · **Asignado (provisional):** IA-N
**Espera a:** **N2a** fusionado (usa sus tablas) y a **los valores de la contadora** (D3 / tarea 0.1). Sin valores validados, el catálogo se carga todo como **Por validar**; no inventes valores.
**Ficha del 2026-10-12** · PLAN-v0.3 v1.2, tareas 2.2 y 2.3 (§5.5, §5.6, D25, D38).

## 2. Objetivo
Un comando que carga cambios de la DGII como **datos** (sin programar): simula primero (`--dry-run`), rechaza archivos mal formados, solo inserta, y dice qué facturas usaron un valor corregido (R9, R3). Incluye el catálogo inicial en JSON.

## 3. Lee antes
- Base: `CLAUDE.md`; `AGENTS.md` (si existe); `docs/PAQUETES-DE-TRABAJO.md` §1 y §4; `docs/GUIA-CONTABLE-FISCAL.md` R9, §3 (valores y su estado), §10.
- **`docs/PLAN-v0.3.md` §5.1, §5.2 (fecha mínima), §5.5 (cargador), §5.6 (catálogo), §13 (`fiscal-parameters.e2e-spec.ts`), §16 D25, D26, D33, D38.**
- `docs/normativa-dgii/README.md` (documentos que Carlos aún no baja) y `docs/fuentes/investigacion-contable-fiscal-2026-10.md` (valores y fuentes).
- Código: lo que dejó N2a en `src/fiscal/`; `src/prisma/prisma.service.ts` (cómo se conecta: `PrismaPg` + `DATABASE_URL`); `scripts/generar-catalogo-rd.mjs` (ejemplo de script con archivo de entrada); `nest-cli.json`; `Dockerfile` (la imagen `api` copia solo `dist/`).

## 4. Alcance (verificado)
- **Crear:** `src/fiscal/load-parameters.ts` (compila a `dist/fiscal/load-parameters.js`, ejecutable como `node dist/fiscal/load-parameters.js <archivo.json> [--dry-run] --commit <hash-git>`); lógica reutilizable en un servicio de `src/fiscal/` (para que el e2e la pruebe sin proceso aparte); carpeta `docs/normativa-dgii/parametros/` con `AAAA-MM-DD_<tema>.json`.
- **Modificar:** `test/fiscal-parameters.e2e-spec.ts` (agrega los casos del cargador), `docs/OPERACION.md` (paso a paso para devops/Carlos: cómo copiar el archivo al contenedor y correr el comando).
- **No toques:** `prisma/schema.prisma` (ya lo hizo N2a), `invoicing.service.ts`.

## 5. No hagas
- No inventes valores ni fuentes: lo que no esté en la Guía contable §3 o en la contadora se omite o se deja marcado «Por validar» con nota. `RECARGO_MORA` e `INTERES_INDEMNIZATORIO` quedan **fuera** del catálogo (nada los usa).
- No permitas `UPDATE`/`DELETE` de parámetros por ningún camino. No agregues una pantalla ni un endpoint de carga.
- No marques «Oficial» por tu cuenta: eso lo hace una validación con nombre (D33).
- No guardes credenciales en el archivo ni en el repo.

## 6. Pasos sugeridos
1. Define el esquema del archivo (estricto: **cualquier campo desconocido = error**) con los campos de §5.1 y valida cada fila (tipo, `base` solo en retenciones, fechas, `value` según `kind`).
2. Regla de fecha mínima: cada clave que entra en un cálculo debe tener valor desde el **2025-01-01**; si no, se rechaza todo el catálogo.
3. `--dry-run`: imprime diferencias (filas nuevas, revisiones, validaciones) y **no escribe nada**.
4. Carga real en **una transacción**: guarda `sha256` del archivo y el `--commit` en `FiscalParameterLoad`; si una fila ya existe igual, la omite (idempotente).
5. Corrección de un valor Por validar = **revisión nueva** con `supersedesId`; el informe lista **exactamente** los documentos emitidos con la fila anterior (por `fiscalParameterId`).
6. Escribe el JSON inicial del §5.6 (ITBIS 18/16/0, retenciones, ISR, ISA, umbrales 250.000, banderas 607/608 en 0, fin de las B, contingencia, mapas de casillas como TABLE «Por validar»).
7. e2e: `--dry-run` no escribe; campo desconocido → rechazo; antes y después de una carga ninguna fila anterior cambia; informe de afectados.

## 7. Criterios de aceptación
- `--dry-run` sobre el catálogo completo no cambia una sola fila (conteo de filas igual antes y después).
- Un archivo con un campo desconocido, un `kind` inválido o sin valor desde 2025-01-01 → rechazo con mensaje claro y **nada** escrito.
- Cargar el mismo archivo dos veces no duplica filas.
- Una revisión nueva de `TEST_RET` (15 → 16 %) crea fila con `supersedesId`; `valueAt` devuelve la nueva; el informe lista las facturas que usaron la vieja.
- La carga guarda `sha256` y `gitCommit`.
- Todas las claves del §5.6 existen en el JSON con su `source` y estado; las dudosas están marcadas.

## 8. Cómo probar
```
docker run -d --name pg-N2b -e POSTGRES_PASSWORD=<clave-local-inventada> -e POSTGRES_DB=fin_n2b -p 55437:5432 postgres:18-alpine
# TU .env local (no se sube): DATABASE_URL=postgresql://postgres:<clave>@localhost:55437/fin_n2b
#   JWT_SECRET=<openssl rand -hex 64>   UPLOADS_DIR=./uploads-n2b
npm ci && npx prisma migrate deploy && npx prisma generate
npm run build && npm test && npm run test:e2e
node dist/fiscal/load-parameters.js docs/normativa-dgii/parametros/<archivo>.json --dry-run --commit $(git rev-parse HEAD)
```

## 9. Entregables y PR
Cargador + catálogo JSON + pruebas + paso a paso en `OPERACION.md`. PR con: **Qué hice**, **Archivos tocados**, **Decisiones**, **Cómo probar**, **Qué falta** (valores «Por validar», documentos de Carlos). Seguridad revisa este PR.

## 10. Riesgos y trampas
- **Valor mal cargado = error fiscal grave** (PLAN-v0.3 §18.1): `--dry-run`, filas inmutables e informe por `fiscalParameterId` son la defensa.
- Retenciones de alquiler y honorarios **antes del 1-jul-2026** (histórico desde 2025-01-01): las fuentes del repo solo dicen que honorarios era 10 %; el resto lo da la contadora. No lo supongas.
- El 2 % de tarjeta (base TOTAL) lo confirma la contadora (D37).
- La imagen `api` solo trae `dist/`: el JSON no está dentro; documenta cómo se copia al contenedor.
- Las IT-1/IR-17 `*_MAPA_CASILLAS` (TABLE) entran como «Por validar» y bloquean N6 hasta validarse.

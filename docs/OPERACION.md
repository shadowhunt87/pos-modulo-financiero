# Operación del módulo financiero

Para respaldos y restauración vea `docs/OPERACION-BACKUPS.md`. Este archivo cubre tareas periódicas.

## Exportar los comentarios de las contadoras (cada semana o al cerrar cada fase)

Las contadoras envían comentarios desde la pantalla de Ayuda. Se guardan en la tabla `Feedback` del ambiente de pruebas (finanzas.biodesch.com). Este guion los saca a un archivo CSV para hacer el triaje y convertirlos en tareas (docs/PLAN-v0.2.md, 10.3). Es de solo lectura: no cambia nada en la base.

**Paso a paso**
1. Abra una terminal en el servidor (la misma que usa para los respaldos).
2. Escriba y pulse Enter: `cd /home/claude/claude-docker/proyectos/Software/financial-backend`
3. Escriba y pulse Enter: `scripts/feedback-export.sh`
4. Al final debe decir `OK: N comentario(s) exportados a ...csv`. Ese archivo queda en `/home/claude/claude-docker/proyectos/Software/financiero-backups/feedback/` (carpeta privada, solo el usuario `claude` puede leerla).
5. Para ver los archivos: `ls -lh /home/claude/claude-docker/proyectos/Software/financiero-backups/feedback`
6. Abra el CSV con su programa de hojas de cálculo (Excel, LibreOffice) o cópielo a su computadora por SFTP.

**Opciones** (todas opcionales)
- Solo los nuevos desde una fecha: `scripts/feedback-export.sh --desde 2026-10-17`
- Solo un estado: `scripts/feedback-export.sh --estado NEW`
- Otra carpeta de salida: `FEEDBACK_DIR=/ruta scripts/feedback-export.sh`

**Columnas**: fecha (UTC), empresa, usuario, rol_actual (el rol que tiene hoy, no el de cuando escribió; vacío si el usuario ya no existe), tipo (CONFUSING = no entendí, BROKEN = algo no funciona, IDEA), ruta (pantalla), mensaje, estado, respuesta, taskRef (número de la tarea).

**Si dice `FALLA: la tabla "Feedback" no existe`**: la actualización de la base que incluye los comentarios todavía no se ha desplegado. No es un error del guion; avise a Claude. No se crea ningún archivo en ese caso.

**Notas de seguridad**
- Los comentarios son texto escrito por usuarios; el guion antepone una comilla a los textos que empiezan con `=`, `+`, `-` o `@` para que la hoja de cálculo no los ejecute como fórmula.
- Los CSV contienen nombres y comentarios de las contadoras: no los suba a sitios públicos ni al repositorio.
- El guion no imprime claves: usuario y base se toman de dentro del contenedor.

## Manual de ayuda (nginx)

Los archivos de `/manual/` (ayuda.json, .md e imágenes) se sirven con `Cache-Control: no-cache`: el navegador revalida en cada uso y los cambios del documentador se ven al recargar, sin esperar. El resto de estáticos (js, css, png...) sigue con caché de 1 año; la excepción `location ^~ /manual/` en `frontend/deploy/nginx.conf` es la que hace que el manual no caiga en esa regla.

## Vigilancia de dependencias (librerías de terceros)

**Cada cuánto:** el primer lunes de cada mes y antes de cada lanzamiento, o el mismo día si GitHub avisa de una
alerta de seguridad. Lo corre Claude (o quien mantenga el código) y anota el resultado en el PR del mes.

**Cómo** (desde la raíz del repositorio):
```
npm audit --omit=dev                 # backend: solo lo que corre en el servidor
(cd frontend && npm audit)           # pantallas
npm ls exceljs uuid                  # de dónde viene cada librería señalada
```
`npm audit fix --force` **no se usa**: propone bajar Prisma de la 7 a la 6 o `exceljs` a la 3, y eso rompe el sistema.
Una alerta se resuelve actualizando la librería con su propio PR y la suite completa en verde.

**`exceljs` lee archivos que suben los usuarios** (importar el plan de cuentas): `src/chart-of-accounts/chart-of-accounts.file.ts`
limita el tamaño del zip, los rangos y el tamaño antes de leer. También escribe las exportaciones a Excel
(`src/exports/xlsx.renderer.ts`) y se usa en `src/chart-of-accounts/chart-of-accounts.service.ts`. Si sale una alerta de
`exceljs` que afecte la **lectura** de archivos, se trata como urgente: mientras se corrige, se puede pedir que solo
el ADMIN importe.

**Resultado del 2026-10-14** (rama `fase-1`): pantallas **0** alertas. Backend: 8 (4 altas, 4 moderadas), ninguna nueva:
| Librería | Gravedad | Viene de | Riesgo real aquí |
|---|---|---|---|
| `mysql2`, `deepmerge-ts` (vía `@prisma/config`) | Alta | `prisma` 7.10.0 (herramienta de migraciones) | Bajo: solo corre en el contenedor `migrate`, no recibe datos de usuarios. Esperar la corrección de Prisma 7 |
| `uuid` 8.3.2 | Moderada | `exceljs` 4.4.0 y `bull` 4.16.5 | Bajo: la falla es al pasar un búfer propio a `uuid` v3/v5/v6, que el sistema no hace |
| `bull`, `@nestjs/bull` | Moderada | dependencia directa **que no se usa** | Ninguno en uso. Quitarlas cierra 2 alertas (lo decide Carlos con el socio; ver PLAN.md, deuda 16) |

## Cargar o corregir valores fiscales (cargador, PLAN-v0.3 §5.5)

Los valores de la DGII (tasas, umbrales, fechas) **no se escriben en el código ni en una pantalla**: se cargan desde un archivo
JSON fechado en `docs/normativa-dgii/parametros/AAAA-MM-DD_<tema>.json`. El cargador **solo agrega** filas; nada se edita ni se borra
(la base de datos también lo impide). Corregir un valor = una fila nueva con `"revision": 2` (o la que siga) para la misma clave y fecha.

**Antes de cargar:** Carlos autoriza la carga. Si el archivo valida valores (`"validations"`), el nombre es el de la contadora que los revisó.

1. Sube el archivo a git y anota su commit: `git log -1 --format=%H -- docs/normativa-dgii/parametros/<archivo>.json`
2. Copia el archivo al contenedor del API (la imagen solo trae `dist/`):
   `docker cp docs/normativa-dgii/parametros/<archivo>.json <contenedor-api>:/tmp/<archivo>.json`
3. **Simula primero** (no escribe nada; muestra lo que haría y los errores):
   `docker exec <contenedor-api> node dist/fiscal/load-parameters.js /tmp/<archivo>.json --dry-run`
4. Si la simulación está bien, carga de verdad (todo o nada, en una sola transacción):
   `docker exec <contenedor-api> node dist/fiscal/load-parameters.js /tmp/<archivo>.json --commit <hash> --by "Nombre de quien carga"`
5. Si el informe lista **documentos emitidos con un valor que se corrige**, pásaselo a la contadora: ella decide si hacen falta notas de crédito o débito.
6. Revisa en **Configuración › Valores fiscales** que se vea el valor nuevo.

Cargar dos veces el mismo archivo no duplica nada. Un archivo con un campo desconocido, una tasa sin valor desde el 01/01/2025
o una fila que ya existe con otros datos se rechaza completo.

**Primera vez:** el catálogo inicial es `docs/normativa-dgii/parametros/2026-10-14_catalogo-inicial.json`. Sin él, las facturas con
impuestos enlazados y el 607 dan «No hay un valor vigente…».

## Facturación electrónica con el proveedor certificado (N7)

Todo está programado; lo que falta es **configuración** cuando se elija el proveedor:

1. Genera la llave de las credenciales (no la imprimas en pantallas compartidas) y ponla en `.env.production`:
   `ECF_ENCRYPTION_KEY=$(openssl rand -hex 32)`. Guarda una copia junto con la frase de los respaldos (como la del 2FA).
2. Reinicia el `api`. El trabajador que envía los e-CF arranca solo (`ECF_WORKER_ENABLED=true`, cada 30 s).
3. En la aplicación, el ADMIN de cada empresa va a **Configuración › Facturación electrónica: conexión**:
   - primero con **Pruebas** (proveedor `sandbox`) para practicar el flujo completo sin enviar nada a la DGII;
   - luego con **Proveedor certificado** (`http`), pegando la configuración técnica del proveedor (URL `https`, rutas de envío y de
     estado, formato `json` o `xml`, y si hace falta los nombres de sus campos en `fields` y sus estados en `statusMap`) y su token.
4. Carga las secuencias **E** autorizadas por la DGII en Comprobantes fiscales (si el sistema numera los e-NCF).
5. **Probar la conexión** y emitir una factura de prueba en el ambiente de pruebas del proveedor.

Si el proveedor usa otra forma de autenticarse o un protocolo distinto, se agrega un adaptador en `src/ecf/providers/`
(una clase que cumple `EcfProvider`) y una línea en `PROVIDERS` de `src/ecf/ecf-connection.service.ts`.

# Bitácora del módulo financiero

Registro por sesión de trabajo: qué se hizo, qué quedó a medias y por dónde seguir. **La entrada más reciente va arriba.**
El estado general (reglas, ambientes, qué existe y qué falta) está en `docs/PUNTO-DE-PARTIDA.md`; esta bitácora es el diario.

Al cerrar una sesión, agregar una entrada con este formato:

```
## AAAA-MM-DD — título corto
**Rama / commit:** …
**Qué se hizo:** …
**Quedó pendiente:** …
**Siguiente paso:** …
**Ojo con:** … (tropiezos para no repetirlos)
```

---

## 2026-10-15 (2) — Backend de catálogo, inventario y RRHH

**Rama / commit:** `modulos-catalogo-inventario-rrhh` (sale de `main`): `8052252` P1, `9c3bc9b` P2 y `ecab5ce` P3. **Sin push.**

**Qué se hizo** (diseño y decisiones en `docs/PLAN-catalogo-inventario-rrhh.md`):
- **P1 Catálogo** (`/products`): productos y servicios con precios, impuestos y cuentas. La línea de factura acepta `productId`.
- **P2 Inventario** (`/inventory`): costo promedio ponderado, kárdex y ajustes `AJ-`. Facturación mueve existencias al
  emitir y las revierte al anular. No se vende sin existencia.
- **P3 RRHH y nómina** (`/hr`):
  - empleados, departamentos, conceptos y configuración de nómina;
  - nómina con TSS (con topes), ISR, INFOTEP y regalía pascual, que se calcula, se contabiliza (`NOM-`), se paga desde
    un banco y se anula;
  - reportes del mes de la TSS y del IR-3;
  - solo ADMIN y ACCOUNTANT pueden usarlo.
- Valores legales de la nómina en `docs/normativa-dgii/parametros/2026-10-15_nomina.json`, todos «Por validar». El salario
  mínimo cotizable se sacó de las páginas oficiales de la TSS.
- **Arreglo del cargador fiscal:** comparaba las tablas JSON por el orden de las claves, así que recargar el mismo archivo se
  rechazaba.
- **Verificación:**
  - build sin errores nuevos de tipos;
  - 45 pruebas unitarias y 504 e2e en verde;
  - dos pruebas de humo temporales (no versionadas) con montos calculados a mano: kárdex = mayor en cada paso, y nómina
    con TSS, ISR, asiento, pago, regalía y anulación.

**Para verlo en la base local (`financial_db`), lo corre el dueño en su terminal:**
```
npx prisma migrate deploy
npm run build && node --env-file=.env dist/fiscal/load-parameters.js docs/normativa-dgii/parametros/2026-10-15_nomina.json --commit ecab5ce --by "Nombre"
```
Después, configurar en el sistema las cuentas de inventario (Configuración contable) y las de nómina (`PUT /hr/payroll-settings`).

**Quedó pendiente:**
- **Frontend** de los tres módulos: catálogo, selector de producto en «Nueva factura», existencias y kárdex, ajustes,
  empleados y nómina.
- Archivos oficiales TSS (SUIR) e IR-3, vacaciones, prestaciones, varios almacenes e importación del catálogo desde Excel.
- Validar con la contadora los valores de nómina y las decisiones (D) del plan.
- Pruebas formales de los tres módulos (QA, cuando el dueño lo decida).

**Siguiente paso:** frontend, en el mismo orden P1 → P2 → P3.

**Ojo con:**
- La base de pruebas (5434) necesita `migrate deploy` después de cada migración nueva; si no, las e2e dan 500.
- `prisma format` realinea bloques: para editar `schema.prisma` con scripts, anclar con expresiones regulares y no con el
  texto exacto.
- Si el cargador rechaza un catálogo («falta su valor desde el 2025-01-01»), cada clave necesita un valor vigente desde la
  fecha mínima del sistema.

---

## 2026-10-15 — Base local reparada y acceso a la interfaz

**Rama / commit:** `main` en `afe9af2`. La rama `integracion` ya no existe: todo su trabajo (hasta `b3a45e0`) está en
`main`, y `main` ya está en los dos remotos (`origin` y `mio`).

**Qué se hizo:**
- **Login con error 500** («The column `User.isService` does not exist»). Causa: a `financial_db` (puerto 5432) le faltaban
  11 migraciones. `ecf_document` había quedado **fallida** porque el borrador `wp/N3-ecf-borrador` ya había creado los tipos
  `EcfStatus` y `EcfOrigin` con otros valores.
- **Reparación (sin borrar nada):**
  ```
  ALTER TYPE "EcfStatus" RENAME TO "Borrador_EcfStatus";
  ALTER TYPE "EcfOrigin" RENAME TO "Borrador_EcfOrigin";
  npx prisma migrate resolve --rolled-back 20261014170000_ecf_document
  npx prisma migrate deploy
  ```
  Resultado: `npx prisma migrate status` dice «Database schema is up to date!» (19 migraciones aplicadas).
- **Login con 401** («Credenciales inválidas»). La clave guardada del admin no era la de `SEED_ADMIN_PASSWORD`, porque el
  seed no cambia la clave de un usuario que ya existe. Se le puso una clave nueva a `admin@sirtech.do` con un `UPDATE` en la
  base, y se comprobó contra el hash. La clave **no** se anota aquí.

**Quedó pendiente:**
- **Restos del borrador en `financial_db`**, que no estorban y están vacíos:
  - las tablas `EcfConfig` y `EcfOutbox`;
  - los tipos `Borrador_EcfStatus`, `Borrador_EcfOrigin`, `GoodsOrService` y `EcfOutboxStatus`;
  - 8 columnas `ecf*` en `Invoice` y 2 columnas en `InvoiceLine`;
  - el registro de `20261014120000_ecf_electronic_invoicing` en `_prisma_migrations`.

  Por ese registro, `migrate status` lo menciona como «not found locally». Para dejarla limpia se puede usar
  `scripts/reparar-borrador-ecf.sql`, revisándolo antes porque se escribió para la base **sin** la reparación de hoy.
  Otra salida es recrear la base desde un respaldo.
- La clave del admin local es temporal y sencilla: **cambiarla desde la interfaz**.
- Revisar la aplicación a mano ahora que ya se puede entrar (punto 1 de «Qué falta» en `PUNTO-DE-PARTIDA.md`).

**Siguiente paso:** revisar la interfaz pantalla por pantalla contra el checklist de `docs/GUIA-PRODUCTO.md` y anotar aquí
lo que haya que corregir. Después, seguir con el punto 2 de `PUNTO-DE-PARTIDA.md` (QA y seguridad, preguntando antes).

**Ojo con:**
- **Antes de reparar una base, leer `PUNTO-DE-PARTIDA.md` §6 y §8.** Ahí ya estaban el diagnóstico y el script del
  borrador. Esta sesión lo redescubrió desde cero.
- No usar `prisma migrate dev` ni `migrate reset` en `financial_db`: al ver la migración desconocida, proponen borrar la base.
- El modo automático de Claude Code **no deja a la IA modificar `financial_db`** (ni `DROP` ni `ALTER`). Esos comandos
  los corre el dueño en su terminal, y la IA verifica después con consultas de solo lectura.
- Un 500 en `/api/auth/login` casi siempre es la base desfasada; un 401 es clave, usuario inactivo o empresa inactiva
  (`src/auth/auth.service.ts`, método `login`).

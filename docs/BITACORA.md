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

## 2026-10-15 (5) — Punto de venta (POS) como vertical del núcleo

**Rama:** `modulos-catalogo-inventario-rrhh`. Commits `feb44a7` (fase 1, núcleo), `c3601d4` (fase 2, backend) y el de la
fase 3 (frontend). **Sin push.**

**Qué se hizo** (pedido: revisar el `pos-backend/` de la carpeta de proyectos, alinearlo con el módulo financiero y hacerle
un frontend):
- **Revisión del paquete `pos-backend/`:** no estaba alineado. 6 modelos chocaban con el núcleo, escribía asientos directo,
  llevaba su propio NCF, 607, 606 y e-CF, duplicaba clientes, inventario y compras, y sus pruebas borraban la base. **No se
  ejecutó ni se copió.** Lo útil (caja, turnos, PIN, promociones) se reescribió sobre los servicios del núcleo
  (`docs/PLAN-POS.md`, decisiones D-POS1 a D-POS6).
- **Fase 1 (núcleo):** origen `VERTICAL` con `sourceModule`, cobros y anulaciones dentro de una transacción ajena,
  reembolso a cliente y rol `CASHIER` (solo entra a rutas `@CashierAllowed()`).
- **Fase 2 (backend `/pos`):** cada venta es una factura del núcleo con su NCF y sus cobros; la devolución es nota de crédito
  más reembolso; turnos con entradas, salidas y sobrante o faltante asentados; PIN de supervisor con bloqueo; promociones.
- **Fase 3 (frontend):** caja de pantalla completa `/pos/caja` y administración (configuración y terminales, productos en
  caja, promociones, turnos con detalle, ventas del POS). Manual `18-punto-de-venta.md` y ayuda de cada pantalla.
- **Probado en el navegador** con un cajero en la empresa demo (base de pruebas): abrir turno, código de barras,
  promociones (10 % y 2×1), cobro en efectivo con cambio, cobro mixto tarjeta y efectivo, suspender y recuperar, salida
  de efectivo, devolución y anulación con PIN de supervisor, cierre con conteo por denominación. Montos revisados a mano
  y todos los asientos cuadran. El cajero que intenta abrir otra pantalla vuelve a la caja.
- Arreglado en la prueba: la clase `.pos` de la caja chocaba con la clase global `.pos` (color de montos positivos) y
  escondía el carrito; la lista de ventas ahora trae el nombre del cliente.

**Para verla en la base local** (la de Carlos, puerto 5432): `npx prisma migrate deploy` (3 migraciones nuevas del POS) y
`npm run build`. Luego, en el sistema: «Punto de venta › Configuración del POS» (cuenta de sobrantes y faltantes, terminal
con su caja de efectivo y su banco, tu PIN de supervisor), «Productos en caja» y la secuencia B02 en NCF. El usuario
cajero se crea con el rol «Cajero» en Configuración › Usuarios.

**Quedó pendiente** (decidido en el plan): venta sin conexión, más de un almacén, kits y listas de precio, conciliación de
liquidaciones de tarjeta, devolución de ventas a crédito no pagadas. El paquete inicial del frontend sigue por encima del
presupuesto de 500 kB (ya lo estaba; el POS se carga aparte).

**Ojo con:**
- `sed -i` reemplaza el archivo y el `ng serve` a veces no se entera: si un cambio no aparece, reiniciar el servidor.
- No usar `pos` como nombre de clase: ya existe en `styles.css`.

---

## 2026-10-15 (4) — Rediseño del frontend (v0.4, «calma»)

**Rama:** `modulos-catalogo-inventario-rrhh`. **Sin push.**

**Qué se hizo** (pedido: diseño profesional, moderno y limpio que no abrume a los testers contables):
- **Sistema de diseño v3** (`frontend/src/styles.css`):
  - lienzo claro, bordes en vez de sombras, un solo acento verde azulado;
  - tablas con encabezados en minúscula y más aire;
  - botón de peligro con borde, no relleno.

  Los nombres de clase no cambiaron, así que las 69 pantallas heredan el diseño.
- **Marco de la aplicación:**
  - menú lateral **claro**;
  - el «Siguiente paso» pasa a la barra superior, junto a las migas de pan;
  - el aviso de novedades es una tarjeta en el pie del menú, no una franja en cada pantalla.
- **Panel:**
  - cifras arriba, con **RD$**;
  - una sola lista **Requiere tu atención** (avisos fiscales, facturas vencidas y asientos por aprobar, o «Todo al día»);
  - **Termina de configurar** muestra solo lo que falta.
- **Fechas:** campo propio `app-date-input`, en **dd/mm/aaaa** con calendario, en los 55 campos de fecha. El nativo salía en
  mm/dd/yyyy en los navegadores en inglés.
- **Estados** con iconos SVG (P6: icono, color y texto). **RD$** en las cifras destacadas de reportes, DGII, años fiscales,
  saldos iniciales, presupuestos, nómina e inventario.
- **En celular** los montos destacados ya no se cortan con «…».
- **Novedades v0.4** en el manual (la versión de `ayuda.json` sube a v0.4, así que aparece el aviso a los usuarios).

**Quedó pendiente:**
- Revisar con los testers pantalla por pantalla. El diseño cambió en todas, pero el contenido de cada pantalla sigue igual.
- Los montos de las tablas siguen sin «RD$»: se usa la moneda en el encabezado o en el total.
- Paleta de comandos Ctrl+K y atajos (P8).

**Ojo con:**
- Angular quita el espacio entre dos elementos en línea (`</strong> <span>`): usar `{{ ' ' }}`.
- `.notice` es flexible: el texto con enlaces va dentro de un `<span>`, si no, cada pedazo queda separado.

---

## 2026-10-15 (3) — Frontend de catálogo, inventario y RRHH

**Rama / commit:** `modulos-catalogo-inventario-rrhh`, `1271206`. **Sin push.**

**Qué se hizo:**
- **Pantallas nuevas:**
  - Productos y servicios, y selector de producto en «Nueva factura»;
  - Existencias, kárdex y Ajustes de inventario (lista, alta y detalle con anulación);
  - Empleados;
  - Nóminas, con su detalle: novedades, contabilizar, pagar y anular;
  - Reportes de nómina (TSS e IR-3);
  - Configuración de nómina;
  - cuentas de inventario en Cuentas automáticas.
- **Menú:** grupos nuevos «Inventario» y «Recursos humanos» (este último, solo ADMIN y ACCOUNTANT).
- **Manual:** secciones 16 y 17 y la ayuda de las 11 pantallas.
- **Arreglo en la regalía:** contaba solo lo registrado en el sistema. Ahora suma también, con el salario mensual, los días
  sin nómina en el sistema.
- **Verificación:**
  - backend: 45 pruebas unitarias y 504 e2e;
  - frontend: 23 pruebas, compilación y verificar-ayuda;
  - capturas con datos de demostración en una copia aparte (backend en el 3001 y frontend en el 4201, contra la base de
    pruebas 5434);
  - clics reales: alta de empleado, ajuste, contabilizar y pagar nómina, y crear la regalía.

**Quedó pendiente:**
- La base local del dueño necesita `npx prisma migrate deploy` y la carga de `2026-10-15_nomina.json` (comandos en la
  entrada (2)). Sin eso, las pantallas nuevas dan error.
- Los detalles de interfaz que ya venían de antes siguen igual:
  - montos sin «RD$»;
  - campos de fecha nativos en formato de EE. UU.;
  - el aviso «Novedades v0.3» en todas las pantallas.
- Archivos oficiales TSS e IR-3, vacaciones, prestaciones e importación del catálogo desde Excel (ver el plan).

**Siguiente paso:** que el dueño pruebe las pantallas. Después, QA formal de los tres módulos y validación de los valores de
nómina con la contadora.

**Ojo con:**
- `void` no se puede usar como nombre de método en las plantillas de Angular (se usó `voidIt`).
- Para probar sin tocar la base del dueño: `PORT=3001 node --env-file=.env.test dist/main.js`, y `ng serve --port 4201` con un
  proxy hacia el 3001.

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

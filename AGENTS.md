# Instrucciones para cualquier IA que trabaje en este repositorio

Módulo financiero y contable para República Dominicana: backend NestJS 11 + Prisma 7 + Postgres (raíz) y frontend
Angular 22 en `frontend/`. Idioma del proyecto, de los textos y de los mensajes al usuario: **español sencillo**.
El código se escribe como el que ya existe: mismo estilo, misma cantidad de comentarios, mismas carpetas.

## Qué hacer primero
1. Lee la **ficha de tu paquete** en `docs/paquetes/<ID>.md`. Es tu encargo: dice qué leer, qué archivos puedes tocar y cómo se acepta.
2. Lee `docs/PAQUETES-DE-TRABAJO.md` (sección 1: reglas).
3. Lee `docs/GUIA-PRODUCTO.md` (sección 6, checklist por pantalla) y `docs/GUIA-CONTABLE-FISCAL.md` (reglas R1–R12 y sección 8).
4. Si algo de esos documentos contradice tu ficha, **detente y pregunta**; no decidas tú.

## Reglas que no se rompen
- **Solo trabajas dentro del alcance de tu ficha.** Si necesitas tocar otro archivo, avisa antes.
- **Una rama por paquete** (`wp/<ID>-nombre`) y un PR. Nunca hagas push a la rama principal.
- **Dinero:** decimales exactos (`Decimal`, nunca `float`). Un asiento contabilizado no se edita ni se borra: se reversa.
- **Leyes e impuestos:** tasas, topes, plazos y porcentajes son **datos con fecha de vigencia**, nunca constantes en el código.
- **Multiempresa:** toda consulta y toda escritura filtran por `companyId`. Todo endpoint lleva `JwtAuthGuard` + `RolesGuard` + `@Roles`.
- **Auditoría:** toda escritura de negocio llama a `writeAudit` dentro de la misma transacción.
- **Migraciones:** una por paquete, con nombre propio. No modifiques migraciones existentes.
- **Datos:** solo ficticios. Nunca leas, copies ni imprimas `.env`, `.env.production`, `.env.test`, `.credenciales-pruebas.txt` ni respaldos.
- **Nunca ejecutes pruebas ni migraciones contra la base de las contadoras** (compose `financiero-pruebas`). Usa tu propia base de pruebas.
- **Pantallas:** cumplen el checklist de la sección 6 de la Guía de producto (migas, estado vacío con botón, errores que dicen cómo arreglarlos, «?», 375 px, teclado).
- **No agregues librerías** sin que la ficha lo diga.

## Comandos
- Backend: `npm run build`, `npm test`, `npm run test:e2e` (necesita una base de pruebas propia y un `.env.test` local con un `JWT_SECRET` aleatorio de 32 o más caracteres; no se sube a git).
- Frontend (requiere Node 22 o superior): `npx ng build`, `npx ng test --watch=false`, `node scripts/verificar-ayuda.mjs`.
- El resultado esperado es siempre «todo en verde». Si algo falla y no es tuyo, dilo en el PR; no lo ocultes ni lo borres.

## Cómo entregas
El PR dice: qué hiciste, qué archivos tocaste, qué decisiones tomaste, cómo probarlo y qué queda pendiente.
No digas «listo» si una prueba falla. Quien revisa tu PR corre las pruebas completas y puede devolverlo con cambios.

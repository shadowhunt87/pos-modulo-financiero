# N2d — Enlace de impuestos y pantallas fiscales (Valores fiscales, Impuestos, Datos fiscales)

**Carril:** N · **Nivel:** N2 · **Tamaño:** M (backend) + L (pantallas) · **Ola:** 2 · **Rama:** `wp/N2d-enlace` · **Asignado (provisional):** IA-N
**Espera a:** **N2c** fusionado. Las pantallas fiscales (`tax-rates.ts`, `ncf.ts`, `dgii`, Panel, `company.ts`) las tocan también E4 y N5: este paquete va **antes** de E4-e y N5 (PAQUETES §4), en una sola rama por área.
**Ficha del 2026-10-12** · PLAN-v0.3 v1.2, tareas 2.5 y 2.7 (§5.3, §5.4, §6, §11).

## 2. Objetivo
El usuario (dueño o contadora) puede: ver los valores fiscales vigentes y su estado (**Oficial / Por validar**), enlazar sus impuestos a esos valores con una sugerencia que confirma una persona, completar la **ficha fiscal** de su empresa y ver en la factura qué tasa se usó. Toca R9, P4, P7, P11.

## 3. Lee antes
- Base: `CLAUDE.md`; `AGENTS.md` (si existe); `docs/PAQUETES-DE-TRABAJO.md` §1 y §4; `docs/GUIA-PRODUCTO.md` §6; `docs/GUIA-CONTABLE-FISCAL.md` R9 y §8.
- **`docs/PLAN-v0.3.md` §5.3 (enlace), §5.4 (sugerencias, `effective?date`), §6 (ficha), §10 (permisos), §11 (pantallas), §13 (ficha solo ADMIN).**
- Código: lo de `src/fiscal/` (N2a/N2c); `src/masters/tax-rates/*`; frontend: `features/catalog/tax-rates.ts`, `features/admin/company.ts`, `features/sales/invoice-form.ts` (vista previa: ~135–153 y ~254 usan `taxRate.rate`) y `invoice-form.html`, `invoice-detail.html`, `features/dashboard/dashboard.html` (bloque `.alerts`), `features/catalog/partners.ts` (pantalla de referencia), `shared/ui/field-help.ts`, `error-notice.ts`.

## 4. Alcance (verificado)
**Backend (`src/fiscal/`)**: `GET /fiscal/tax-links/suggestions` (por tipo, tasa y lado; lo ambiguo no se enlaza solo), enlazar/desenlazar (ADMIN y ACCOUNTANT; valida base compatible), `GET /fiscal/tax-rates/effective?date=` (devuelve `{ taxRateId: { rate, base } }`), `GET /fiscal/profile` (todos) y `PUT` (solo ADMIN, con `writeAudit`), y los **avisos de ficha incompleta e impuestos sin enlazar** (primera versión de `GET /fiscal/alerts`; N5 la amplía). `test/fiscal-parameters.e2e-spec.ts` (completar: ficha solo ADMIN, empresa B intacta, sugerencias).
**Frontend**
- Crear: `features/fiscal/fiscal.routes.ts`, `parameters.ts` (Valores fiscales: historial, revisiones, estado, exportar para la contadora), `tax-link-dialog.ts`, `fiscal-profile.ts` (ruta `/company/fiscal`), `features/dashboard/fiscal-alerts.ts`.
- Modificar: `features/catalog/tax-rates.ts` (enlace y base), `features/sales/invoice-form.ts/.html` (vista previa con `effective?date`, no con `taxRate.rate`), `features/sales/invoice-detail.html` (mostrar `appliedRate`), `features/admin/company.ts` (1 enlace a «Datos fiscales»), `features/dashboard/dashboard.html` (1 línea para el aviso permanente).
- **Calientes (mínimo y avisado):** `app.routes.ts` (área `fiscal`), `layout/nav.ts` (Configuración: «Valores fiscales», «Datos fiscales»), `shared/labels.ts` (al final), `public/manual/ayuda.json` (entradas de pantallas/campos/errores al final de cada bloque), manual en `public/manual/` (D2 coordina la numeración).

## 5. No hagas
- No agregues endpoints para **cambiar valores fiscales** (solo el cargador los cambia). No enlaces nada automáticamente sin confirmación humana.
- No cambies `build()` (es N2c). No introduzcas Tailwind ni librerías de UI.
- No muestres «Oficial» si no existe validación con nombre.

## 6. Pasos sugeridos
1. Backend primero con e2e (roles y aislamiento de la ficha).
2. Valores fiscales: tabla con clave, valor, desde, base, fuente, estado con **icono + color + texto**; botón de exportar para la contadora (reusa `TableDoc` + `renderXlsx` o CSV).
3. Impuestos: mostrar si está enlazado y a qué valor; diálogo con la sugerencia y la base; aviso «no se actualiza solo» si no está enlazado.
4. Ficha fiscal: formulario con ayuda de campo pensada para el dueño en cada pregunta (clasificación DGII, régimen, tipo de sociedad, marco NIIF, fecha de adopción, agente de retención).
5. Vista previa de la factura con `effective?date` (recalcula al cambiar la fecha).
6. Aviso permanente en el Panel mientras haya ficha incompleta o impuestos sin enlazar.
7. `ayuda.json`, manual, 375 px y teclado, `verificar-ayuda`.

## 7. Criterios de aceptación
- La ficha: ADMIN guarda; ACCOUNTANT/APPROVER/VIEWER leen y reciben 403 al guardar; la empresa B nunca ve la de A.
- Enlazar un impuesto con base incompatible → 422 en español; enlazar uno correcto → su factura nueva usa el valor vigente.
- `effective?date=2026-06-15` y `=2026-07-15` devuelven tasas distintas para un parámetro de prueba.
- Ficha en blanco → el Panel muestra «Completa los datos fiscales de tu empresa para saber qué te toca → [Completar]».
- Pantalla «Valores fiscales» muestra «Por validar» para todo valor sin validación con nombre.
- En la factura, la vista previa del ITBIS y la retención coincide con el monto que guarda el servidor al emitir.
- `ng build`, `ng test` y `verificar-ayuda` sin errores; checklist de pantallas (GUIA-PRODUCTO §6) completo.

## 8. Cómo probar
```
# Backend (ver ficha N2c §8 para crear tu base propia en otro puerto)
npm ci && npx prisma migrate deploy && npx prisma generate
npm run build && npm test && npm run test:e2e
# Frontend
cd frontend && npm ci && npx ng build && npx ng test --watch=false && node scripts/verificar-ayuda.mjs
```

## 9. Entregables y PR
Backend + pantallas + manual. PR con: **Qué hice**, **Archivos tocados** (calientes marcados), **Decisiones**, **Cómo probar** (cómo ver cada pantalla), **Qué falta**, marcas `[CAPTURA: …]` pendientes. Seguridad revisa permisos de la ficha.

## 10. Riesgos y trampas
- `tax-rates.ts` y `invoice-form.ts` son del socio y de E4: cambios mínimos y en tu rama de área.
- La vista previa **debe** coincidir con el servidor (si no, el usuario ve un total y se emite otro).
- La ficha tiene cierre derivado de `fiscalYearStartMonth`: si no es 31-mar, 30-jun, 30-sep o 31-dic, solo se avisa (no bloquea).
- Texto para el dueño, sin jerga: «Oficial» y «Por validar» necesitan una explicación al pasar el mouse.
- `Tercero` → «cliente / proveedor» solo en lo que toques (D10).

# E3-front — Semáforo, tendencia, comparar y franja de indicadores (pantallas)

**Carril:** E · **Nivel:** N2 · **Tamaño:** L + L · **Ola:** 2 · **Rama:** `wp/E3-semaforo-front` · **Asignado (provisional):** IA-E
**Espera a:** **E3-back** fusionado (usa sus endpoints reales: lee su controlador). Los nombres de los 6 indicadores del Panel los validan Carlos (perfil dueño) y las contadoras.
**Ficha del 2026-10-12** · PLAN-v0.2 v1.1 tareas 3.5 y 3.6 (§6.3, §14).

## 2. Objetivo
El dueño abre «Semáforo financiero» y entiende en 10 segundos cómo está su empresa: colores con **icono + color + texto** y una frase por indicador; puede ver la tendencia, comparar períodos y ajustar límites (contadora). El Panel suma 6 indicadores en lenguaje de dueño. Toca P3, P6, P7.

## 3. Lee antes
- Base: `CLAUDE.md`; `AGENTS.md` (si existe); `docs/PAQUETES-DE-TRABAJO.md` §1 y §4; `docs/GUIA-PRODUCTO.md` P3, P6, P7 y §6; `docs/GUIA-CONTABLE-FISCAL.md` R7.
- **`docs/PLAN-v0.2.md` §6.2–§6.4, §9.2, §14 (tabla de pantallas), §16.7.**
- Código a imitar: `frontend/src/app/features/reporting/reports.ts` y `reports.html` (razones financieras y filtros de fecha), `features/dashboard/dashboard.ts/.html` (cifras y gráfica), `shared/ui/chart.ts` (`<app-chart [config]>`), `shared/ui/export-buttons.ts` (`<app-export-buttons [path] [query] name />`), `features/feedback/feedback-badge.ts` y `shared/labels.ts` (`FEEDBACK_STATUS_LOOK`: icono + tono), `shared/format.ts` (`decimal.js`, pipes `money`, `fdate`), `features/reporting/reporting.routes.ts`.

## 4. Alcance (verificado)
- **Crear:** `features/reporting/analysis.ts` y `analysis.html` (`/analysis` con pestañas Semáforo, Tendencia, Comparar y Configuración de límites), `analysis-light.ts` (el semáforo reutilizable), `analysis-types.ts`, `features/dashboard/kpi-strip.ts`.
- **Modificar (calientes: mínimo y avisado):** `features/reporting/reporting.routes.ts` (ruta `analysis`), `layout/nav.ts` (Reportes › «Semáforo financiero»), `shared/labels.ts` (al final), `features/dashboard/dashboard.html` (1 línea para la franja) y `dashboard.ts` (import), `public/manual/ayuda.json` (ruta `/analysis`, campos, errores), manual `public/manual/11-…md` (la sección 11 del plan; D2 coordina el nombre).
- Sin librerías nuevas (usa `chart.js` vía `ChartView`).

## 5. No hagas
- No toques el backend (si falta algo, avisa). No uses `Number()` para dinero. No dependas **solo** del color: siempre icono y texto («Bien», «Atención», «Riesgo», «Sin dato»).
- No muestres el límite técnico a quien no es contadora sin explicarlo. No añadas Tailwind ni estilos globales.

## 6. Pasos sugeridos
1. Define tipos con la respuesta real de `health`, `trend`, `compare`, `kpis`, `thresholds`.
2. Semáforo: tarjetas por grupo (liquidez, endeudamiento, rentabilidad, actividad), frase del servidor, valor, límite, aviso de «anualizado» y de cuentas sin clasificar.
3. Tendencia: selector de indicadores (hasta 4) y granularidad; gráfica con `app-chart`; aviso si hay más de 24 puntos.
4. Comparar: período A vs B (por defecto el mismo del año anterior), diferencia, % y si mejoró.
5. Configuración de límites: solo ADMIN y ACCOUNTANT; «Restaurar» por indicador.
6. `kpi-strip` en el Panel con 6 indicadores: «¿Puedo pagar lo que debo pronto?», «Sin contar inventario», «Cuánto de la empresa es deuda», «De cada peso vendido, cuánto me queda», «En cuántos días me pagan», «Ganancia de la operación».
7. Estados vacíos que enseñan, errores con `app-error-notice`, «?», 375 px, teclado; `ayuda.json`.

## 7. Criterios de aceptación
- Con los datos del T1 2030 del backend: razón corriente 2,4167 se ve **verde con icono y texto «Bien»**; endeudamiento 49,5868 % verde; ROA muestra 40,3722 % rotulado «anualizado».
- Un indicador sin dato sale gris con el motivo escrito por el servidor.
- VIEWER/APPROVER ven todo pero **no** ven «Configuración» ni los botones de guardar límites.
- Exportar a PDF y Excel funciona desde Semáforo y Comparar.
- Prueba de usuario nuevo con **perfil dueño**: entiende la salud de la empresa sin ayuda (QA la organiza).
- `ng build`, `ng test` y `verificar-ayuda` sin errores; checklist de GUIA-PRODUCTO §6.

## 8. Cómo probar
```
cd frontend && npm ci
npx ng build
npx ng test            # o: npx ng test --watch=false
node scripts/verificar-ayuda.mjs
```
Con backend real: ficha E3-back §8 (base propia) y `npm start` en `frontend/`.

## 9. Entregables y PR
Pantallas + manual + pruebas de unidad de la lógica. PR con: **Qué hice**, **Archivos tocados** (calientes marcados), **Decisiones**, **Cómo probar**, **Qué falta**, marcas `[CAPTURA: …]`.

## 10. Riesgos y trampas
- La app corre con `OnPush` y `signals`; no uses zonas ni `NgModule`; RxJS solo `firstValueFrom`.
- `app-export-buttons` descarga con `api.download`; los PDF usan solo alfabeto latino.
- El Panel ya es largo: la franja debe cargar sin retrasar las cifras actuales (carga independiente, con su propio error).
- Los nombres para dueños son de Carlos y las contadoras: no los cambies sin que ellos digan.
- No inventes umbrales en el frontend: vienen del servidor.

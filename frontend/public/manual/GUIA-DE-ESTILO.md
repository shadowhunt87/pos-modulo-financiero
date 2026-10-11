# Guía de estilo del manual (no se publica)

*Actualizado: 2026-10-10 · Corresponde a: v0.2, Fase 1*

## Cómo escribir
- Español claro, frases cortas, segunda persona ("pulsa", "elige").
- Un paso = una acción. Cada paso numerado dice el resultado esperado cuando sirve ("verás el aviso verde…").
- Los nombres de botones y campos van en **negrita**, exactamente como se ven en pantalla.
- Un término contable (NCF, ITBIS, retención, anticipo) se explica la primera vez que aparece en la sección.
- Sin HTML incrustado ni imágenes de internet. Capturas: `img/<pantalla>-AAAA-MM.png`, solo del ambiente de pruebas con datos ficticios. Mientras no existan, se deja el marcador `[CAPTURA: descripción]`.

## Estructura de cada sección (archivo `NN-nombre.md`)
1. Título (H1) y línea de fecha y versión.
2. **Si eres el dueño** (equivale a "En pocas palabras" del plan 8.2).
3. Los pasos, en H2 por tarea (equivale a "Paso a paso").
4. **Si eres la contadora** (equivale a "Detalle contable").
5. **Si algo sale mal**.
6. **En mejora**: lo conocido o planeado, para que no se reporte como error.

## Anclas y enlaces (convención que usan `ayuda.json` y `verificar-ayuda`)
- El ancla de un encabezado es su texto en minúsculas, **sin tildes ni signos**, con guiones: "Corregir un error: nota de crédito" pasa a `corregir-un-error-nota-de-credito`; "Qué es el NCF" pasa a `que-es-el-ncf`. La ñ pasa a n.
- No cambiar el texto de un encabezado sin revisar `ayuda.json` (campos `ancla`) y los enlaces.
- Enlace a otra sección: `/help/<slug>#<ancla>`. Enlace a una pantalla: `/ruta` (ej. `/ncf`). Enlace dentro de la misma sección: `#<ancla>`.
- Slugs: primeros-pasos, clientes-y-proveedores, facturas, cobros-y-pagos, preguntas-frecuentes (las demás se agregan con su fase).

## Cada vez que cambie una pantalla
Revisar su sección, `ayuda.json` (pantallas, campos, errores) y `CAMBIOS.md`. Documentación desactualizada es peor que ninguna.

# Fichas de paquetes de trabajo

*Fecha: 2026-10-12 · Corresponde a: PAQUETES-DE-TRABAJO v1.0, PLAN-v0.2 v1.1, PLAN-v0.3 v1.2 y `docs/tablero-paquetes.csv`.*

Cada ficha es el encargo **completo** de un paquete para una IA (Gemini, DeepSeek, Grok, Kimi, un modelo local u otra) o una persona que no ha visto ninguna conversación ni conoce el proyecto. Con la ficha y el repositorio debe poder trabajar sola.

## Cómo usar una ficha
1. Confirma que el paquete no está **bloqueado**: mira la línea «Espera a» al inicio de su ficha y la columna «Espera humana» del tablero. Respeta el límite de **5 paquetes abiertos a la vez** y la regla de una migración por paquete (PAQUETES §3 y §4).
2. Pega a la IA, como primer mensaje: la ficha completa, `docs/PAQUETES-DE-TRABAJO.md` §1 (reglas) y, si existe, el archivo `AGENTS.md` de la raíz (hoy **no existe** en el repositorio).
3. La IA trabaja con **su copia** del repositorio privado, su propia cuenta y su propia base de pruebas (la ficha trae los comandos). Rama `wp/<ID>-…` y un PR. **Nunca** push a la rama principal, nunca `.env`, claves ni datos reales.
4. Tú avisas el PR; Claude corre las puertas de calidad (QA y, si toca dinero, permisos, archivos o aislamiento, seguridad). Se devuelve una lista de cambios hasta que quede aprobado.
5. Si algo de la ficha no coincide con el código, la IA debe **parar y preguntar**. Si la ficha envejece (cambia un plan o se fusiona otro paquete), se actualiza o se reemplaza: documentación vieja es peor que ninguna.

Las fichas **N3** y **N7** (facturación electrónica) no existen: las hace Claude.

## Índice

| ID | Título | Nivel | Ola | Ficha |
|---|---|---|---|---|
| S0 | Anexo de diseño de 2FA y exportación completa | N1 | 0 | [S0](S0.md) |
| S1 | 2FA en el backend | N1 | 1 | [S1](S1.md) |
| S2 | Exportación completa por empresa | N1 | 2 | [S2](S2.md) |
| S3 | Copia de respaldo externa cifrada | N2 | 2 | [S3](S3.md) |
| S4 | Pantallas de 2FA y exportación | N2 | 3 | [S4](S4.md) |
| S5 | Seguridad pendiente Fase 1 (cabeceras SEG-7) | N2 | 1 | [S5](S5.md) |
| N1 | Corregir sin borrar (reverso) y nota de crédito | N1 | 1 | [N1](N1.md) |
| N2a | Parámetros fiscales con vigencia y ficha | N1 | 1 | [N2a](N2a.md) |
| N2b | Cargador del catálogo fiscal | N1 | 1 | [N2b](N2b.md) |
| N2c | `build()` con tasa y base del parámetro y trazabilidad | N1 | 2 | [N2c](N2c.md) |
| N2d | Enlace de impuestos y pantallas fiscales | N2 | 2 | [N2d](N2d.md) |
| N3 | e-CF mínimo e importación de XML | N1 | 3 | *(la hace Claude, sin ficha)* |
| N4 | Ajustes 606/607/608 y cuadres | N1 | 3 | [N4](N4.md) |
| N5 | Calendario fiscal y bloqueo de comprobantes B | N1 | 3 | [N5](N5.md) |
| N6 | 609, IT-1 e IR-17 asistidos | N1 | 4 | [N6](N6.md) |
| N7 | e-CF con el proveedor | N1 | 5 | *(la hace Claude, bloqueado, sin ficha)* |
| E1a | Guía de arranque y flujos (backend) | N2 | 1 | [E1a](E1a.md) |
| E1b | Plantilla de plan de cuentas e impuestos base | N1 | 2 | [E1b](E1b.md) |
| E1c | Datos de ejemplo borrables | N1 | 2 | [E1c](E1c.md) |
| E2 | Asistente de arranque y cierre guiado (pantallas) | N2 | 3 | [E2](E2.md) |
| E3-back | Semáforo financiero (backend) | N2 | 0 | [E3-back](E3-back.md) |
| E3-front | Semáforo y tendencia (pantallas) | N2 | 2 | [E3-front](E3-front.md) |
| E4-a | Pantallas guiadas Ventas (y piezas compartidas) | N3+N2 | 0 | [E4-a](E4-a.md) |
| E4-b | Pantallas guiadas Contabilidad | N3+N2 | 0 | [E4-b](E4-b.md) |
| E4-c | Pantallas guiadas Bancos | N3+N2 | 0 | [E4-c](E4-c.md) |
| E4-d | Pantallas guiadas Reportes y Configuración | N3+N2 | 0 | [E4-d](E4-d.md) |
| E4-e | Pantallas guiadas fiscales | N2 | 4 | [E4-e](E4-e.md) |
| A1 | Rol Auditor, modelos y encargos | N1 | 0 | [A1](A1.md) |
| A2 | Hallazgos y pruebas de restricciones | N1 | 1 | [A2](A2.md) |
| A3 | Pantallas de auditoría I | N2 | 2 | [A3](A3.md) |
| A4 | Marcas, archivos e informe | N2 | 2 | [A4](A4.md) |
| A5 | Pantallas de auditoría II | N2 | 3 | [A5](A5.md) |
| V0 | Contrato de integración para verticales | N1 | 0 | [V0](V0.md) |
| V1 | Puntos de enganche mínimos para verticales | N1 | 1 | [V1](V1.md) |
| V2 | Plantilla de módulo vertical | N2 | 1 | [V2](V2.md) |
| V3 | Pruebas de contrato de verticales | N1 | 2 | [V3](V3.md) |
| D1 | Manual y ayuda de pantallas existentes | N3+N2 | 0 | [D1](D1.md) |
| D2 | Manual y ayuda de cada paquete al cerrarse | N3+N2 | 4 | [D2](D2.md) |
| D3 | Valores fiscales con fuente para el cargador | N2 | 0 | [D3](D3.md) |
| D4 | Notas de versión dentro del sistema | N3 | 5 | [D4](D4.md) |

## Cosas que el coordinador debe saber (encontradas al escribir las fichas)
- **Piezas compartidas de E4:** `app-empty-state` y el icono del `StatusBadge` aún no existen. La ficha E4-a las crea en un PR corto («paso 0») y E4-b, E4-c y E4-d lo esperan, aunque el tablero no lo marca como dependencia.
- **`app-stepper`** (que usa A3 para el estado del encargo) lo crea E2, que va en una ola posterior: la ficha A3 dice cómo suplirlo sin duplicarlo.
- **La pantalla de «Revisión del mes»** (PLAN-v0.3 §11 y 4.5) no tiene dueño en el tablero: N4 hace solo el backend. Decide quién la hace (E4-e o una extensión de N4).
- **`ayuda.json`** lo tocan casi todos los paquetes: cada uno agrega al final de su bloque y hace `rebase`; D1/D2 consolidan. Claves de campos por área: `ventas.`, `contabilidad.`, `bancos.`, `config.`, `reportes.`, `fiscal.`.
- **Numeración del manual:** `02` ya es «Configuración» (el plan decía «Arranque»). Las secciones nuevas se proponen desde la 11; D2 y Carlos la fijan.
- **E1b** reutiliza el catálogo estándar RD que ya existe (`src/chart-of-accounts/`); no crea otro. Si usa un `.json` nuevo debe agregarlo a `nest-cli.json` (`assets`).
- **S0 y V0** producen documentos (`docs/ANEXO-S0-2FA-EXPORTACION.md` y `docs/CONTRATO-VERTICALES.md`); los nombres son propuestos.
- **No hay `AGENTS.md`, `CAMBIOS.md` ni el informe de seguridad de la Fase 1** en el repositorio; S5 lo advierte.
- Los comandos de prueba de las fichas están **escritos pero no ejecutados** al crearlas: la primera IA que los use debe avisar si alguno falla.

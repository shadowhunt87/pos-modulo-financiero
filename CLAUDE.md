# Módulo Financiero — instrucciones para Claude y sus agentes

- **Guía de producto obligatoria:** `docs/GUIA-PRODUCTO.md`. Todo plan, diseño, desarrollo, prueba y
  documentación se valida contra sus 14 principios y contra el checklist de aceptación por pantalla (sección 6).
  Si algo la contradice, se explica por qué y lo decide Carlos.
- **Principio rector de diseño:** que cualquier persona lo pueda usar sin capacitación (P7).
- **Línea del socio:** el código es copropiedad con el socio, que sigue desarrollando en su repo. Hay que imitar
  sus convenciones y minimizar los cambios en archivos existentes (ver docs/PLAN-v0.2.md).
- **Flujo de agentes:**
  1. arquitecto
  2. revisor-critico
  3. Carlos aprueba
  4. dev-backend / dev-frontend
  5. qa
  6. seguridad
  7. documentador
  8. revisor-critico final
- **Modelo por tipo de trabajo** (Carlos, 2026-10-10: Opus solo donde hace falta capacidad, el resto en modelos que gasten menos):
  - **Opus:** arquitecto, revisor-critico, seguridad, y dev-backend cuando la tarea es lógica contable o fiscal, permisos o roles, migraciones o aislamiento entre empresas.
  - **Sonnet:** dev-frontend, qa, devops, documentador, y dev-backend en tareas acotadas (endpoints simples, DTOs, ajustes).
  - **Haiku:** búsquedas en el código, cambios mecánicos (renombrar textos, barridos), verificaciones simples y lectura de páginas web.
  - Si un agente de menor modelo se traba o el resultado no convence, se repite la tarea en el modelo superior.
- **Ambiente de pruebas:** https://finanzas.biodesch.com, solo con datos ficticios.
  Compose: `docker compose -p financiero-pruebas -f docker-compose.prod.yml -f docker-compose.pruebas.yml --env-file .env.production`.
- Carlos no es programador: todo lo que deba ejecutar él va paso a paso y en lenguaje sencillo.

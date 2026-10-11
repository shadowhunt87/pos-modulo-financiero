# Financial · Frontend

Interfaz web del sistema contable multiempresa (`financial-backend`). Angular 22, solo cliente (sin SSR), sin librerías de UI externas: el kit de componentes está en `src/app/shared/ui`.

## Requisitos
- Node **≥ 22.22.3** o 24 (el CLI de Angular 22 no arranca con versiones anteriores).
- El backend corriendo (por defecto `http://localhost:3000`).

## Desarrollo
```bash
npm install            # .npmrc ya trae legacy-peer-deps=true
npm start              # http://localhost:4200
```
`npm start` usa `proxy.conf.json`: todo lo que empieza con `/api` se reenvía al backend quitando el prefijo, así que **no necesitas CORS**. Si tu backend no está en el 3000, cambia `target` en `proxy.conf.json`.

Usuario: el administrador que creó el seed del backend (`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`).

## Producción
```bash
npm run build          # dist/financial-module/browser
```
Sirve esa carpeta con cualquier servidor estático. La URL de la API se lee en runtime de `config.json` (por defecto `/api`), así que puedes cambiarla **sin recompilar**:
```json
{ "apiUrl": "https://api.tudominio.com" }
```
(si la API está en otro dominio, activa CORS en el backend con `CORS_ORIGINS`).

### Docker
`Dockerfile` + `deploy/nginx.conf`: nginx sirve la SPA y reenvía `/api/` al servicio `api:3000`. Ejemplo para añadir a tu `docker-compose.prod.yml`:
```yaml
  web:
    build: ../financial-frontend
    depends_on: [api]
    ports: ["80:80"]
```
Detrás de HTTPS (Caddy, Traefik o el nginx del servidor) apunta al puerto 80 de este contenedor.

## Mapa de pantallas
| Área | Rutas |
|---|---|
| Panel | `/` |
| Ventas y compras | `/invoices`, `/invoices/new`, `/invoices/:id`, `/payments`, `/payments/new`, `/payments/:id`, `/receivables` |
| Contabilidad | `/entries`, `/entries/new`, `/entries/:id`, `/accounts`, `/fiscal-periods`, `/fiscal-years`, `/opening-balances` |
| Tesorería | `/bank-accounts`, `/bank-accounts/:id`, `/reconciliations`, `/reconciliations/:id` |
| Reportes | `/reports` (9 reportes + Excel/PDF), `/dgii` (606/607/608 + TXT), `/budgets`, `/budgets/:id` |
| Catálogos | `/partners`, `/tax-rates`, `/ncf`, `/journals`, `/document-sequences`, `/account-classification`, `/accounting-settings` |
| Administración | `/users` (ADMIN), `/company`, `/profile` |

## Cómo está hecho
- Componentes standalone, `OnPush`, **zoneless**: todo el estado vive en *signals*.
- Formularios reactivos tipados; TypeScript `strict` + `strictTemplates`.
- Dinero siempre con `decimal.js` (nunca `Number` para sumar). Las fechas "solo día" se tratan como texto `YYYY-MM-DD` para que la zona horaria no mueva el día.
- Permisos: el menú y los botones se ocultan según rol (ADMIN, ACCOUNTANT, APPROVER, VIEWER), pero **la autoridad es el backend**.
- Sesión: JWT en `localStorage`; un 401 cierra sesión.
- Tema claro/oscuro (se recuerda). Funciona en móvil.

## Dónde tocar
- Menú: `src/app/layout/nav.ts` · Rutas: `src/app/features/<área>/<área>.routes.ts`
- Colores y estilos globales: `src/styles.css` (variables CSS al inicio)
- Etiquetas en español de los estados: `src/app/shared/labels.ts`
# finanzas_run_frontend

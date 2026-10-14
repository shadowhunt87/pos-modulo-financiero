# Guía: avanzar con la IA local (Ollama + VS Code) y con la API de Claude

> Para Carlos. Versión 1.0, 2026-10-13. Equipo base: portátil con 16 GB de RAM y tarjeta de 8 GB (RTX 2070 Max-Q).
> La configuración de Cline con Ollama que ya tienes (de la plataforma) sirve; aquí solo se ajusta para este proyecto.

## 1. Qué puede hacer la IA local (y qué no)

| Sí (trabajo pequeño, con un ejemplo que copiar) | No (lo hace Claude, con revisión) |
|---|---|
| **D1, D2, D4:** manual de usuario, `ayuda.json`, notas de versión | Lógica de dinero, impuestos y asientos |
| **E4-b, E4-c, E4-d:** estados vacíos, ayudas de campo y errores claros en Contabilidad, Bancos, Reportes y Configuración (una pantalla por encargo) | Permisos, roles, contraseñas, migraciones |
| Pruebas unitarias de funciones sencillas que ya existen | Verificación en dos pasos, exportación, copia de respaldo |
| Traducir o aclarar textos de pantalla | Facturación electrónica y todo lo fiscal |

Un modelo de 9 mil millones de parámetros se equivoca con facilidad en código grande. Por eso: **una tarea chica por vez, un archivo por vez**, y todo lo que haga lo revisa Claude.

## 2. Preparar el código en tu PC (sin tocar git)
1. Entra a `https://github.com/carlosjfriast-sketch/modulo-financiero`.
2. Arriba a la izquierda, donde dice `main`, abre el desplegable y elige la rama **`fase-1`**.
3. Pulsa el botón verde **Code** y luego **Download ZIP**.
4. Descomprime en una carpeta, por ejemplo `C:\proyectos\modulo-financiero`.
5. **No copies** a esa carpeta ningún archivo `.env`, de credenciales ni de respaldos.
6. En esa carpeta ya vienen dos archivos de esta guía: `.clinerules` (reglas para la IA) y `.clineignore` (lo que la IA no puede leer).

## 3. Configurar Ollama y Cline
**Ya lo tienes** (de la plataforma). Comprueba estos valores en Cline (engranaje de Cline en VS Code):

| Ajuste | Valor |
|---|---|
| API Provider | Ollama |
| Base URL | `http://localhost:11434` |
| Model | `qwen3.5:9b` (el que obedece a Cline; el `qwen2.5-coder:7b` falla) |
| Context window | `16384` si va lento; `32768` si tu tarjeta aguanta |
| Use compact prompt | Activado |
| Request timeout | `120000` |
| Auto-approve | Solo «Read project files». Lo demás, tú lo apruebas |
| Telemetría | Desactivada |

**Si va lento** (por la tarjeta de 8 GB): en la ventana de Windows donde corre Ollama, o en Variables de entorno de usuario, agrega:
- `OLLAMA_FLASH_ATTENTION` = `1`
- `OLLAMA_KV_CACHE_TYPE` = `q8_0`
- `OLLAMA_KEEP_ALIVE` = `30m`

Reinicia Ollama después. Estas opciones reducen la memoria del contexto. Si alguna no existe en tu versión, la ignora.

**En VS Code:**
1. Abre la carpeta del proyecto (`Archivo → Abrir carpeta`).
2. Cline lee solo `.clinerules` y `.clineignore` de la raíz.
3. No abras en pestañas archivos `.env` ni de credenciales.

## 4. Cómo darle una tarea a la IA local
Un encargo por vez, con este formato (cámbialo por el paquete que toque):

```text
Lee .clinerules y docs/paquetes/D1.md.
Haz SOLO el primer paso de la ficha, en un único archivo: [nombre del archivo].
Copia el estilo de [archivo de ejemplo que dice la ficha].
Cuando termines dime qué archivo cambiaste y qué debo revisar.
```

**Orden sugerido:** D1 (manual de asientos y cierre) → E4-a la hace Claude → luego E4-b, E4-c y E4-d, una pantalla por encargo.

**Cuando termine una tarea:**
1. Mira el cambio tú mismo (Cline muestra el antes y después).
2. Corre las pruebas (sección 6).
3. Pásame la carpeta o el archivo cambiado para revisarlo. No lo fusionamos sin revisión.

## 5. Usar la API de Claude en otra herramienta, cuidando la privacidad

**Dónde se puede usar:** en Cline (elige el proveedor «Anthropic»), en la extensión de Claude para VS Code, o en Claude Code. Todas piden una **clave de API**.

**Lo que debes saber de la privacidad:**
- Con la API, el código que la herramienta lee **viaja a Anthropic**, igual que ahora en esta conversación. **No agrega una empresa nueva.**
- Según los términos comerciales de Anthropic, lo que se envía por la API **no se usa para entrenar modelos** por defecto. Confírmalo en tu cuenta (centro de privacidad de Anthropic) antes de empezar. Yo no puedo ver tu configuración.
- Anthropic puede conservar los datos un tiempo por seguridad. Las cuentas de empresa pueden pedir «retención cero»; si lo necesitas, pregúntalo en el soporte.
- La decisión que tomaste para `plataforma` (todo local) es distinta y sigue valiendo. Esto aplica solo al módulo financiero.

**Pasos:**
1. Entra a `console.anthropic.com` con tu cuenta.
2. **Límites:** en la sección de límites o facturación pon un **tope de gasto mensual**. Hazlo antes de crear la clave.
3. **Clave:** crea una clave de API solo para esta herramienta, con un nombre claro (por ejemplo `cline-pc`).
4. Pégala **solo** en los ajustes de la herramienta (Cline la guarda en el almacén seguro de VS Code). **Nunca** en un archivo del proyecto ni en un chat.
5. Si sospechas que se filtró, borra la clave en la consola y crea otra.

**Cómo no mandar lo que no debe salir:**
- Mantén el archivo `.clineignore` de este proyecto (excluye `.env`, credenciales, respaldos, claves).
- Trabaja solo con la copia del código (sección 2), nunca con datos reales.
- No abras archivos secretos en el editor mientras la herramienta está activa.
- Apaga la telemetría en los ajustes de la herramienta.

**Cuidar el gasto:**
- Modelo económico (Haiku) para tareas mecánicas.
- Modelo intermedio (Sonnet) para pantallas y pruebas.
- El más capaz (Opus) solo para dinero, permisos y seguridad.
- Tareas pequeñas y un archivo por vez gastan mucho menos.
- Revisa el gasto en la consola cada semana al principio.

## 6. Cómo comprobar lo que hizo la IA
Con Node 22 o superior instalado en tu PC, en la carpeta `frontend`:
```text
npm ci
npx ng build
npx ng test --watch=false
node scripts/verificar-ayuda.mjs
```
Todo debe terminar sin errores. Si hay errores, no los borres: pásamelos.

## 7. Reglas simples
1. Una tarea chica por vez.
2. Nunca dinero, impuestos, permisos ni seguridad con la IA local.
3. Nada de datos reales ni claves en la carpeta.
4. Todo pasa por revisión antes de usarse.

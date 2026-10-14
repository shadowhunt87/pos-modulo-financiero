# Seguridad de la cuenta y exportación de datos

*Actualizado: 2026-10-14 · Corresponde a: v0.3, Fase 3*

## En pocas palabras

**Verificación en dos pasos:** además de tu clave, al entrar escribes un número de 6 dígitos que muestra una aplicación de tu teléfono. Si alguien consigue tu clave, sin tu teléfono no puede entrar.

**Exportar todos mis datos:** el administrador descarga en un archivo .zip toda la información de la empresa.

## Activar la verificación en dos pasos

Menú **Configuración › Seguridad de mi cuenta**.

1. Instala en tu teléfono **Google Authenticator** o **Microsoft Authenticator** (gratis).
2. Pulsa **Activar la verificación en dos pasos** y escribe tu contraseña.
3. En la aplicación pulsa «+» y escanea el código QR. Si no puedes, escribe la clave que aparece debajo.
4. Escribe el número de 6 dígitos que muestra la aplicación y pulsa **Activar**.
5. **Guarda los 10 códigos de emergencia** (Copiar o Descargar .txt). Cada uno sirve una vez para entrar si pierdes el teléfono. No se vuelven a mostrar.

[CAPTURA: activar la verificación con el código QR]

Desde entonces, al entrar te pedimos el código de la aplicación después de la clave.

## Entrar con la verificación

1. Escribe tu correo y tu clave.
2. Escribe el número que muestra la aplicación **en ese momento** (cambia cada 30 segundos).
3. Si no tienes el teléfono, pulsa **Usar un código de emergencia**.

**Perdí mi teléfono:** entra con un código de emergencia y, desde **Seguridad de mi cuenta**, pulsa **Cambiar de teléfono**. Si no tienes los códigos, pide a otro administrador de tu empresa que **restablezca tu verificación** en Usuarios. Si eres el único administrador, escribe a soporte.

Consejo: que cada empresa tenga **dos administradores** con la verificación activada.

## Cambiar de teléfono, códigos nuevos o desactivar

En **Seguridad de mi cuenta**:

- **Cambiar de teléfono**: pide tu clave y el código actual (o uno de emergencia), y luego el QR del teléfono nuevo.
- **Generar códigos nuevos**: los anteriores dejan de servir.
- **Desactivar**: solo si tu rol no la exige.

## Restablecer la verificación de otra persona (administradores)

En **Usuarios**, junto a la persona, pulsa **Restablecer verificación**. Escribe una **clave nueva para el usuario** y confirma con tu contraseña (y tu código). Dale la clave por teléfono, nunca por correo, y pídele que la cambie al entrar. Tendrá 72 horas para volver a inscribir su teléfono.

## Acciones que piden confirmación

Crear un usuario, ascender a alguien a administrador, cambiar el correo de un administrador, restablecer una clave o una verificación, y exportar todos los datos piden **tu contraseña y, si la tienes, el código de tu aplicación**. Así, aunque alguien use tu sesión abierta, no puede hacer estos cambios. Si te equivocas al escribirla, la sesión no se cierra: vuelve a intentarlo.

En **Usuarios › Cambios de seguridad** ves los últimos 30 días: activaciones, bloqueos, restablecimientos y exportaciones.

## Exportar todos mis datos

Menú **Configuración › Exportar todos mis datos** (solo administradores).

1. Revisa qué incluye y el tamaño aproximado.
2. Si te vas del servicio, marca **Me voy del servicio**.
3. Confirma con tu contraseña (y tu código) y pulsa **Descargar todos mis datos**. Puede tardar unos minutos.

El archivo trae una hoja (CSV) por tabla, los adjuntos, las facturas electrónicas (XML), un índice con huellas digitales y un **LEEME** que explica cómo abrir las hojas en Excel sin perder ceros. No trae claves ni credenciales. Puedes exportar hasta 3 veces por hora.

[CAPTURA: pantalla Exportar todos mis datos]

## Si algo sale mal

| Qué ves | Qué hacer |
|---|---|
| "El código no es correcto o ya se usó" | Espera a que la aplicación muestre un número nuevo y escríbelo. Revisa que la hora de tu teléfono sea automática. |
| "La verificación venció" | Vuelve a escribir tu correo y tu clave. |
| "Tu empresa exige la verificación en dos pasos…" | Pide a otro administrador que restablezca tu verificación. |
| "Para hacer esto confirma con tu clave…" | Escribe tu contraseña (y el código) en el recuadro **Confirma que eres tú**. |
| "Ya hay una exportación en curso" | Espera unos minutos y vuelve a intentarlo. |

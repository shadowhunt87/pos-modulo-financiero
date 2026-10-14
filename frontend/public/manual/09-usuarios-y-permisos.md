# Usuarios y permisos

*Actualizado: 2026-10-10 · Corresponde a: v0.2, Fase 1 (versión corta)*

Menú **Configuración › Usuarios**. Esta pantalla solo la ve el Administrador.

## En pocas palabras

**Si eres el dueño:** aquí decides quién entra al sistema y qué puede hacer. Dale a cada persona el rol más bajo que le sirva. Cuando alguien se va de tu empresa, desactívalo; no hace falta borrarlo.

**Si eres la contadora:** hay cuatro roles. La empresa siempre debe conservar al menos un Administrador activo, y nadie puede desactivar su propia cuenta.

## Qué puede hacer cada rol

| Rol | Puede |
|---|---|
| **Administrador** | Todo, incluidos usuarios, cierre de año y anulaciones. |
| **Contador** | Crear y editar facturas, cobros, pagos, asientos y catálogos. |
| **Aprobador** | Aprobar y anular. No crea facturas ni cobros. |
| **Solo lectura** | Mirar y consultar reportes. No cambia nada. |

## Crear un usuario

1. Pulsa **Nuevo usuario**.
2. Escribe el **Nombre** y el **Correo**.
3. Elige el **Rol**.
4. Escribe una **Contraseña inicial** de al menos 8 caracteres.
5. Pulsa **Guardar**.
6. Entrégale la clave de forma segura (no por un chat abierto) y pídele que la cambie en **Mi perfil y clave** al entrar.

[CAPTURA: ventana Nuevo usuario]

## Cambiar el rol o desactivar a alguien

1. En la lista, usa **Buscar**, **Rol** y **Estado** para encontrarlo.
2. Pulsa **Editar**.
3. Cambia el **Rol**, o quita la marca de **Usuario activo**.
4. Pulsa **Guardar**.

## Restablecer la clave de alguien

1. Pulsa **Restablecer contraseña** en su fila.
2. Escribe una **Contraseña nueva** (entre 8 y 72 caracteres).
3. Pulsa **Restablecer**. Las sesiones abiertas de esa persona se cierran.
4. Dile la clave nueva de forma segura y que la cambie al entrar.

## Conectar otro sistema

Si otro programa (por ejemplo, el del taller) va a registrar aquí sus facturas y cobros, necesita una **llave**.
Solo el Administrador la crea, en **Configuración → Conexiones con otros sistemas**:

1. Pulsa **Nueva conexión**.
2. Escribe un **Nombre** para reconocerla (ej: Taller Sirtech) y el **Origen de sus facturas** que te indique
   quien instala la conexión (ej: taller.orden).
3. Pulsa **Crear conexión** y **copia la llave**: se muestra una sola vez. Entrégasela a quien instala el otro sistema
   por un medio seguro (no por correo ni chat).

Con esa llave el otro sistema **solo** puede crear clientes, facturas de venta y cobros, y ver lo que él mismo creó.
No entra a las pantallas, no ve reportes ni la DGII y no puede anular nada. Si la llave se pierde o ya no se usa,
pulsa **Revocar**: deja de funcionar en el acto y lo que registró se queda.

## Si algo sale mal

| Qué ves | Qué hacer |
|---|---|
| "Ya existe un usuario con ese email" | Ese correo ya está. Búscalo y edítalo. |
| "La empresa debe conservar al menos un ADMIN activo" | Nombra primero a otro Administrador. |
| "No puedes desactivar tu propia cuenta" | Pídele a otro Administrador que lo haga. |
| Alguien no ve una opción del menú | Revisa su rol aquí. |

## En mejora

Esta sección se amplía en próximas versiones: el rol Auditor (Fases 4 y 5) y permisos más finos por pantalla.

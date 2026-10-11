# Clientes y proveedores

*Actualizado: 2026-10-10 · Corresponde a: v0.2, Fase 1*

Un **cliente** es a quien le vendes. Un **proveedor** es a quien le compras. Algunos son las dos cosas (**Cliente y proveedor**). Todos viven en la misma lista.

Dónde está: menú **Ventas y compras › Clientes y proveedores**.

## Si eres el dueño

Antes de hacer una factura necesitas que el cliente exista. La buena noticia: **no tienes que salir de la factura** para crearlo (más abajo te explico cómo).

Para cada cliente o proveedor basta con el nombre. Pero si le vas a dar comprobante de crédito fiscal, necesitas también su **RNC** (el número de contribuyente de una empresa) o su **cédula**.

Solo el Administrador y el Contador pueden crear o editar. Los demás pueden mirar la lista.

## Ver tus clientes y proveedores

1. Entra a **Clientes y proveedores**.
2. Para buscar, escribe en **Buscar** el nombre, el nombre comercial o el RNC. La lista se filtra sola.
3. Para ver solo clientes o solo proveedores, usa el filtro **Tipo**.
4. Para ver los que ya no usas, cambia **Estado** a **Inactivos**.

[CAPTURA: lista de clientes y proveedores con los filtros Buscar, Tipo y Estado]

Verás nombre, tipo, RNC o cédula, contacto, días de crédito y si está **Activo** o **Inactivo**. Si hay más de 25, cambias de página abajo.

## Crear un cliente o proveedor

1. Pulsa **Nuevo cliente / proveedor** (arriba a la derecha).
2. Elige el **Tipo**: Cliente, Proveedor o Cliente y proveedor.
3. Escribe el **Nombre o razón social**. Es lo único obligatorio.
4. Si lo tienes, elige el **Tipo de documento** y escribe el **RNC o cédula**, solo números.
5. Completa lo que quieras: Nombre comercial, Correo, Teléfono, Dirección y Ciudad.
6. Pulsa **Guardar**. Verás el aviso "Cliente / proveedor creado." y aparecerá en la lista.

[CAPTURA: ventana "Nuevo cliente / proveedor" llena con un ejemplo]

## Crear uno sin salir de la factura o del cobro

Estás haciendo una factura y el cliente no existe. No la abandones.

1. En la factura (o en el cobro o pago), mira debajo del campo **Cliente** (o **Proveedor**).
2. Pulsa **Crear**. Se abre la misma ventana de arriba. El tipo ya viene elegido: Cliente en una venta, Proveedor en una compra.
3. Llénala y pulsa **Guardar**.
4. La ventana se cierra y el nuevo cliente **queda elegido solo** en la factura. Lo que ya habías escrito no se pierde.

[CAPTURA: factura nueva con los botones Crear, Editar, Ir a clientes y proveedores y Actualizar lista bajo el campo Cliente]

Los otros botones de ese lugar:

- **Editar**: cambia los datos del cliente ya elegido (por ejemplo, agregarle el RNC). Está apagado hasta que eliges uno.
- **Ir a clientes y proveedores**: abre la lista completa en otra pestaña, sin cerrar tu factura.
- **Actualizar lista**: úsalo si creaste o cambiaste a alguien en esa otra pestaña y no aparece.

Si editas a alguien y su tipo ya no corresponde (por ejemplo lo cambias a Proveedor dentro de una venta), se quita de la factura y te avisamos para que elijas otro.

Estos botones **Crear** y **Editar** solo los ven el Administrador y el Contador.

## Editar, desactivar o activar

1. En la lista, busca a la persona o empresa.
2. Pulsa **Editar**, cambia lo que necesites y **Guardar**.
3. O pulsa **Desactivar**. El sistema te pregunta si estás seguro.

Al desactivar, deja de aparecer al hacer facturas y cobros, pero **sus documentos anteriores no cambian**. Para volver a usarlo, pulsa **Activar**. No se pueden borrar, para proteger tu historial.

## Qué significa cada campo

| Campo | Qué es |
|---|---|
| **Tipo de documento** y **RNC o cédula** | RNC: 9 números (empresas). Cédula: 11 números (personas). Sin guiones. Un mismo número no se puede repetir en otro cliente o proveedor. |
| **Nombre comercial** | El nombre con el que se conoce, si es distinto de la razón social. |
| **Límite de crédito** | Lo máximo que puede deberte a la vez. Si una factura lo supera, no se puede emitir. Vacío significa sin límite. |
| **Días de crédito** | Cuántos días tiene para pagar. El sistema los usa para calcular el vencimiento de cada factura. |
| **NCF por defecto** | El tipo de comprobante que se propone al facturarle. Por ejemplo `B01` o `B02`. Mira [Qué es el NCF](/help/facturas#que-es-el-ncf). |
| **Es agente de retención** | Marca esto si esa empresa te retiene impuestos al pagarte (o tú a ella). Mira [Retenciones](/help/facturas#retenciones). |

[CAPTURA: parte baja de la ventana con Límite de crédito, Días de crédito, NCF por defecto y Es agente de retención]

## Si eres la contadora

- Validación del documento: si no eliges el tipo, el sistema lo infiere por la longitud (9 = RNC, 11 = cédula). Si no coincide, pide el tipo. Pasaporte e ID extranjero admiten de 3 a 20 letras y números.
- El RNC/cédula es único por empresa. Intentar repetirlo devuelve el nombre de quien ya lo tiene.
- Un cliente sin RNC o cédula no puede recibir B01 ni E31 (crédito fiscal).
- El **NCF por defecto** se usa al emitir una venta cuando la factura no trae tipo. En notas de crédito o débito el tipo es automático (B04/B03, o E34/E33 si la factura original es electrónica).
- **Límite de crédito**: se compara al emitir ventas contra el saldo abierto del cliente (ventas y notas de débito), más la factura nueva.
- **Días de crédito** calculan el vencimiento cuando el campo queda vacío en la factura.
- **Agente de retención** es informativo: recuerda agregar la retención, pero no la aplica solo.
- Desactivar no afecta documentos ya emitidos, solo los selectores.
- Internamente la entidad se llama "tercero"; en pantalla se muestra "cliente / proveedor".

## Si algo sale mal

| Qué ves | Qué hacer |
|---|---|
| No veo el botón **Nuevo cliente / proveedor** ni **Crear** | Tu rol es de solo lectura o aprobador. Pídele a un administrador o contador que lo cree. |
| "Ya existe un tercero con ese RNC/cédula" | Ya está registrado. Búscalo por nombre o por número y úsalo. |
| "El RNC debe tener 9 dígitos" | Escribe solo números, sin guiones ni espacios. |
| El cliente que creé no sale en la factura | Pulsa **Actualizar lista**. Revisa también que sea del tipo correcto: en una venta solo salen clientes. |
| No puedo emitir porque "el cliente no tiene RNC" | Pulsa **Editar** junto al cliente y agrégalo, o usa B02 (consumo). |

Más respuestas en [Preguntas frecuentes](/help/preguntas-frecuentes).

## En mejora

Esto está planeado y todavía no está listo. No lo reportes como error:

- Algunas pantallas (listas de facturas, cobros y estado de cuenta) todavía muestran la palabra "tercero".
- Ayuda con un **?** junto a cada campo de esta ventana (NCF por defecto, agente de retención, días de crédito).

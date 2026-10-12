# Preguntas frecuentes

*Actualizado: 2026-10-10 · Corresponde a: v0.2, Fase 1*

Aquí están las dudas y los mensajes que más se repiten. Esta sección crece con los comentarios que nos envían.

## Si eres el dueño

Busca tu duda por el mensaje que ves en pantalla o por lo que querías hacer. Si no está, pulsa **Enviar comentario** y cuéntanos qué querías hacer. Así mejoramos el sistema y esta guía.

## Entrar y claves

### Me dice "Credenciales inválidas"

El correo o la clave no coinciden. Revisa, en este orden:

1. **Espacios al copiar.** Si copiaste y pegaste la clave (de un mensaje o un correo), puede traer un espacio al principio o al final que no se ve. Bórrala y escríbela a mano.
2. **Mayúsculas y minúsculas.** La clave distingue entre ellas. Revisa que no tengas el bloqueo de mayúsculas activado.
3. **El correo.** Debe ser exactamente el que te dio tu administrador.
4. Si sigue igual, pídele a tu administrador que restablezca tu clave en **Usuarios**.

Ojo: después de varios intentos fallidos seguidos, el acceso se bloquea unos minutos (ver la siguiente pregunta).

### Me dice "Demasiados intentos fallidos"

Por seguridad, tras varios intentos fallidos el acceso se bloquea un rato. Espera unos minutos o pide al administrador que te ayude.

1. Espera unos minutos. Intentar más no ayuda, solo lo alarga.
2. Mientras esperas, revisa tu clave (sin espacios).
3. Pasado el tiempo, escribe la clave despacio y pulsa **Entrar**.

Si no te acuerdas de tu clave, no esperes: pídele a tu administrador que la restablezca.

### El botón "Entrar" está gris

El correo debe tener la forma `nombre@empresa.com`, sin espacios, y la clave debe tener al menos 8 caracteres. Revisa si quedó un espacio al final del correo.

### Olvidé mi clave

Pídele a tu administrador que entre a **Configuración › Usuarios**, busque tu nombre y pulse **Restablecer contraseña**. Luego entra con la clave temporal y cámbiala en [Cambiar tu clave](/help/primeros-pasos#cambiar-tu-clave).

### "Tu sesión venció"

La sesión se cierra por seguridad después de un tiempo. Entra de nuevo.

## Encontrar y crear

### No encuentro dónde crear un cliente

Hay tres lugares:

1. **Desde el menú:** **Ventas y compras › Clientes y proveedores**, y pulsa **Nuevo cliente / proveedor**.
2. **Desde una factura:** debajo del campo **Cliente**, pulsa **Crear**.
3. **Desde un cobro o pago:** debajo del campo **Cliente** (o **Proveedor**), pulsa **Crear**.

Si no ves esos botones, tu rol no permite crear. Pídele a un administrador o contador que lo haga o que cambie tu rol.

[CAPTURA: factura nueva con el botón Crear marcado bajo el campo Cliente]

### Creé un cliente y no sale en la factura

1. Pulsa **Actualizar lista**, debajo del campo.
2. Revisa el tipo: en una venta solo salen **clientes** (o "Cliente y proveedor"); en una compra, solo **proveedores**.
3. Revisa que esté **Activo** en [Clientes y proveedores](/partners).

### No veo el botón "Nueva factura" o "Nuevo cobro o pago"

Solo el Administrador y el Contador pueden crearlos. Tu rol aparece debajo de tu nombre, arriba a la derecha.

### Una opción del menú no aparece

Algunas opciones dependen del rol. **Usuarios** solo la ve el administrador. **Saldos iniciales** solo el administrador y el contador.

### ¿Dónde está lo que antes se llamaba "Cuentas por cobrar y pagar"?

Ahora se llama **Lo que me deben y lo que debo**, en **Ventas y compras**. Es la misma pantalla. Aún puede mostrar el título anterior.

## Facturas

### No me deja emitir: "Elige el tipo de comprobante (NCF)"

Las ventas necesitan un tipo de comprobante. Elige **B01** (crédito fiscal, para empresas con RNC) o **B02** (consumo, para personas). Para no elegirlo cada vez, edita al cliente y llena **NCF por defecto**. Mira [Qué es el NCF](/help/facturas#que-es-el-ncf).

### "No hay secuencia configurada", "venció" o "Se agotó el rango"

Los números de comprobante (NCF) los autoriza la DGII en rangos con fecha de vencimiento. Este mensaje dice que ese tipo no existe, venció o se acabó.

1. Avísale a tu contadora.
2. Ella solicita un rango nuevo a la DGII y lo carga en [Comprobantes fiscales (NCF)](/ncf).
3. Vuelve a emitir la factura.

### No puedo editar una factura

Solo se editan los **borradores**. Una factura emitida ya tiene número, comprobante y registro contable. Corrígela con una nota de crédito o anúlala. Mira [Corregir un error](/help/facturas#corregir-un-error-nota-de-credito-nota-de-debito-o-anulacion).

### No puedo anular una factura

- "Tiene pagos aplicados": anula antes los cobros o pagos desde su detalle.
- Si no ves el botón **Anular**: solo el Administrador y el Aprobador anulan.
- Si pide un código: elige el **Código de anulación DGII**.

### Dice "El período fiscal … está cerrado"

El mes de esa fecha ya fue cerrado y no admite cambios. Usa una fecha de un mes abierto. Si de verdad hay que corregirlo, tu contadora debe reabrir el período en [Períodos fiscales](/fiscal-periods).

### "Falta la tasa de cambio"

La factura o el cobro está en dólares o euros y no hay tasa registrada para esa fecha. Escribe la tasa en el campo **Tasa de cambio** y guarda.

### "Excede el límite de crédito"

El cliente ya debe lo máximo que le permites. Que pague algo antes, o sube su **Límite de crédito** editándolo en Clientes y proveedores.

### "Las compras requieren el NCF del proveedor"

Escribe el NCF impreso en la factura del proveedor. Si no te dio comprobante, elige B11 o B13 en **Comprobante propio**.

### Dice "Configura la cuenta contable…" o "Falta configurar en Configuración contable"

Falta una cuenta automática en el sistema. No es algo que tú hayas hecho mal. Pídele a tu contadora que la complete en [Cuentas automáticas](/accounting-settings) o en [Impuestos](/tax-rates).

## Cobros y pagos

### El cobro no me deja aplicarlo a una factura

La factura debe: tener saldo, ser del mismo cliente o proveedor, y estar en la misma moneda que la cuenta o caja elegida. Revisa también que no hayas puesto más de lo que debe la factura.

### ¿Qué es un anticipo?

Es dinero que ya recibiste (o entregaste) y todavía no asignaste a ninguna factura. Se aplica después desde el detalle del cobro o pago.

### ¿Cómo sé quién me debe?

Entra a **Lo que me deben y lo que debo** y deja **Por cobrar (clientes)**. Verás cada cliente y cuánto lleva atrasado.

## Pantalla y ayuda

### Quiero quitar las ayudas

Pulsa tu nombre, arriba a la derecha, y enciende **Ocultar ayudas**. Para volver a verlas, apágalo. Mira [Ocultar las ayudas](/help/primeros-pasos#ocultar-las-ayudas).

### Un mensaje dice que un dato "no corresponde a esta pantalla"

La página quedó desactualizada. Recárgala con **Ctrl + R** y repite lo que hacías. Si sigue, envía un comentario.

### "No se pudo conectar con el servidor"

Se perdió la conexión. Revisa tu internet. No cierres la pantalla: lo que escribiste sigue ahí. Vuelve a intentar.

### Dice "Libros descuadrados"

Hay una diferencia entre débitos y créditos en el año. No lo arregles tú: avísale a tu contadora.

### No puedo subir un archivo adjunto

Solo se aceptan PDF, PNG, JPG, WEBP, XLSX, DOCX, CSV y TXT, y la extensión debe corresponder al contenido. Convierte el archivo a PDF.

### "Ya enviaste 20 comentarios en la última hora"

Es un límite para evitar envíos repetidos. Espera un rato y envía el siguiente.

## Si eres la contadora

- **Bloqueo de login**: tras varios intentos fallidos el acceso se bloquea un rato; espera unos minutos o pide al administrador que te ayude. El cambio de clave también tiene un límite de intentos.
- **Errores de configuración**: los mensajes "Falta configurar en Configuración contable: …" nombran la cuenta que falta; se resuelven en **Cuentas automáticas**. "No hay diario …" se resuelve creando los diarios por defecto en **Libros diarios**.
- **NCF**: una secuencia por tipo; solo se amplía su rango, y solo se renueva si está agotada o vencida.
- **Cierres**: un período no se cierra con asientos pendientes de aprobación, y un año cerrado bloquea todas sus fechas, tengan o no períodos.
- **Aprobación**: quien crea un asiento no lo puede aprobar.
- **Comprobante propio** (B11, B13) y ventas toman su NCF de la secuencia; las compras con NCF de proveedor lo validan por duplicado.

## Si algo sale mal

Si tu problema no está aquí, pulsa **Enviar comentario** y dinos qué intentabas hacer. Si es urgente y no puedes trabajar, avísale a tu administrador o a soporte, diciendo la pantalla, la hora y el mensaje exacto.

## En mejora

Esto es conocido o está planeado. No lo reportes como error:

- Se agregarán preguntas nuevas según los comentarios que se reciban.
- Las preguntas sobre bancos, asientos, cierres y reportes se agregarán cuando esas secciones del manual estén publicadas.

# Qué pedirle a cada proveedor de factura electrónica

El sistema ya arma el e-CF, lo envía, consulta su estado, reintenta y pasa a contingencia. Con estas respuestas se llena
`PLANTILLA_configuracion.json` y no hace falta programar nada. Si alguna respuesta no cabe (por ejemplo, otro protocolo
como SOAP, o que nosotros tengamos que firmar el XML), avisa: se agrega un adaptador nuevo en `src/ecf/providers/`.

| # | Pregunta | Dónde va |
|---|---|---|
| 1 | ¿Cuál es la URL de **pruebas** y la de **producción**? (tienen que ser `https`) | `baseUrl` |
| 2 | ¿Cómo nos identificamos? ¿Token fijo, usuario y clave, iniciar sesión para obtener un token temporal o API key? | campos de credenciales y `login` / `authHeader` |
| 3 | Si hay que iniciar sesión: ¿ruta, nombres de los campos de usuario y clave, campo del token y cuánto dura? | `login` |
| 4 | ¿El documento se envía en **JSON** o en **XML**? ¿Siguen el formato de la DGII o uno propio? ¿Va dentro de alguna propiedad? | `format`, `bodyWrap` |
| 5 | ¿Ruta para **enviar** un e-CF, para **consultar** su estado y para **anular** secuencias no usadas (ANECF)? | `sendPath`, `statusPath`, `voidPath` |
| 6 | ¿Hay una ruta para **probar la conexión**? | `checkPath` |
| 7 | En la respuesta, ¿cómo se llaman el **TrackId**, el **estado**, el **e-NCF**, el **código de seguridad**, el **mensaje** y el **XML firmado**? ¿Vienen dentro de otra propiedad? | `fields`, `responseRoot` |
| 8 | ¿Qué valores tiene el estado? (por ejemplo «Aceptado», «Rechazado») | `statusMap` |
| 9 | ¿Quién numera los e-NCF: nosotros con nuestras secuencias o ellos? | «¿Quién numera los e-NCF?» en la pantalla |
| 10 | ¿Ellos firman con el certificado digital de la empresa? (lo normal: sí, se lo subes a su portal) | si dicen que no, avisar |
| 11 | ¿Piden alguna cabecera fija (RNC, versión, id de cliente)? | `headers` |
| 12 | ¿Cuántos envíos por minuto permiten? ¿Qué devuelven cuando la DGII está caída? | contingencia (5xx/429 ya se reintentan) |
| 13 | ¿Nos dan un ambiente de pruebas con datos de ejemplo y su documentación (y los XSD)? | prueba antes de activar |

Para comparar los dos proveedores, anota también: precio por documento o plan mensual, soporte (horario y canal),
si se encargan del proceso de certificación ante la DGII y si entregan el RFCE (facturas de consumo menores de RD$250,000).

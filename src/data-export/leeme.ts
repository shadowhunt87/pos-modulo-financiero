/** LEEME.txt dentro del ZIP (ANEXO-S0 §4.3), en español sencillo. */
export const LEEME = `EXPORTACIÓN COMPLETA DE LOS DATOS DE TU EMPRESA
================================================

Qué hay en este archivo
- datos/: una hoja (CSV) por cada tabla del sistema: facturas, asientos, clientes, pagos, bancos, bitácora, etc.
- adjuntos/: los archivos que subiste (facturas escaneadas, soportes…), cada uno en una carpeta con su número interno.
- xml/: las facturas electrónicas (e-CF) en su formato original.
- manifest.json: el índice, con cuántas filas tiene cada hoja y la huella digital (SHA-256) de cada archivo.

Qué NO hay (a propósito)
- Claves de usuarios, credenciales bancarias, llaves de servicio y datos de la verificación en dos pasos.
- Los papeles de trabajo internos de la auditora (solo salen los hallazgos ya comunicados).

Cómo abrir las hojas en Excel sin perder ceros (RNC, NCF, cuentas)
1. Abre Excel con un libro en blanco.
2. Datos > Obtener datos > Desde texto/CSV, y elige la hoja.
3. Origen del archivo: 65001: Unicode (UTF-8). Delimitador: coma.
4. Pulsa «Transformar datos», marca las columnas de códigos y cámbialas a tipo «Texto». Luego «Cerrar y cargar».
Si abres el CSV con doble clic, Excel puede quitar ceros a la izquierda o cambiar números largos.

Textos que empiezan con = + - @
Para que Excel no los tome como fórmulas, se les antepuso un apóstrofo ('). Los montos negativos no se tocaron.

Cómo comprobar que nada se alteró
La huella SHA-256 de cada archivo está en manifest.json.
- Windows (PowerShell):  Get-FileHash .\\datos\\Invoice.csv -Algorithm SHA256
- macOS / Linux:         shasum -a 256 datos/Invoice.csv
Si la huella coincide con la del índice, el archivo está igual que cuando se exportó.

Aviso sobre los adjuntos
Los adjuntos .csv o .txt van tal cual los subiste: no tienen la protección contra fórmulas de las hojas de datos/.

Conservación
La ley obliga a conservar los registros contables y fiscales 10 años. Guarda este archivo en un lugar seguro:
contiene todos los datos de tu empresa.
`;

# Decisiones aprobadas por Carlos

> Registro de decisiones del módulo financiero. 2026-10-13: Carlos respondió **«acepto las recomendadas»** a todas las decisiones pendientes de la v0.3 y del anexo de verificación en dos pasos. Donde dice «confirmar», la decisión sigue válida pero una persona externa debe validarla.

| # | Tema | Decisión (la recomendada) | Confirmar con |
|---|---|---|---|
| D17 | Dónde va la copia de respaldo fuera del servidor | Backblaze B2, cifrada (rclone crypt) | — |
| D18 y D42 | Quién guarda la frase de los respaldos y la llave de la verificación en dos pasos | Carlos, las dos juntas, en un gestor de claves y en papel | — |
| D29 | Verificación en dos pasos, exportación completa y copia externa | Obligatorias en la v0.3 | — |
| D34 | Factura de mes cerrado o declarado | No se anula: se corrige con nota de crédito | — |
| D35 | Formatos 607/608 con regla no confirmada | Seguir generándolos, con una nota, hasta que la contadora confirme | Contadora |
| D36 | Números de e-NCF repetidos | Por tipo de comprobante: o se emite desde el sistema o se importa; la base de datos impide duplicados | — |
| D37 | Retención de ITBIS/ISR | Se calcula y se contabiliza al emitir la factura | **Contadora (antes de empezar la etapa 2)** |
| D38 | Fecha mínima de valores fiscales | 1 de enero de 2025 | — |
| D39 | Verificación en dos pasos antes que la factura electrónica | Sí | — |
| D40 | XML de factura electrónica importados | Se aceptan marcados «No verificado» | — |
| D41 | 2FA obligatorio para administradores | Sí, y se enciende solo cuando cada administrador la haya activado acompañado por Carlos | — |
| D43 | Rescate de un administrador único | Solo Carlos, llamando al teléfono que consta en el contrato (nunca al que den en la llamada). Se pedirá a cada cliente dos administradores | — |
| D44 | Librerías nuevas | Dos para el programa (código QR y archivo ZIP) y tres solo para las pruebas | — |
| D45 | Datos de un cliente que se va | Se guardan 90 días y se borran. La exportación se abre sin el sistema | Abogado o contadora |
| D46 | Nombre en la app del teléfono | «Finanzas» (o el nombre comercial cuando exista) | — |
| D47 | Papeles de trabajo de la auditora | No salen en la exportación del dueño, ni al cancelar | — |
| D48 | Entrega de la exportación a un cliente que se va | En persona (memoria USB) o por enlace con vencimiento, archivo cifrado y contraseña dicha por teléfono. Nunca por correo sin cifrar | — |
| — | Línea de v0.2 sobre la copia externa | Se actualiza para apuntar a la puerta de datos reales de la v0.3 | — |

## Sigue abierto (no es del módulo financiero o espera a una persona)
- Contadoras: retención del 30 % del ITBIS en facturas con repuestos y mano de obra, B14, y las demás de `docs/PREGUNTAS-CONTADORA.md`.
- Proveedor de factura electrónica y su documentación.
- Documentos de la DGII (XSD del e-CF, instructivos del 609, IT-1, IR-17) y feriados 2026–2027.
- Las 8 dudas del catálogo de cuentas de RD.

# Aviso al socio: archivos suyos que cambia N1 (corregir sin borrar)

*2026-10-14 · Para enviar antes de fusionar N1 a la rama principal.*

Hola. Para cumplir la regla de que lo contabilizado no se borra (R2, decisión D23 y D34), el paquete N1 cambia dos archivos
tuyos. Los cambios son pequeños y están cubiertos por pruebas (`test/immutability.e2e-spec.ts`).

| Archivo | Qué cambia | Por qué |
|---|---|---|
| `src/posting/posting.service.ts` | `voidEntry` ya no marca el asiento como anulado: crea un **reverso** (`type REVERSAL`, `reversalOfId`) con débitos y créditos invertidos. El original queda contabilizado con `voidedAt`, `voidedById` y `voidReason`. Nueva opción `reverseOn` para reversar en un mes abierto. El cierre de año (`CLOSING`) sigue como antes. | Que la anulación quede visible en los libros. |
| `src/invoicing/invoicing.service.ts` | `void`: una factura electrónica, de un mes cerrado o de un mes **ya declarado** (pasó el día 15 del mes siguiente) da 422 y guía a la nota de crédito. | Anularla cambiaría un 607 ya presentado. |

También cambian, sin tocar su lógica principal: `accounting.service.ts` (listado con `?reversed=true` y `reversedBy`),
`fiscal-year.service.ts` (dos líneas para ignorar aperturas reversadas) y `bank-reconciliation.service.ts`
(el par original + reverso no aparece como pendiente).

Pruebas tuyas que se ajustaron (antes esperaban el asiento borrado de los libros; ahora esperan el original y el reverso):
`test/invoicing-payments.e2e-spec.ts`, `test/accounting.e2e-spec.ts`, `test/Reports.e2e-spec.ts` y `test/entry-approval.e2e-spec.ts`.

Si tienes cambios en curso en esos archivos, avísame para unirlos sin pisarnos.

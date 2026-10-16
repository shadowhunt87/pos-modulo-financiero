import Decimal from 'decimal.js';
import { money } from '../../../../shared/format';
import { METHOD_LABEL, type PosTicket } from '../types';

const esc = (s: string | null | undefined) => (s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const DOC_NAME: Record<string, string> = {
  B01: 'Factura de crédito fiscal', B02: 'Factura de consumo', B14: 'Régimen especial', B15: 'Gubernamental',
  E31: 'Factura de crédito fiscal electrónica', E32: 'Factura de consumo electrónica',
};

/** Ticket de 80 mm en una ventana aparte (así se imprime solo el ticket, sin la pantalla de la caja). */
export function printTicket(t: PosTicket): void {
  const s = t.sale;
  const when = new Date(t.issuedAt).toLocaleString('es-DO', { timeZone: 'America/Santo_Domingo', dateStyle: 'short', timeStyle: 'short' });
  const lines = s.lines.map((l) => {
    const net = new Decimal(l.quantity).times(l.unitPrice).minus(l.discount).minus(l.promoDiscount);
    const disc = new Decimal(l.discount).plus(l.promoDiscount);
    return `<tr><td colspan="2">${esc(l.description)}</td></tr>
      <tr><td class="dim">${new Decimal(l.quantity).toString()} × ${money(l.unitPrice)}${disc.gt(0) ? ` <br>desc. −${money(disc.toFixed(2))}` : ''}</td><td class="r">${money(net.toFixed(2))}</td></tr>`;
  }).join('');
  const pays = s.payments.map((p) => `<tr><td>${METHOD_LABEL[p.method]}${p.tendered ? ` (recibido ${money(p.tendered)})` : ''}</td><td class="r">${money(p.amount)}</td></tr>`).join('');
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Ticket ${esc(s.number)}</title><style>
    @page { size: 80mm auto; margin: 4mm; } body { font: 12px/1.35 ui-monospace, Consolas, monospace; width: 72mm; margin: 0 auto; color: #000; }
    h1 { font-size: 14px; text-align: center; margin: 0 0 2px; } .c { text-align: center; } .r { text-align: right; white-space: nowrap; } .dim { color: #333; }
    table { width: 100%; border-collapse: collapse; } hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; } .tot td { font-weight: bold; font-size: 14px; }
  </style></head><body>
    <h1>${esc(t.company.legalName || t.company.name)}</h1>
    <div class="c">RNC ${esc(t.company.taxId)}${t.company.address ? `<br>${esc(t.company.address)}` : ''}${t.company.phone ? `<br>Tel. ${esc(t.company.phone)}` : ''}</div>
    <hr><div class="c"><strong>${esc(DOC_NAME[t.ncfType] ?? 'Comprobante')}</strong><br>NCF ${esc(s.ncf ?? 'pendiente')}</div>
    <hr>Ticket ${esc(s.number)} · Factura ${esc(s.invoiceNumber)}<br>${esc(when)}${t.cashier ? `<br>Cajero: ${esc(t.cashier)}` : ''}
    ${s.partner ? `<br>Cliente: ${esc(s.partner.name)}${s.partner.taxId ? ` · ${esc(s.partner.taxId)}` : ''}` : ''}
    <hr><table>${lines}</table><hr>
    <table>
      <tr><td>Subtotal</td><td class="r">${money(s.subtotal)}</td></tr>
      ${new Decimal(s.promoTotal).plus(s.discountTotal).gt(0) ? `<tr><td>Descuentos incluidos</td><td class="r">${money(new Decimal(s.promoTotal).plus(s.discountTotal).toFixed(2))}</td></tr>` : ''}
      <tr><td>ITBIS</td><td class="r">${money(s.taxTotal)}</td></tr>
      <tr class="tot"><td>TOTAL RD$</td><td class="r">${money(s.total)}</td></tr>
    </table><hr><table>${pays}${new Decimal(s.changeGiven).gt(0) ? `<tr><td>Cambio</td><td class="r">${money(s.changeGiven)}</td></tr>` : ''}</table>
    ${t.ecf?.securityCode ? `<hr><div class="c">Código de seguridad: ${esc(t.ecf.securityCode)}</div>` : ''}
    ${s.status === 'VOIDED' ? '<hr><div class="c"><strong>*** ANULADA ***</strong></div>' : ''}
    <hr><div class="c">${esc(t.footer ?? 'Gracias por su compra')}</div>
    <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 300); };</script>
  </body></html>`;
  const w = window.open('', '_blank', 'width=420,height=640');
  if (!w) return;
  w.document.open(); w.document.write(html); w.document.close();
}

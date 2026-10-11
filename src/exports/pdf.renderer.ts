import PDFDocument from 'pdfkit';
import { cellFmt, cellValue, type Cell, type Column, type Fmt, type TableDoc } from './table-doc.js';

const ROW_H = 15;
const FONT = 'Helvetica';
const FONT_BOLD = 'Helvetica-Bold';

/** Helvetica estándar solo tiene WinAnsi: lo que no exista ahí se cambia por '?' en vez de salir corrupto. */
const WIN_ANSI_EXTRA = new Set([0x20ac, 0x2013, 0x2014, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2026]);
const clean = (s: string) =>
  [...s.replace(/[\r\n\t]+/g, ' ')].map((ch) => {
    const cp = ch.codePointAt(0)!;
    return cp < 0x20 ? ' ' : cp <= 0xff || WIN_ANSI_EXTRA.has(cp) ? ch : '?';
  }).join('');

const fmtNumber = (v: number, fmt: Fmt) => {
  const f = (d: number) => v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  switch (fmt) {
    case 'money': return f(2);
    case 'int': return f(0);
    case 'percent': return `${f(2)}%`;
    case 'ratio': return f(2);
    case 'days': return f(1);
    default: return String(v);
  }
};
const show = (c: Cell, col: Column) => {
  const v = cellValue(c);
  if (v === null || v === '') return '';
  return typeof v === 'number' ? fmtNumber(v, cellFmt(c, col)) : clean(v);
};

export async function renderPdf(doc: TableDoc, opts: { compress?: boolean } = {}): Promise<Buffer> {
  // Solo las columnas imprimibles; si quedan muchas, hoja horizontal
  const visible = doc.sections.map((s) => s.columns.map((c, i) => (c.xlsxOnly ? -1 : i)).filter((i) => i >= 0));
  const landscape = visible.some((v) => v.length > 5);

  const pdf = new PDFDocument({
    size: 'A4', layout: landscape ? 'landscape' : 'portrait', margin: 36, bufferPages: true,
    compress: opts.compress ?? true,
    info: { Title: clean(doc.title), Author: clean(doc.company.name) },
  });
  const chunks: Buffer[] = [];
  pdf.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);
  });

  const left = pdf.page.margins.left;
  const width = pdf.page.width - left - pdf.page.margins.right;
  const bottom = pdf.page.height - pdf.page.margins.bottom - 18; // deja espacio al pie
  const fit = (text: string, w: number) => {
    if (pdf.widthOfString(text) <= w) return text;
    let lo = 0, hi = text.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (pdf.widthOfString(text.slice(0, mid) + '...') <= w) lo = mid; else hi = mid - 1;
    }
    return text.slice(0, lo) + '...';
  };

  const titleBlock = () => {
    pdf.font(FONT_BOLD).fontSize(12).fillColor('#000').text(clean(doc.company.name + (doc.company.taxId ? `  -  RNC ${doc.company.taxId}` : '')), left, pdf.y, { width });
    pdf.fontSize(14).text(clean(doc.title), left, pdf.y, { width });
    if (doc.subtitle) pdf.font(FONT).fontSize(9).text(clean(doc.subtitle), left, pdf.y, { width });
    pdf.moveDown(0.6);
  };
  titleBlock();

  doc.sections.forEach((section, si) => {
    const idx = visible[si];
    const cols = idx.map((i) => section.columns[i]);
    const totalW = cols.reduce((s, c) => s + (c.w ?? 1), 0);
    const widths = cols.map((c) => (width * (c.w ?? 1)) / totalW);
    const xs = widths.map((_, i) => left + widths.slice(0, i).reduce((s, w) => s + w, 0));

    if (pdf.y + 60 > bottom) pdf.addPage();
    if (doc.sections.length > 1) pdf.font(FONT_BOLD).fontSize(11).fillColor('#000').text(clean(section.title), left, pdf.y, { width });
    pdf.moveDown(0.3);

    const drawHeader = () => {
      const y = pdf.y;
      pdf.rect(left, y, width, ROW_H + 2).fill('#1F3A5F');
      pdf.fillColor('#fff').font(FONT_BOLD).fontSize(8);
      cols.forEach((c, i) => {
        const right = !!c.fmt && c.fmt !== 'text';
        pdf.text(fit(clean(c.header), widths[i] - 6), xs[i] + 3, y + 5, { width: widths[i] - 6, lineBreak: false, align: right ? 'right' : 'left' });
      });
      pdf.y = y + ROW_H + 2;
    };
    const drawRow = (cells: Cell[], bold: boolean, shade: boolean, topLine = false) => {
      if (pdf.y + ROW_H > bottom) {
        pdf.addPage();
        drawHeader();
      }
      const y = pdf.y;
      if (shade) pdf.rect(left, y, width, ROW_H).fill('#F1F4F8');
      if (topLine) pdf.moveTo(left, y).lineTo(left + width, y).lineWidth(0.8).stroke('#000');
      pdf.fillColor('#000').font(bold ? FONT_BOLD : FONT).fontSize(8);
      idx.forEach((ci, i) => {
        const cell = cells[ci];
        const right = cellFmt(cell, section.columns[ci]) !== 'text';
        pdf.text(fit(show(cell, section.columns[ci]), widths[i] - 6), xs[i] + 3, y + 4, { width: widths[i] - 6, lineBreak: false, align: right ? 'right' : 'left' });
      });
      pdf.y = y + ROW_H;
    };

    drawHeader();
    section.rows.forEach((r, i) => drawRow(r.cells, !!r.bold, i % 2 === 1));
    if (section.totals) drawRow(section.totals, true, false, true);
    if (!section.rows.length && !section.totals) {
      pdf.font(FONT).fontSize(8).fillColor('#555').text('Sin datos para el período', left + 3, pdf.y + 4, { width });
      pdf.y += ROW_H;
    }
    if (section.notes?.length) {
      pdf.moveDown(0.6);
      pdf.font(FONT).fontSize(8).fillColor('#555');
      for (const n of section.notes) {
        const text = clean(n);
        if (pdf.y + pdf.heightOfString(text, { width }) > bottom) pdf.addPage();
        pdf.text(text, left, pdf.y, { width });
        pdf.moveDown(0.2);
      }
    }
    pdf.moveDown(1);
  });

  // Pie con numeración (se escribe al final, cuando ya se sabe el total de páginas)
  const range = pdf.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    pdf.switchToPage(i);
    pdf.page.margins.bottom = 0; // si no, escribir en el margen inferior crea una página nueva
    pdf.font(FONT).fontSize(8).fillColor('#666');
    pdf.text(`Generado ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`, left, pdf.page.height - 30, { width: width / 2, lineBreak: false });
    pdf.text(`Pagina ${i + 1} de ${range.count}`, left + width / 2, pdf.page.height - 30, { width: width / 2, align: 'right', lineBreak: false });
  }
  pdf.end();
  return done;
}

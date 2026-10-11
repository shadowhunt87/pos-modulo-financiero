import ExcelJS from 'exceljs';
import { XLSX_NUMFMT, cellFmt, cellValue, type TableDoc } from './table-doc.js';

const safeSheetName = (raw: string, used: Set<string>) => {
  let base = raw.replace(/[\\/*?:[\]]/g, ' ').trim().slice(0, 31) || 'Hoja';
  let name = base;
  for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base.slice(0, 31 - String(i).length - 1)} ${i}`;
  used.add(name.toLowerCase());
  return name;
};

/** Una hoja por sección. Cifras como NÚMEROS con formato (no texto); los textos se guardan como texto (nunca como fórmula). */
export async function renderXlsx(doc: TableDoc): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = doc.company.name;
  wb.created = new Date();
  const used = new Set<string>();

  for (const section of doc.sections) {
    const ws = wb.addWorksheet(safeSheetName(section.title, used));
    const cols = section.columns;
    const last = cols.length;

    const head = (text: string, bold: boolean, size: number) => {
      const r = ws.addRow([text]);
      r.getCell(1).font = { bold, size };
      if (last > 1) ws.mergeCells(r.number, 1, r.number, last);
    };
    head(doc.company.name + (doc.company.taxId ? `  -  RNC ${doc.company.taxId}` : ''), true, 12);
    head(doc.title, true, 14);
    if (doc.subtitle) head(doc.subtitle, false, 10);
    if (doc.sections.length > 1) head(section.title, true, 11);
    ws.addRow([]);

    const headerRow = ws.addRow(cols.map((c) => c.header));
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.alignment = { vertical: 'middle', wrapText: true };
    headerRow.eachCell((c, i) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3A5F' } };
      if (cols[i - 1].fmt && cols[i - 1].fmt !== 'text') c.alignment = { horizontal: 'right', vertical: 'middle', wrapText: true };
    });
    ws.views = [{ state: 'frozen', ySplit: headerRow.number }];

    const widths = cols.map((c) => Math.max(c.header.length + 2, 10) * (c.w && c.w > 1 ? 1.4 : 1));
    const put = (cells: (typeof section.rows)[number]['cells'], bold: boolean) => {
      const row = ws.addRow(cells.map((c) => cellValue(c)));
      cells.forEach((c, i) => {
        const cell = row.getCell(i + 1);
        const fmt = cellFmt(c, cols[i]);
        const nf = XLSX_NUMFMT[fmt];
        if (nf && typeof cellValue(c) === 'number') {
          cell.numFmt = nf;
          cell.alignment = { horizontal: 'right' };
        }
        if (bold) cell.font = { bold: true };
        const v = cellValue(c);
        const len = typeof v === 'number' ? 14 : String(v ?? '').length + 2;
        widths[i] = Math.min(Math.max(widths[i], len), 60);
      });
      return row;
    };
    for (const r of section.rows) put(r.cells, !!r.bold);
    if (section.totals) {
      const t = put(section.totals, true);
      t.eachCell((c) => {
        c.border = { top: { style: 'thin' }, bottom: { style: 'double' } };
      });
    }
    if (section.notes?.length) {
      ws.addRow([]);
      for (const n of section.notes) {
        const r = ws.addRow([n]);
        r.getCell(1).font = { italic: true, color: { argb: 'FF555555' } };
        if (last > 1) ws.mergeCells(r.number, 1, r.number, last);
        r.getCell(1).alignment = { wrapText: true, vertical: 'top' };
        r.height = Math.max(15, Math.ceil(n.length / 110) * 15);
      }
    }
    cols.forEach((_, i) => (ws.getColumn(i + 1).width = widths[i]));
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

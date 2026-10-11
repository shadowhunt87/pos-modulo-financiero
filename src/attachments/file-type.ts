import { BadRequestException } from '@nestjs/common';

export interface DetectedFile {
  mimeType: string;
  ext: string;
}

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const startsWith = (b: Buffer, sig: number[]) => b.length >= sig.length && sig.every((v, i) => b[i] === v);

/**
 * Tipo REAL por los primeros bytes (no por lo que diga el cliente). Debe coincidir con la
 * extensión del nombre. No se admite SVG/HTML/JS: servirían contenido activo desde nuestro dominio.
 */
export function detectFile(buf: Buffer, fileName: string): DetectedFile {
  const ext = (fileName.match(/\.([A-Za-z0-9]{1,5})$/)?.[1] ?? '').toLowerCase();
  const fail = (): never => {
    throw new BadRequestException(
      'Tipo de archivo no permitido. Se aceptan: PDF, PNG, JPG, WEBP, XLSX, DOCX, CSV y TXT (y la extensión debe coincidir con el contenido)',
    );
  };

  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46, 0x2d])) return ext === 'pdf' ? { mimeType: 'application/pdf', ext } : fail();
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return ext === 'png' ? { mimeType: 'image/png', ext } : fail();
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return ext === 'jpg' || ext === 'jpeg' ? { mimeType: 'image/jpeg', ext } : fail();
  if (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && buf.length >= 12 && buf.subarray(8, 12).toString('latin1') === 'WEBP') {
    return ext === 'webp' ? { mimeType: 'image/webp', ext } : fail();
  }
  if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04])) {
    if (ext === 'xlsx') return { mimeType: XLSX, ext };
    if (ext === 'docx') return { mimeType: DOCX, ext };
    return fail();
  }
  if (ext === 'csv' || ext === 'txt') {
    // Texto: sin bytes nulos (binario disfrazado) y UTF-8 válido
    if (buf.subarray(0, 8000).includes(0)) return fail();
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(buf);
    } catch {
      return fail();
    }
    return { mimeType: ext === 'csv' ? 'text/csv' : 'text/plain', ext };
  }
  return fail();
}

/** Nombre seguro para guardar/mostrar. multer entrega originalname como latin1: se recupera el UTF-8. */
export function sanitizeFileName(raw: string): string {
  let name = raw;
  const utf8 = Buffer.from(raw, 'latin1').toString('utf8');
  if (!utf8.includes('\uFFFD')) name = utf8;
  name = name.split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  name = name.replace(/[\u0000-\u001f\u007f"<>|?*:]/g, '_').replace(/\s+/g, ' ').trim().replace(/^\.+/, '');
  if (name.length > 150) {
    const dot = name.lastIndexOf('.');
    const ext = dot > 0 ? name.slice(dot) : '';
    name = name.slice(0, 150 - ext.length) + ext;
  }
  return name || 'archivo';
}

/** Content-Disposition con nombre ASCII de respaldo + nombre real en UTF-8 (RFC 5987). */
export function contentDisposition(fileName: string) {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName).replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())}`;
}

/** Lo único que usamos del archivo que entrega multer (memoria). */
export interface UploadedFileLike {
  originalname: string;
  size: number;
  buffer: Buffer;
}
